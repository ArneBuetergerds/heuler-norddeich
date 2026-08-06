import { eq, type SQL } from "drizzle-orm";
import { bookingRequest, blockedPeriod } from "./schema";
import { isRangeAvailable } from "../lib/booking";

export const RANGE_TAKEN_ERROR = "Zeitraum ist inzwischen belegt";

type Db = typeof import("./client").db;

type DbLike = {
  query: {
    bookingRequest: {
      findFirst: (args: { where: SQL<unknown> }) => Promise<
        { id: number; startDate: Date; endDate: Date } | undefined
      >;
    };
    blockedPeriod: {
      findFirst: (args: { where: SQL<unknown> }) => Promise<
        { id: number; bookingRequestId: number | null } | undefined
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

async function assertRangeFree(tx: TxLike, start: Date, end: Date): Promise<void> {
  const existing = await tx.select().from(blockedPeriod);
  if (!isRangeAvailable(existing, start, end)) {
    throw new Error(RANGE_TAKEN_ERROR);
  }
}

export async function confirmBookingRequest(db: DbLike, id: number): Promise<void> {
  const request = await db.query.bookingRequest.findFirst({
    where: eq(bookingRequest.id, id),
  });
  if (!request) {
    throw new Error(`Buchungsanfrage ${id} nicht gefunden`);
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

    await tx.insert(blockedPeriod).values({
      startDate: request.startDate,
      endDate: request.endDate,
      bookingRequestId: request.id,
    });

    await tx
      .update(bookingRequest)
      .set({ status: "confirmed" })
      .where(eq(bookingRequest.id, id));
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
  reason?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(blockedPeriod).where(eq(blockedPeriod.bookingRequestId, id));

    await tx
      .update(bookingRequest)
      .set({ status: "declined", reasonNote: reason ?? null })
      .where(eq(bookingRequest.id, id));
  });
}

/**
 * Storniert einen Aufenthalt. Ging er aus einer Anfrage hervor, wandert diese
 * zurück auf "declined" – der Gast erfährt den Grund per Mail. Manuell
 * eingetragene Aufenthalte haben keine Anfrage und verschwinden ersatzlos.
 */
export async function cancelStay(
  db: DbLike,
  blockedPeriodId: number,
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
        .set({ status: "declined", reasonNote: reason ?? null })
        .where(eq(bookingRequest.id, stay.bookingRequestId));
    }
  });
}

/** Trägt einen telefonisch oder persönlich vereinbarten Aufenthalt ein. */
export async function createManualStay(
  db: DbLike,
  stay: { guestName: string; startDate: Date; endDate: Date },
): Promise<void> {
  await db.transaction(async (tx) => {
    await assertRangeFree(tx, stay.startDate, stay.endDate);

    await tx.insert(blockedPeriod).values({
      startDate: stay.startDate,
      endDate: stay.endDate,
      guestName: stay.guestName,
    });
  });
}

/**
 * Legt einen Sperrzeitraum ohne Gast an (Wartung, Eigennutzung, …).
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

    await tx.insert(blockedPeriod).values({
      startDate: block.startDate,
      endDate: exclusiveEndDate,
      note: block.note ?? null,
    });
  });
}
