import { eq, type SQL } from "drizzle-orm";
import { bookingRequest, blockedPeriod } from "./schema";
import { overlapsRange } from "./availability";
import { isoDay, logAdminAction } from "./adminActionLog";

export const RANGE_TAKEN_ERROR = "Zeitraum ist inzwischen belegt";
export const NOT_PENDING_ERROR = "Die Anfrage ist nicht mehr offen";

type Db = typeof import("./client").db;

type DbLike = {
  query: {
    bookingRequest: {
      findFirst: (args: { where: SQL<unknown> }) => Promise<
        { id: number; startDate: Date; endDate: Date; status: string } | undefined
      >;
    };
    blockedPeriod: {
      findFirst: (args: { where: SQL<unknown> }) => Promise<
        | {
            id: number;
            startDate: Date;
            endDate: Date;
            guestName: string | null;
            bookingRequestId: number | null;
          }
        | undefined
      >;
    };
  };
  insert: Db["insert"];
  update: Db["update"];
  // Indizierter Zugriff statt `typeof db.delete`: SWC/Turbopack parst `delete`
  // nach einem Punkt als Operator und bricht den Production-Build ab.
  delete: Db["delete"];
  transaction: Db["transaction"];
};

type TxLike = { select: Db["select"] };

/**
 * Prüft innerhalb der Transaktion, ob der Zeitraum frei ist.
 *
 * `FOR UPDATE` ist entscheidend: Eine normale Abfrage sähe unter InnoDB nur
 * den Stand bei Transaktionsbeginn, und zwei gleichzeitige Bestätigungen
 * (Doppelklick, Handy und Rechner) kämen beide durch – eine Doppelbuchung.
 * Die sperrende Abfrage liest den aktuellen Stand; die zweite wartet und
 * sieht dann die erste.
 *
 * Gelesen werden nur die überschneidenden Zeilen (`overlapsRange`). Die
 * Sperre wird dadurch nicht schwächer: Unter REPEATABLE READ (Vorgabe von
 * MySQL/InnoDB, hier nicht umgestellt) setzt `FOR UPDATE` Next-Key-Locks auf
 * alles, was die Abfrage *durchsucht*, nicht nur auf die Treffer – samt der
 * Lücken dazwischen und dahinter.
 * - Ohne Index auf `start_date` (Stand heute) durchsucht MySQL den ganzen
 *   Primärschlüssel. Gesperrt sind damit wie bisher alle Zeilen und alle
 *   Lücken; ein gleichzeitiger Insert wartet, auch wenn die Tabelle leer ist
 *   (Sperre auf dem Supremum).
 * - Käme ein Index auf (`start_date`, `end_date`) hinzu, liefe ein Bereichs-
 *   scan über `start_date < :ende`. Gesperrt wären dann alle Indexeinträge
 *   und Lücken bis zum ersten Eintrag ab `:ende`. Jeder Zeitraum, der sich
 *   überschneiden könnte, beginnt vor `:ende` und landet beim Insert in einer
 *   gesperrten Lücke – er wartet. Frei blieben nur Inserts, die erst ab
 *   `:ende` beginnen und sich deshalb nicht überschneiden können.
 * Unter READ COMMITTED gälte beides nicht (keine Lückensperren); dann wäre
 * aber auch die frühere Variante ohne Filter nicht sicher gewesen.
 */
async function assertRangeFree(tx: TxLike, start: Date, end: Date): Promise<void> {
  const overlapping = await tx
    .select({ id: blockedPeriod.id })
    .from(blockedPeriod)
    .where(overlapsRange(start, end))
    .for("update");
  if (overlapping.length > 0) {
    throw new Error(RANGE_TAKEN_ERROR);
  }
}

/** Zeitraum für das Protokoll – ohne Gastdaten. */
function period(start: Date, end: Date) {
  return { startDate: isoDay(start), endDate: isoDay(end) };
}

/** Rechnungsanschrift, wie sie an der Anfrage gespeichert wird. */
export type BookingAddress = {
  street: string;
  postalCode: string;
  city: string;
  country?: string;
};

/** Spalten der Anschrift; ein leeres Land wird als „nicht angegeben“ gespeichert. */
function addressColumns(address: BookingAddress) {
  return {
    street: address.street,
    postalCode: address.postalCode,
    city: address.city,
    country: address.country || null,
  };
}

/**
 * `actor`: E-Mail des angemeldeten Admins, für das Protokoll.
 *
 * `address`: Rechnungsanschrift aus dem Bestätigen-Dialog (Anfragen von vor
 * dem Pflichtfeld). Wird in derselben Transaktion an der Anfrage gespeichert,
 * damit keine bestätigte Buchung ohne die Anschrift entsteht, mit der sie
 * bestätigt wurde.
 */
export async function confirmBookingRequest(
  db: DbLike,
  id: number,
  actor: string,
  address?: BookingAddress,
): Promise<void> {
  const request = await db.query.bookingRequest.findFirst({
    where: eq(bookingRequest.id, id),
  });
  if (!request) {
    throw new Error(`Buchungsanfrage ${id} nicht gefunden`);
  }
  // Eine abgelehnte oder bereits bestätigte Anfrage darf nicht (erneut)
  // bestätigt werden – sonst ginge dem Gast nach einer Absage eine Zusage zu.
  if (request.status !== "pending") {
    throw new Error(NOT_PENDING_ERROR);
  }

  // Insert + update müssen atomar sein: schlägt das Update fehl, nachdem der
  // blocked_period-Eintrag bereits angelegt wurde, bliebe sonst eine Anfrage
  // dauerhaft "pending" bei gleichzeitig gesperrtem Zeitraum zurück.
  await db.transaction(async (tx) => {
    // Zwischen dem Anlegen der Anfrage und ihrer Bestätigung kann der
    // Zeitraum inzwischen durch eine andere bestätigte Anfrage oder einen
    // manuellen Sperrzeitraum belegt worden sein. Deshalb innerhalb der
    // Transaktion (konsistent mit dem nachfolgenden Insert) erneut prüfen.
    await assertRangeFree(tx, request.startDate, request.endDate);

    const [created] = await tx
      .insert(blockedPeriod)
      .values({
        startDate: request.startDate,
        endDate: request.endDate,
        kind: "booking",
        bookingRequestId: request.id,
      })
      .$returningId();

    await tx
      .update(bookingRequest)
      .set({
        status: "confirmed",
        decidedAt: new Date(),
        ...(address ? addressColumns(address) : {}),
      })
      .where(eq(bookingRequest.id, id));

    await logAdminAction(tx, {
      actor,
      action: "confirm",
      bookingRequestId: request.id,
      blockedPeriodId: created.id,
      details: period(request.startDate, request.endDate),
    });
  });
}

/**
 * Lehnt eine Anfrage ab und gibt ihren Zeitraum wieder frei.
 *
 * Das Löschen ist auch für nie bestätigte Anfragen korrekt: dort existiert
 * schlicht kein verknüpfter Sperrzeitraum. Für bereits bestätigte Anfragen ist
 * es zwingend – sonst bliebe der Zeitraum dauerhaft blockiert, obwohl der
 * Aufenthalt abgesagt wurde.
 */
export async function declineBookingRequest(
  db: DbLike,
  id: number,
  actor: string,
  reason?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(blockedPeriod).where(eq(blockedPeriod.bookingRequestId, id));

    // `decidedAt` startet die Löschfrist der abgelehnten Anfrage.
    await tx
      .update(bookingRequest)
      .set({ status: "declined", reasonNote: reason ?? null, decidedAt: new Date() })
      .where(eq(bookingRequest.id, id));

    // Der Grund ist Freitext an den Gast und bleibt deshalb draußen.
    await logAdminAction(tx, { actor, action: "decline", bookingRequestId: id });
  });
}

/**
 * Storniert einen Aufenthalt. Ging er aus einer Anfrage hervor, wandert diese
 * zurück auf "declined" – bei Online-Buchungen erfährt der Gast den Grund per
 * Mail (die Route entscheidet das, nicht diese Funktion). Altbestands-
 * Aufenthalte nur mit Gastnamen, interne Belegungen und Sperrzeiträume haben
 * keine Anfrage und verschwinden ersatzlos.
 */
export async function cancelStay(
  db: DbLike,
  blockedPeriodId: number,
  actor: string,
  reason?: string,
): Promise<void> {
  const stay = await db.query.blockedPeriod.findFirst({
    where: eq(blockedPeriod.id, blockedPeriodId),
  });
  if (!stay) {
    throw new Error(`Aufenthalt ${blockedPeriodId} nicht gefunden`);
  }

  await db.transaction(async (tx) => {
    await tx.delete(blockedPeriod).where(eq(blockedPeriod.id, blockedPeriodId));

    if (stay.bookingRequestId !== null) {
      await tx
        .update(bookingRequest)
        .set({ status: "declined", reasonNote: reason ?? null, decidedAt: new Date() })
        .where(eq(bookingRequest.id, stay.bookingRequestId));
    }

    // Über denselben Weg verschwinden auch Sperrzeiträume ohne Gast
    // (DeleteBlockedPeriodButton) – im Protokoll getrennt ausgewiesen.
    const isStay = stay.bookingRequestId !== null || stay.guestName !== null;
    await logAdminAction(tx, {
      actor,
      action: isStay ? "cancel" : "block_delete",
      bookingRequestId: stay.bookingRequestId,
      blockedPeriodId: stay.id,
      details: period(stay.startDate, stay.endDate),
    });
  });
}

/**
 * Trägt eine telefonisch oder persönlich vereinbarte Buchung als volle Buchung
 * ein: eine bestätigte Anfrage mit Herkunft `manual` samt Belegung, wie nach
 * `confirmBookingRequest`. Rechnung, Detaildialog, Löschfristen und
 * Anonymisierung laufen danach wie bei Online-Buchungen.
 *
 * Verschickt nichts – weder an den Gast noch an die Betreiberin. `endDate`
 * ist der Abreisetag (zählt nicht mit).
 */
export async function createManualBooking(
  db: DbLike,
  booking: {
    name: string;
    email: string;
    phone?: string;
    message?: string;
    startDate: Date;
    endDate: Date;
    guests: number;
    /** Davon unter 14 Jahren (keine Kurtaxe); höchstens `guests` − 1. */
    guestsUnder14: number;
    linens: number;
    towels: number;
    /** Rechnungsanschrift, freiwillig; vollständig oder gar nicht (manualBookingSchema). */
    street?: string;
    postalCode?: string;
    city?: string;
    country?: string;
  },
  actor: string,
  now: Date = new Date(),
): Promise<{ bookingRequestId: number; blockedPeriodId: number }> {
  return db.transaction(async (tx) => {
    await assertRangeFree(tx, booking.startDate, booking.endDate);

    const [request] = await tx
      .insert(bookingRequest)
      .values({
        name: booking.name,
        email: booking.email,
        // Leere Eingaben wie bei fehlenden Angaben speichern.
        phone: booking.phone || null,
        message: booking.message || null,
        street: booking.street || null,
        postalCode: booking.postalCode || null,
        city: booking.city || null,
        country: booking.country || null,
        startDate: booking.startDate,
        endDate: booking.endDate,
        guests: booking.guests,
        guestsUnder14: booking.guestsUnder14,
        linens: booking.linens,
        towels: booking.towels,
        status: "confirmed",
        source: "manual",
        // Ab der Entscheidung läuft keine Frist, maßgeblich ist bei
        // bestätigten Buchungen die Abreise. Gesetzt wie bei der Bestätigung.
        decidedAt: now,
      })
      .$returningId();

    const [created] = await tx
      .insert(blockedPeriod)
      .values({
        startDate: booking.startDate,
        endDate: booking.endDate,
        kind: "booking",
        bookingRequestId: request.id,
      })
      .$returningId();

    // Ohne Gastdaten: Die stehen an der Anfrage selbst.
    await logAdminAction(tx, {
      actor,
      action: "manual_booking",
      bookingRequestId: request.id,
      blockedPeriodId: created.id,
      details: period(booking.startDate, booking.endDate),
    });

    return { bookingRequestId: request.id, blockedPeriodId: created.id };
  });
}

/**
 * Trägt eine interne Belegung ein (Eigennutzung, Familie, Freunde): Zeitraum
 * plus Notiz, ohne Gastdaten und ohne Rechnung. `endDate` ist der Abreisetag
 * (zählt nicht mit), wie bei Gästen. Die Belegung wird
 * INTERNAL_RETENTION_MONTHS nach diesem Tag automatisch gelöscht
 * (src/lib/retention.ts), weil die Notiz Personen nennen kann.
 */
export async function createInternalStay(
  db: DbLike,
  stay: { startDate: Date; endDate: Date; note?: string },
  actor: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await assertRangeFree(tx, stay.startDate, stay.endDate);

    const [created] = await tx
      .insert(blockedPeriod)
      .values({
        startDate: stay.startDate,
        endDate: stay.endDate,
        kind: "internal",
        note: stay.note || null,
      })
      .$returningId();

    // Ohne Notiz: Sie kann Namen enthalten.
    await logAdminAction(tx, {
      actor,
      action: "internal_stay",
      blockedPeriodId: created.id,
      details: period(stay.startDate, stay.endDate),
    });
  });
}

/**
 * Legt einen Sperrzeitraum ohne Personenbezug an (z. B. Wartung). Interne
 * Belegungen (Eigennutzung, Familie) laufen über `createInternalStay`.
 *
 * `block.endDate` ist der letzte gesperrte Tag (inklusiv) – anders als bei
 * Gastaufenthalten gibt es hier keinen Abreisetag, an dem schon wieder
 * jemand einchecken könnte. Die übrige Verfügbarkeitslogik (`isDateBlocked`,
 * `rangesOverlap`) behandelt `endDate` aber durchgängig exklusiv, deshalb
 * hier vor Prüfung und Speicherung ein Tag addieren.
 */
export async function createMaintenanceBlock(
  db: DbLike,
  block: { startDate: Date; endDate: Date; note?: string },
  actor: string,
): Promise<void> {
  const exclusiveEndDate = new Date(
    Date.UTC(
      block.endDate.getUTCFullYear(),
      block.endDate.getUTCMonth(),
      block.endDate.getUTCDate() + 1,
    ),
  );

  await db.transaction(async (tx) => {
    await assertRangeFree(tx, block.startDate, exclusiveEndDate);

    const [created] = await tx
      .insert(blockedPeriod)
      .values({
        startDate: block.startDate,
        endDate: exclusiveEndDate,
        note: block.note ?? null,
      })
      .$returningId();

    await logAdminAction(tx, {
      actor,
      action: "block_create",
      blockedPeriodId: created.id,
      details: period(block.startDate, exclusiveEndDate),
    });
  });
}
