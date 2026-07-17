import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { bookingRequest, blockedPeriod } from "@/db/schema";
import { bookingRequestSchema } from "@/lib/validation";
import { isRangeAvailable } from "@/lib/booking";
import {
  sendBookingRequestNotification,
  sendGuestRequestReceived,
} from "@/lib/email";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ungültiger Anfragekörper (kein valides JSON)" },
      { status: 400 },
    );
  }

  const parsed = bookingRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { name, email, phone, startDate, endDate, message } = parsed.data;

  const existingBlockedPeriods = await db.select().from(blockedPeriod);
  if (!isRangeAvailable(existingBlockedPeriods, startDate, endDate)) {
    return NextResponse.json(
      { error: "Der gewählte Zeitraum ist bereits belegt." },
      { status: 409 },
    );
  }

  const [created] = await db
    .insert(bookingRequest)
    .values({ name, email, phone, startDate, endDate, message })
    .returning();

  // Die Anfrage ist gespeichert – ein Mailfehler darf sie nicht verwerfen,
  // sonst verliert der Gast seine Eingabe wegen eines Problems beim Versand.
  // Beide Mails unabhängig versenden: schlägt eine fehl, soll die andere
  // trotzdem rausgehen.
  await Promise.allSettled([
    sendBookingRequestNotification(created).catch((error: unknown) => {
      console.error("Benachrichtigung des Betreibers fehlgeschlagen", error);
    }),
    sendGuestRequestReceived(created).catch((error: unknown) => {
      console.error("Eingangsbestätigung an den Gast fehlgeschlagen", error);
    }),
  ]);

  return NextResponse.json({ id: created.id }, { status: 201 });
}
