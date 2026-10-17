import { desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db as defaultDb } from "./client";
import { blockedPeriod, bookingRequest, type BookingRequest } from "./schema";
import { endsAfter, overlapsRange } from "./availability";
import { splitOccupancy, type Occupancy } from "../lib/occupancy";
import type { Period } from "../lib/booking";

type Db = typeof defaultDb;

/**
 * Belegte und gesperrte Zeiträume, getrennt nach Herkunft – für den
 * Admin-Kalender, der Belegungen mit Gastnamen anders darstellt als
 * Sperrzeiträume. Der Gastname stammt bei bestätigten Anfragen aus der Anfrage
 * selbst, damit er nicht doppelt gepflegt werden muss.
 */
export async function getOccupancy(): Promise<Occupancy> {
  const rows = await defaultDb
    .select({
      id: blockedPeriod.id,
      startDate: blockedPeriod.startDate,
      endDate: blockedPeriod.endDate,
      note: blockedPeriod.note,
      guestName: blockedPeriod.guestName,
      bookingRequestId: blockedPeriod.bookingRequestId,
      requestName: bookingRequest.name,
    })
    .from(blockedPeriod)
    .leftJoin(bookingRequest, eq(blockedPeriod.bookingRequestId, bookingRequest.id));

  return splitOccupancy(rows);
}

/** Belegung, wie Gäste sie sehen dürfen: nur Zeiträume, keine Namen oder Notizen. */
export type PublicOccupancy = { stays: Period[]; maintenance: Period[] };

/**
 * Belegung für den öffentlichen Kalender: nur Zeiträume, die heute oder
 * später noch etwas sperren, ohne Join und ohne Gastdaten. Vergangene
 * Zeiträume braucht der Kalender nicht – vergangene Tage sind ohnehin nicht
 * wählbar.
 *
 * `hasGuest` unterscheidet Belegung und Sperrzeitraum wie `splitOccupancy`
 * (Anfrage oder manueller Gastname = Belegung), wird aber in SQL gebildet,
 * damit kein Name die Datenbank verlässt.
 *
 * `today` ist UTC-Mitternacht des heutigen Tages, wie die `date`-Spalten.
 */
export async function getPublicOccupancy(
  today: Date,
  db: Db = defaultDb,
): Promise<PublicOccupancy> {
  const rows = await db
    .select({
      startDate: blockedPeriod.startDate,
      endDate: blockedPeriod.endDate,
      hasGuest: sql<boolean>`(${blockedPeriod.bookingRequestId} is not null or ${blockedPeriod.guestName} is not null)`.mapWith(
        (value: unknown) => Number(value) === 1,
      ),
    })
    .from(blockedPeriod)
    .where(endsAfter(today));

  const occupancy: PublicOccupancy = { stays: [], maintenance: [] };
  for (const { startDate, endDate, hasGuest } of rows) {
    (hasGuest ? occupancy.stays : occupancy.maintenance).push({ startDate, endDate });
  }
  return occupancy;
}

/**
 * Prüft vor dem Speichern einer Anfrage, ob der Zeitraum frei ist. Ohne
 * Sperre: Die Anfrage reserviert nichts, verbindlich prüft erst die
 * Bestätigung (`confirmBookingRequest`, mit `FOR UPDATE`).
 */
export async function isRangeFree(start: Date, end: Date, db: Db = defaultDb): Promise<boolean> {
  const [overlapping] = await db
    .select({ id: blockedPeriod.id })
    .from(blockedPeriod)
    .where(overlapsRange(start, end))
    .limit(1);
  return overlapping === undefined;
}

/** Alle offenen Anfragen – sie brauchen eine Entscheidung und werden nie gekürzt. */
export async function getPendingBookingRequests(db: Db = defaultDb): Promise<BookingRequest[]> {
  return db
    .select()
    .from(bookingRequest)
    .where(eq(bookingRequest.status, "pending"))
    .orderBy(desc(bookingRequest.createdAt));
}

/**
 * Bearbeitete (bestätigte oder abgelehnte) Anfragen, neueste zuerst.
 *
 * Mit `limit` höchstens so viele; `hasMore` sagt, ob es ältere gibt. Dafür
 * wird ein Eintrag mehr gelesen als angezeigt – das spart eine Zählabfrage.
 * `limit: null` lädt die ganze Historie.
 */
export async function getBookingHistory(
  { limit }: { limit: number | null },
  db: Db = defaultDb,
): Promise<{ entries: BookingRequest[]; hasMore: boolean }> {
  const query = db
    .select()
    .from(bookingRequest)
    .where(ne(bookingRequest.status, "pending"))
    .orderBy(desc(bookingRequest.createdAt));

  if (limit === null) {
    return { entries: await query, hasMore: false };
  }

  const rows = await query.limit(limit + 1);
  return { entries: rows.slice(0, limit), hasMore: rows.length > limit };
}

/** Die Anfragen mit den angegebenen IDs, z. B. zu den angezeigten Aufenthalten. */
export async function getBookingRequestsByIds(
  ids: number[],
  db: Db = defaultDb,
): Promise<BookingRequest[]> {
  if (ids.length === 0) {
    return [];
  }
  return db.select().from(bookingRequest).where(inArray(bookingRequest.id, ids));
}
