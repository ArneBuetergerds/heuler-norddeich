import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { adminActionLog, blockedPeriod, bookingRequest, invoice } from "./schema";
import { isoDay, logAdminAction } from "./adminActionLog";
import { SYSTEM_ACTOR } from "../lib/adminActions";
import {
  adminDeletionDecision,
  ANONYMIZED_PLACEHOLDER,
  addDays,
  berlinDay,
  planRetention,
  previewRetention,
  RETENTION_PREVIEW_DAYS,
  retentionPrefilter,
  type RetentionPreviewEntry,
} from "../lib/retention";

export const REQUEST_NOT_FOUND_ERROR = "Anfrage nicht gefunden";
export const STAY_AHEAD_ERROR =
  "Die Buchung ist bestätigt und die Abreise liegt in der Zukunft. Bitte den Aufenthalt zuerst stornieren.";
export const REQUEST_ALREADY_ANONYMIZED_ERROR =
  "Die Anfrage ist bereits anonymisiert. Die Rechnung muss bis zum Ablauf ihrer Frist aufbewahrt werden.";

type Db = typeof import("./client").db;

/** Was eine Anonymisierung überschreibt: alles, was den Gast identifiziert. */
function anonymizedValues(now: Date) {
  return {
    name: ANONYMIZED_PLACEHOLDER,
    email: ANONYMIZED_PLACEHOLDER,
    phone: null,
    // Die Rechnungsanschrift steht, solange sie aufzubewahren ist, in der
    // Rechnung selbst (Snapshot); an der Anfrage wird sie nicht mehr gebraucht.
    street: null,
    postalCode: null,
    city: null,
    country: null,
    message: null,
    // Freitext an den Gast, kann Persönliches enthalten.
    reasonNote: null,
    // Bewusst nicht geleert: `termsAcceptedAt` und `termsVersion` (Zeitpunkt
    // und Stand der bestätigten Mietbedingungen). Ohne Name und Kontaktdaten
    // lassen sie auf niemanden schließen, belegen aber, unter welchen
    // Bedingungen die Buchung zur aufbewahrten Rechnung zustande kam.
    anonymizedAt: now,
  };
}

/**
 * Admin-Aktion „Löschen“: löscht eine Anfrage oder anonymisiert sie, wenn
 * eine aufzubewahrende Rechnung daran hängt. Regeln: `adminDeletionDecision`.
 *
 * `today`: heutiger Kalendertag nach deutscher Zeit (UTC-Mitternacht), siehe
 * `berlinDay`.
 */
export async function deleteBookingRequest(
  db: Pick<Db, "transaction">,
  id: number,
  actor: string,
  today: Date,
  now: Date = new Date(),
): Promise<"deleted" | "anonymized"> {
  return db.transaction(async (tx) => {
    // Sperrend gelesen: Eine gleichzeitige Bestätigung oder Rechnung soll
    // nicht zwischen Prüfung und Löschen fallen.
    const [request] = await tx
      .select({
        id: bookingRequest.id,
        status: bookingRequest.status,
        startDate: bookingRequest.startDate,
        endDate: bookingRequest.endDate,
        anonymizedAt: bookingRequest.anonymizedAt,
      })
      .from(bookingRequest)
      .where(eq(bookingRequest.id, id))
      .for("update");
    if (!request) {
      throw new Error(REQUEST_NOT_FOUND_ERROR);
    }

    const [existingInvoice] = await tx
      .select({ id: invoice.id })
      .from(invoice)
      .where(eq(invoice.bookingRequestId, id))
      .for("update");

    const details = {
      status: request.status,
      startDate: isoDay(request.startDate),
      endDate: isoDay(request.endDate),
    };

    switch (adminDeletionDecision(request, existingInvoice !== undefined, today)) {
      case "stay_ahead":
        throw new Error(STAY_AHEAD_ERROR);
      case "already_anonymized":
        throw new Error(REQUEST_ALREADY_ANONYMIZED_ERROR);
      case "anonymize":
        await tx
          .update(bookingRequest)
          .set(anonymizedValues(now))
          .where(eq(bookingRequest.id, id));
        await logAdminAction(tx, {
          actor,
          action: "request_anonymize",
          bookingRequestId: id,
          details,
        });
        return "anonymized";
      case "delete":
        // Der Kalendereintrag einer vergangenen Buchung ginge auch per
        // Cascade mit; ausdrücklich gelöscht ist es unabhängig vom Schema.
        await tx.delete(blockedPeriod).where(eq(blockedPeriod.bookingRequestId, id));
        await tx.delete(bookingRequest).where(eq(bookingRequest.id, id));
        await logAdminAction(tx, { actor, action: "request_delete", bookingRequestId: id, details });
        return "deleted";
    }
  });
}

/**
 * Bedingungen, mit denen die Datenbank die Kandidaten der Löschung am Stichtag
 * `day` vorfiltert (Grenzen: `retentionPrefilter`). Nur `and`-Vergleiche und
 * `is null`, je Datenart eine Abfrage statt einer mit `or`: So bleibt jede
 * Abfrage einfach, und die Fake-DB der Tests (fakeConditions.ts) versteht sie.
 * Die Mengen sind disjunkt, keine Zeile kommt doppelt.
 */
function candidateConditions(day: Date) {
  const bounds = retentionPrefilter(day);
  return {
    requests: [
      and(
        eq(bookingRequest.status, "pending"),
        lt(bookingRequest.createdAt, bounds.pendingCreatedBefore),
      ),
      and(
        eq(bookingRequest.status, "declined"),
        lt(bookingRequest.decidedAt, bounds.declinedBefore),
      ),
      // Altbestand ohne `decided_at`: Die Frist läuft ab Eingang.
      and(
        eq(bookingRequest.status, "declined"),
        isNull(bookingRequest.decidedAt),
        lt(bookingRequest.createdAt, bounds.declinedBefore),
      ),
      and(
        eq(bookingRequest.status, "confirmed"),
        lt(bookingRequest.endDate, bounds.bookingEndBefore),
      ),
    ],
    internalStays: and(
      eq(blockedPeriod.kind, "internal"),
      lt(blockedPeriod.endDate, bounds.internalEndBefore),
    ),
    legacyStays: and(
      eq(blockedPeriod.kind, "legacy_stay"),
      lt(blockedPeriod.endDate, bounds.bookingEndBefore),
    ),
  };
}

/**
 * Isolationsstufe des Löschlaufs. Unter MySQLs Voreinstellung (REPEATABLE
 * READ) sperrt `SELECT … FOR UPDATE` ohne passenden Index jede durchsuchte
 * Zeile, nicht nur die gefundenen – die Vorfilter brächten dann nichts.
 * Unter READ COMMITTED gibt InnoDB die Sperren nicht passender Zeilen nach
 * Prüfung der Bedingung wieder frei und setzt keine Lückensperren. Für den
 * Lauf genügt das: Er liest seine Kandidaten sperrend, entscheidet und
 * löscht nach ID; neu hinzukommende Zeilen sind nie schon abgelaufen.
 */
const PURGE_TRANSACTION_CONFIG = { isolationLevel: "read committed" } as const;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Liest die Kandidaten der Löschung am Stichtag `today` sperrend, ohne
 * Gastdaten. Nur vorgefilterte Zeilen werden gelesen und gesperrt; was davon
 * wirklich fällig ist, entscheidet `planRetention`.
 *
 * Reihenfolge der Sperren wie bisher und wie bei den Admin-Aktionen
 * (`deleteBookingRequest`: erst Anfrage, dann Rechnung): erst
 * `booking_request`, dann `invoice`, dann `blocked_period`. Eine andere
 * Reihenfolge könnte mit einer gleichzeitigen Admin-Aktion verklemmen.
 */
async function lockRetentionCandidates(tx: Tx, today: Date) {
  const conditions = candidateConditions(today);

  const requests = [];
  for (const condition of conditions.requests) {
    requests.push(
      ...(await tx
        .select({
          id: bookingRequest.id,
          status: bookingRequest.status,
          createdAt: bookingRequest.createdAt,
          decidedAt: bookingRequest.decidedAt,
          endDate: bookingRequest.endDate,
          anonymizedAt: bookingRequest.anonymizedAt,
        })
        .from(bookingRequest)
        .where(condition)
        .for("update")),
    );
  }

  // Rechnungen nur der Kandidaten: Ob eine Anfrage gelöscht oder anonymisiert
  // wird, hängt daran, ob es eine Rechnung gibt; Rechnungen nicht fälliger
  // Anfragen fasst `planRetention` nie an.
  const requestIds = requests.map((request) => request.id);
  const invoices =
    requestIds.length === 0
      ? []
      : await tx
          .select({
            id: invoice.id,
            bookingRequestId: invoice.bookingRequestId,
            year: invoice.year,
          })
          .from(invoice)
          .where(inArray(invoice.bookingRequestId, requestIds))
          .for("update");

  const stayColumns = { id: blockedPeriod.id, endDate: blockedPeriod.endDate };
  const internalStays = await tx
    .select(stayColumns)
    .from(blockedPeriod)
    .where(conditions.internalStays)
    .for("update");
  // Altbestand manueller Aufenthalte (nur Gastname). Belegungen von Buchungen
  // laufen über ihre Anfrage, Sperrzeiträume bleiben.
  const manualStays = await tx
    .select(stayColumns)
    .from(blockedPeriod)
    .where(conditions.legacyStays)
    .for("update");

  return { requests, invoices, manualStays, internalStays };
}

/**
 * Was die automatische Löschung in den nächsten `horizonDays` Tagen tun wird
 * (siehe `previewRetention`), für die Admin-Seite „Löschfristen“. Liest ohne
 * Sperre mit denselben Vorfiltern wie der Lauf, Stichtag `today + horizonDays`.
 *
 * `today`: heutiger Kalendertag nach deutscher Zeit, siehe `berlinDay`.
 */
export async function getRetentionPreview(
  db: Pick<Db, "select">,
  today: Date,
  horizonDays: number = RETENTION_PREVIEW_DAYS,
): Promise<RetentionPreviewEntry[]> {
  const conditions = candidateConditions(addDays(today, horizonDays));

  const requestGroups = await Promise.all(
    conditions.requests.map((condition) =>
      db
        .select({
          id: bookingRequest.id,
          name: bookingRequest.name,
          status: bookingRequest.status,
          createdAt: bookingRequest.createdAt,
          decidedAt: bookingRequest.decidedAt,
          startDate: bookingRequest.startDate,
          endDate: bookingRequest.endDate,
          anonymizedAt: bookingRequest.anonymizedAt,
        })
        .from(bookingRequest)
        .where(condition),
    ),
  );
  const requests = requestGroups.flat();
  const requestIds = requests.map((request) => request.id);

  const stayColumns = {
    id: blockedPeriod.id,
    startDate: blockedPeriod.startDate,
    endDate: blockedPeriod.endDate,
    note: blockedPeriod.note,
    guestName: blockedPeriod.guestName,
  };
  const [invoices, internalStays, legacyStays] = await Promise.all([
    requestIds.length === 0
      ? []
      : db
          .select({
            id: invoice.id,
            bookingRequestId: invoice.bookingRequestId,
            year: invoice.year,
          })
          .from(invoice)
          .where(inArray(invoice.bookingRequestId, requestIds)),
    db.select(stayColumns).from(blockedPeriod).where(conditions.internalStays),
    db.select(stayColumns).from(blockedPeriod).where(conditions.legacyStays),
  ]);

  return previewRetention(
    {
      requests,
      invoices,
      internalStays: internalStays.map(({ id, startDate, endDate, note }) => ({
        id,
        startDate,
        endDate,
        label: note,
      })),
      legacyStays: legacyStays.map(({ id, startDate, endDate, guestName }) => ({
        id,
        startDate,
        endDate,
        label: guestName,
      })),
    },
    today,
    horizonDays,
  );
}

/** Ergebnis eines Laufs der automatischen Löschung – nur Anzahlen. */
export type PurgeCounts = {
  requestsDeleted: number;
  requestsAnonymized: number;
  invoicesDeleted: number;
  /** Altbestand manueller Aufenthalte (nur Gastname). */
  manualStaysDeleted: number;
  internalStaysDeleted: number;
  logEntriesDeleted: number;
};

/**
 * Automatische Löschung nach den Fristen aus src/lib/retention.ts, alles in
 * einer Transaktion: Entweder ist der Lauf ganz durch oder gar nicht.
 *
 * Was zu tun ist, entscheidet die reine Funktion `planRetention`; hier wird
 * nur gelesen (ohne Gastdaten, nur vorgefilterte Kandidaten, siehe
 * `lockRetentionCandidates`) und ausgeführt. Am Ende steht ein
 * Protokolleintrag `purge` mit den Anzahlen, auch wenn nichts fällig war –
 * so ist nachweisbar, dass die Löschung läuft.
 */
export async function purgeExpiredData(
  db: Pick<Db, "transaction">,
  now: Date = new Date(),
): Promise<PurgeCounts> {
  const today = berlinDay(now);

  return db.transaction(async (tx) => {
    const { requests, invoices, manualStays, internalStays } = await lockRetentionCandidates(
      tx,
      today,
    );

    const plan = planRetention({ requests, invoices, manualStays, internalStays }, today);

    // Reihenfolge zählt: Rechnungen zuerst, ihr Fremdschlüssel verhindert
    // sonst das Löschen der Anfrage.
    if (plan.deleteInvoiceIds.length > 0) {
      await tx.delete(invoice).where(inArray(invoice.id, plan.deleteInvoiceIds));
    }
    if (plan.deleteRequestIds.length > 0) {
      await tx
        .delete(blockedPeriod)
        .where(inArray(blockedPeriod.bookingRequestId, plan.deleteRequestIds));
      await tx.delete(bookingRequest).where(inArray(bookingRequest.id, plan.deleteRequestIds));
    }
    if (plan.anonymizeRequestIds.length > 0) {
      await tx
        .update(bookingRequest)
        .set(anonymizedValues(now))
        .where(inArray(bookingRequest.id, plan.anonymizeRequestIds));
    }
    if (plan.deleteManualStayIds.length > 0) {
      await tx.delete(blockedPeriod).where(inArray(blockedPeriod.id, plan.deleteManualStayIds));
    }
    if (plan.deleteInternalStayIds.length > 0) {
      await tx.delete(blockedPeriod).where(inArray(blockedPeriod.id, plan.deleteInternalStayIds));
    }

    const expiredLogs = await tx
      .select({ id: adminActionLog.id })
      .from(adminActionLog)
      .where(lt(adminActionLog.createdAt, plan.actionLogCutoff));
    if (expiredLogs.length > 0) {
      await tx.delete(adminActionLog).where(
        inArray(
          adminActionLog.id,
          expiredLogs.map((entry) => entry.id),
        ),
      );
    }

    const counts: PurgeCounts = {
      requestsDeleted: plan.deleteRequestIds.length,
      requestsAnonymized: plan.anonymizeRequestIds.length,
      invoicesDeleted: plan.deleteInvoiceIds.length,
      manualStaysDeleted: plan.deleteManualStayIds.length,
      internalStaysDeleted: plan.deleteInternalStayIds.length,
      logEntriesDeleted: expiredLogs.length,
    };

    await logAdminAction(tx, { actor: SYSTEM_ACTOR, action: "purge", details: counts });

    return counts;
  }, PURGE_TRANSACTION_CONFIG);
}

/** Logzeile zu einem Lauf: nur Anzahlen, keine personenbezogenen Daten. */
export function purgeLogMessage(counts: PurgeCounts): string {
  return (
    "Automatische Löschung: " +
    `${counts.requestsDeleted} Anfragen gelöscht, ` +
    `${counts.requestsAnonymized} anonymisiert, ` +
    `${counts.invoicesDeleted} Rechnungen gelöscht, ` +
    `${counts.manualStaysDeleted} manuelle Aufenthalte gelöscht, ` +
    `${counts.internalStaysDeleted} interne Belegungen gelöscht, ` +
    `${counts.logEntriesDeleted} Protokolleinträge gelöscht`
  );
}

/** Der jüngste Lauf der automatischen Löschung laut Protokoll. */
export type LastPurgeRun = { at: Date; counts: PurgeCounts };

const PURGE_COUNT_KEYS = [
  "requestsDeleted",
  "requestsAnonymized",
  "invoicesDeleted",
  "manualStaysDeleted",
  "internalStaysDeleted",
  "logEntriesDeleted",
] as const satisfies readonly (keyof PurgeCounts)[];

/**
 * Jüngster Protokolleintrag `purge` mit Zeitpunkt und Anzahlen, `null`, wenn
 * es noch keinen gibt. Fehlt eine Anzahl (ältere Einträge kennen etwa
 * `internalStaysDeleted` noch nicht), zählt sie als 0.
 */
export async function getLastPurgeRun(db: Pick<Db, "select">): Promise<LastPurgeRun | null> {
  const [entry] = await db
    .select({ createdAt: adminActionLog.createdAt, details: adminActionLog.details })
    .from(adminActionLog)
    .where(eq(adminActionLog.action, "purge"))
    .orderBy(desc(adminActionLog.createdAt), desc(adminActionLog.id))
    .limit(1);
  if (!entry) {
    return null;
  }
  const details = entry.details ?? {};
  const counts = Object.fromEntries(
    PURGE_COUNT_KEYS.map((key) => {
      const value = details[key];
      return [key, typeof value === "number" ? value : 0];
    }),
  ) as PurgeCounts;
  return { at: entry.createdAt, counts };
}
