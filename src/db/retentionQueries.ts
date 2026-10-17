import { eq, inArray, lt } from "drizzle-orm";
import { adminActionLog, blockedPeriod, bookingRequest, invoice } from "./schema";
import { isoDay, logAdminAction } from "./adminActionLog";
import { SYSTEM_ACTOR } from "../lib/adminActions";
import {
  adminDeletionDecision,
  ANONYMIZED_PLACEHOLDER,
  berlinDay,
  planRetention,
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
    message: null,
    // Freitext an den Gast, kann Persönliches enthalten.
    reasonNote: null,
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

/** Ergebnis eines Laufs der automatischen Löschung – nur Anzahlen. */
export type PurgeCounts = {
  requestsDeleted: number;
  requestsAnonymized: number;
  invoicesDeleted: number;
  manualStaysDeleted: number;
  logEntriesDeleted: number;
};

/**
 * Automatische Löschung nach den Fristen aus src/lib/retention.ts, alles in
 * einer Transaktion: Entweder ist der Lauf ganz durch oder gar nicht.
 *
 * Was zu tun ist, entscheidet die reine Funktion `planRetention`; hier wird
 * nur gelesen (ohne Gastdaten) und ausgeführt. Am Ende steht ein
 * Protokolleintrag `purge` mit den Anzahlen, auch wenn nichts fällig war –
 * so ist nachweisbar, dass die Löschung läuft.
 */
export async function purgeExpiredData(
  db: Pick<Db, "transaction">,
  now: Date = new Date(),
): Promise<PurgeCounts> {
  const today = berlinDay(now);

  return db.transaction(async (tx) => {
    const requests = await tx
      .select({
        id: bookingRequest.id,
        status: bookingRequest.status,
        createdAt: bookingRequest.createdAt,
        decidedAt: bookingRequest.decidedAt,
        endDate: bookingRequest.endDate,
        anonymizedAt: bookingRequest.anonymizedAt,
      })
      .from(bookingRequest)
      .for("update");
    const invoices = await tx
      .select({ id: invoice.id, bookingRequestId: invoice.bookingRequestId, year: invoice.year })
      .from(invoice)
      .for("update");
    const periods = await tx
      .select({
        id: blockedPeriod.id,
        endDate: blockedPeriod.endDate,
        guestName: blockedPeriod.guestName,
        bookingRequestId: blockedPeriod.bookingRequestId,
      })
      .from(blockedPeriod)
      .for("update");
    const manualStays = periods
      .filter((period) => period.guestName !== null && period.bookingRequestId === null)
      .map(({ id, endDate }) => ({ id, endDate }));

    const plan = planRetention({ requests, invoices, manualStays }, today);

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
      logEntriesDeleted: expiredLogs.length,
    };

    await logAdminAction(tx, { actor: SYSTEM_ACTOR, action: "purge", details: counts });

    return counts;
  });
}

/** Logzeile zu einem Lauf: nur Anzahlen, keine personenbezogenen Daten. */
export function purgeLogMessage(counts: PurgeCounts): string {
  return (
    "Automatische Löschung: " +
    `${counts.requestsDeleted} Anfragen gelöscht, ` +
    `${counts.requestsAnonymized} anonymisiert, ` +
    `${counts.invoicesDeleted} Rechnungen gelöscht, ` +
    `${counts.manualStaysDeleted} manuelle Aufenthalte gelöscht, ` +
    `${counts.logEntriesDeleted} Protokolleinträge gelöscht`
  );
}
