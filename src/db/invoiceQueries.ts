import { and, eq, max } from "drizzle-orm";
import { db as defaultDb } from "./client";
import { bookingRequest, invoice, type Invoice } from "./schema";
import { buildInvoiceSnapshot, formatInvoiceNumber } from "../lib/invoice";

export const INVOICE_EXISTS_ERROR = "Für diese Buchung gibt es bereits eine Rechnung";
export const NOT_CONFIRMED_ERROR = "Rechnungen gibt es nur für bestätigte Buchungen";
export const TAX_NUMBER_MISSING_ERROR =
  "Keine Steuernummer hinterlegt (INVOICE_TAX_NUMBER) – ohne sie ist eine Rechnung unvollständig";

type Db = typeof defaultDb;

/**
 * Stellt eine Rechnung zu einer bestätigten Buchung aus.
 *
 * Die laufende Nummer wird innerhalb der Transaktion vergeben: höchste
 * Nummer des Jahres plus eins, mit Zeilensperre gelesen. Der eindeutige Index
 * auf (Jahr, Nummer) ist die zweite Sicherung – kämen zwei Rechnungen
 * trotzdem gleichzeitig, scheitert die zweite am Index, statt eine Nummer
 * doppelt zu vergeben.
 */
export async function createInvoice(
  input: {
    bookingRequestId: number;
    recipientName: string;
    recipientAddress: string[];
    issuedAt?: Date;
  },
  db: Db = defaultDb,
): Promise<Invoice> {
  const taxNumber = process.env.INVOICE_TAX_NUMBER?.trim();
  if (!taxNumber) {
    throw new Error(TAX_NUMBER_MISSING_ERROR);
  }

  const bank = process.env.BANK_TRANSFER_DETAILS?.trim();
  const bankDetails = bank ? bank.split("\n").map((zeile) => zeile.trim()) : null;
  const issuedAt = input.issuedAt ?? new Date();
  const year = issuedAt.getUTCFullYear();

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
      taxNumber,
      bankDetails,
    });

    await tx.insert(invoice).values({
      year,
      sequence,
      number,
      bookingRequestId: request.id,
      snapshot,
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

/** Alle Rechnungen, nach Buchung auffindbar – für die Admin-Übersicht. */
export async function getInvoices(db: Db = defaultDb): Promise<Invoice[]> {
  return db.select().from(invoice);
}
