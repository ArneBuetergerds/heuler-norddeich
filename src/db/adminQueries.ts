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

/** `actor`: E-Mail des angemeldeten Admins, für das Protokoll. */
export async function confirmBookingRequest(
  db: DbLike,
  id: number,
  actor: string,
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
        bookingRequestId: request.id,
      })
      .$returningId();

    await tx
      .update(bookingRequest)
      .set({ status: "confirmed", decidedAt: new Date() })
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
 * zurück auf "declined" – der Gast erfährt den Grund per Mail. Manuell
 * eingetragene Aufenthalte haben keine Anfrage und verschwinden ersatzlos.
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

/** Trägt einen telefonisch oder persönlich vereinbarten Aufenthalt ein. */
export async function createManualStay(
  db: DbLike,
  stay: { guestName: string; startDate: Date; endDate: Date },
  actor: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await assertRangeFree(tx, stay.startDate, stay.endDate);

    const [created] = await tx
      .insert(blockedPeriod)
      .values({
        startDate: stay.startDate,
        endDate: stay.endDate,
        guestName: stay.guestName,
      })
      .$returningId();

    // Ohne Gastnamen: Der steht am Aufenthalt selbst.
    await logAdminAction(tx, {
      actor,
      action: "manual_stay",
      blockedPeriodId: created.id,
      details: period(stay.startDate, stay.endDate),
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
