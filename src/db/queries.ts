import { desc, eq } from "drizzle-orm";
import { db } from "./client";
import {
  blockedPeriod,
  bookingRequest,
  type BlockedPeriod,
  type BookingRequest,
} from "./schema";
import { splitOccupancy, type Occupancy } from "../lib/occupancy";

export async function getBlockedPeriods(): Promise<BlockedPeriod[]> {
  return db.select().from(blockedPeriod);
}

/**
 * Belegte und gesperrte Zeiträume, getrennt nach Herkunft – für den
 * Admin-Kalender, der Belegungen mit Gastnamen anders darstellt als
 * Sperrzeiträume. Der Gastname stammt bei bestätigten Anfragen aus der Anfrage
 * selbst, damit er nicht doppelt gepflegt werden muss.
 */
export async function getOccupancy(): Promise<Occupancy> {
  const rows = await db
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

export async function getBookingRequests(): Promise<BookingRequest[]> {
  return db.select().from(bookingRequest).orderBy(desc(bookingRequest.createdAt));
}
