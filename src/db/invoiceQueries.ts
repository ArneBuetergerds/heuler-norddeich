import { and, eq, inArray, max, sql } from "drizzle-orm";
import { db as defaultDb } from "./client";
import { bookingRequest, invoice, type Invoice } from "./schema";
import { buildInvoiceSnapshot, formatInvoiceNumber } from "../lib/invoice";
import { berlinYear } from "../lib/format";
import { logAdminAction } from "./adminActionLog";

export const INVOICE_EXISTS_ERROR = "Für diese Buchung gibt es bereits eine Rechnung";
export const NOT_CONFIRMED_ERROR = "Rechnungen gibt es nur für bestätigte Buchungen";
export const INVOICE_NUMBER_CONFLICT_ERROR =
  "Die Rechnungsnummer wurde gerade gleichzeitig vergeben. Bitte die Rechnung noch einmal erstellen.";

/** Versuche bei einer Kollision der laufenden Nummer, siehe createInvoice. */
export const INVOICE_NUMBER_ATTEMPTS = 2;

type Db = typeof defaultDb;

/** MySQL-Fehler: doppelter Schlüssel und Deadlock (beide Zahlen sind seit Jahren stabil). */
const ER_DUP_ENTRY = 1062;
const ER_LOCK_DEADLOCK = 1213;

type MysqlError = { errno?: unknown; code?: unknown; sqlMessage?: unknown };

/**
 * Der MySQL-Fehler hinter einem Drizzle-Fehler. Drizzle verpackt den Fehler
 * des Treibers in `DrizzleQueryError` und hängt ihn als `cause` an.
 */
function mysqlError(error: unknown): MysqlError | null {
  for (let current = error, depth = 0; current && depth < 5; depth++) {
    if (typeof current === "object" && "errno" in current) {
      return current as MysqlError;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * Name des eindeutigen Index, an dem ein Insert gescheitert ist, oder `null`.
 * MySQL 8 nennt ihn mit Tabelle („for key 'invoice.invoice_number'“), ältere
 * Versionen und MariaDB ohne.
 */
export function duplicateKeyName(error: unknown): string | null {
  const cause = mysqlError(error);
  if (!cause || (cause.errno !== ER_DUP_ENTRY && cause.code !== "ER_DUP_ENTRY")) {
    return null;
  }
  const message = typeof cause.sqlMessage === "string" ? cause.sqlMessage : "";
  return /for key '(?:[^'.]*\.)?([^'.]+)'/.exec(message)?.[1] ?? null;
}

function isDeadlock(error: unknown): boolean {
  const cause = mysqlError(error);
  return cause?.errno === ER_LOCK_DEADLOCK || cause?.code === "ER_LOCK_DEADLOCK";
}

/**
 * Stellt eine Rechnung zu einer bestätigten Buchung aus.
 *
 * Die laufende Nummer wird innerhalb der Transaktion vergeben: höchste
 * Nummer des Jahres plus eins, mit Zeilensperre gelesen. Der eindeutige Index
 * auf (Jahr, Nummer) ist die zweite Sicherung – kämen zwei Rechnungen
 * trotzdem gleichzeitig, scheitert die zweite am Index, statt eine Nummer
 * doppelt zu vergeben.
 *
 * Gleichzeitige Requests (Doppelklick, zwei Geräte) enden nicht als 500:
 * - Scheitert der Insert am Index `invoice_booking_request`, hat ein anderer
 *   Request zur selben Buchung gewonnen – das ist `INVOICE_EXISTS_ERROR`.
 * - Scheitert er an der Nummer (`invoice_year_sequence`, `invoice_number`)
 *   oder an einem Deadlock, wird die ganze Transaktion einmal wiederholt.
 *   Entschieden für die Wiederholung statt sofort 409: Die Betreiberin will
 *   die Rechnung haben, und im zweiten Anlauf liest die Transaktion die
 *   inzwischen vergebene Nummer mit und nimmt die nächste. War der andere
 *   Request für dieselbe Buchung, endet der zweite Anlauf sauber in
 *   `INVOICE_EXISTS_ERROR`. Scheitert auch er, kommt
 *   `INVOICE_NUMBER_CONFLICT_ERROR` (409) – nie eine doppelte Nummer.
 *   Deadlocks gehören dazu, weil InnoDB die erste Rechnung eines Jahres (noch
 *   keine Zeile zum Sperren) bei zwei gleichzeitigen Requests oft so statt
 *   mit doppeltem Schlüssel abbricht.
 */
export async function createInvoice(
  input: {
    bookingRequestId: number;
    recipientName: string;
    recipientAddress: string[];
    issuedAt?: Date;
    /** E-Mail des angemeldeten Admins, für das Protokoll. */
    actor: string;
  },
  db: Db = defaultDb,
): Promise<Invoice> {
  const bank = process.env.BANK_TRANSFER_DETAILS?.trim();
  const bankDetails = bank ? bank.split("\n").map((zeile) => zeile.trim()) : null;
  const issuedAt = input.issuedAt ?? new Date();
  // Jahr nach deutscher Zeit: Eine Rechnung vom 1.1., 0:30 Uhr, gehört in
  // den Nummernkreis des neuen Jahres, auch wenn es in UTC noch der 31.12. ist.
  const year = berlinYear(issuedAt);

  for (let attempt = 1; ; attempt++) {
    try {
      return await insertInvoice(db, input, { year, issuedAt, bankDetails });
    } catch (error) {
      const key = duplicateKeyName(error);
      if (key === "invoice_booking_request") {
        throw new Error(INVOICE_EXISTS_ERROR, { cause: error });
      }
      const numberTaken =
        key === "invoice_year_sequence" || key === "invoice_number" || isDeadlock(error);
      if (!numberTaken) {
        throw error;
      }
      if (attempt >= INVOICE_NUMBER_ATTEMPTS) {
        throw new Error(INVOICE_NUMBER_CONFLICT_ERROR, { cause: error });
      }
    }
  }
}

async function insertInvoice(
  db: Db,
  input: {
    bookingRequestId: number;
    recipientName: string;
    recipientAddress: string[];
    actor: string;
  },
  {
    year,
    issuedAt,
    bankDetails,
  }: { year: number; issuedAt: Date; bankDetails: string[] | null },
): Promise<Invoice> {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(bookingRequest)
      .where(eq(bookingRequest.id, input.bookingRequestId));

    if (!request || request.status !== "confirmed") {
      throw new Error(NOT_CONFIRMED_ERROR);
    }

    const [vorhanden] = await tx
      .select({ id: invoice.id })
      .from(invoice)
      .where(eq(invoice.bookingRequestId, input.bookingRequestId));
    if (vorhanden) {
      throw new Error(INVOICE_EXISTS_ERROR);
    }

    const [{ hoechste }] = await tx
      .select({ hoechste: max(invoice.sequence) })
      .from(invoice)
      .where(eq(invoice.year, year))
      .for("update");

    const sequence = (hoechste ?? 0) + 1;
    const number = formatInvoiceNumber(year, sequence);

    const snapshot = buildInvoiceSnapshot({
      request,
      number,
      issuedAt,
      recipientName: input.recipientName,
      recipientAddress: input.recipientAddress,
      bankDetails,
    });

    await tx.insert(invoice).values({
      year,
      sequence,
      number,
      bookingRequestId: request.id,
      snapshot,
    });

    // In derselben Transaktion: Ein Wiederholungsversuch nach einer
    // Nummernkollision hinterlässt so keinen verwaisten Eintrag.
    await logAdminAction(tx, {
      actor: input.actor,
      action: "invoice_create",
      bookingRequestId: request.id,
      details: { number },
    });

    const [created] = await tx
      .select()
      .from(invoice)
      .where(and(eq(invoice.year, year), eq(invoice.sequence, sequence)));
    return created;
  });
}

export async function getInvoice(id: number, db: Db = defaultDb): Promise<Invoice | undefined> {
  const [row] = await db.select().from(invoice).where(eq(invoice.id, id));
  return row;
}

/** Die Rechnung zu einer Buchung, falls es eine gibt (höchstens eine je Buchung). */
export async function getInvoiceForBookingRequest(
  bookingRequestId: number,
  db: Db = defaultDb,
): Promise<Invoice | undefined> {
  const [row] = await db
    .select()
    .from(invoice)
    .where(eq(invoice.bookingRequestId, bookingRequestId));
  return row;
}

/** Was die Admin-Übersicht von einer Rechnung zeigt – ohne den übrigen Snapshot. */
export type InvoiceSummary = {
  id: number;
  number: string;
  bookingRequestId: number;
  /** Rechnungsdatum aus dem Snapshot, ISO "YYYY-MM-DD" (deutsche Zeit). */
  issuedAt: string;
};

/**
 * Rechnungen zu den angegebenen Buchungen, nur mit den Feldern, die die
 * Admin-Übersicht braucht. Das Rechnungsdatum wird in SQL aus dem Snapshot
 * gelesen, damit nicht der ganze Snapshot (Positionen, Anschrift, Bank) je
 * Rechnung geladen und an den Browser gegeben wird.
 */
export async function getInvoiceSummaries(
  bookingRequestIds: number[],
  db: Db = defaultDb,
): Promise<InvoiceSummary[]> {
  if (bookingRequestIds.length === 0) {
    return [];
  }
  return db
    .select({
      id: invoice.id,
      number: invoice.number,
      bookingRequestId: invoice.bookingRequestId,
      issuedAt: sql<string>`json_unquote(json_extract(${invoice.snapshot}, '$.issuedAt'))`,
    })
    .from(invoice)
    .where(inArray(invoice.bookingRequestId, bookingRequestIds));
}
