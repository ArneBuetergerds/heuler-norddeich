import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { bookingRequest, blockedPeriod } from "@/db/schema";
import { bookingRequestSchema } from "@/lib/validation";
import { isRangeAvailable } from "@/lib/booking";
import { sendBookingRequestNotification } from "@/lib/email";

export async function POST(request: Request) {
  const body = await request.json();
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

  try {
    await sendBookingRequestNotification(created);
  } catch (error) {
    console.error("Benachrichtigungs-E-Mail konnte nicht gesendet werden", error);
  }

  return NextResponse.json({ id: created.id }, { status: 201 });
}
