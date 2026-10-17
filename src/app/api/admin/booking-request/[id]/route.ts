import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { authorizeAdmin } from "@/lib/adminAuth";
import { db } from "@/db/client";
import { bookingRequest } from "@/db/schema";
import {
  confirmBookingRequest,
  declineBookingRequest,
  RANGE_TAKEN_ERROR,
  NOT_PENDING_ERROR,
} from "@/db/adminQueries";
import {
  deleteBookingRequest,
  REQUEST_ALREADY_ANONYMIZED_ERROR,
  REQUEST_NOT_FOUND_ERROR,
  STAY_AHEAD_ERROR,
} from "@/db/retentionQueries";
import { berlinDay } from "@/lib/retention";
import { sendGuestConfirmation, sendGuestDecline } from "@/lib/email";

const patchSchema = z.object({
  action: z.enum(["confirm", "decline"]),
  reason: z.string().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorized = await authorizeAdmin(request);
  if ("denied" in authorized) return authorized.denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ungültiger Anfragekörper (kein valides JSON)" },
      { status: 400 },
    );
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Aktion" }, { status: 400 });
  }

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }

  const { action, reason } = parsed.data;

  try {
    if (action === "confirm") {
      await confirmBookingRequest(db, id, authorized.actor);
    } else {
      await declineBookingRequest(db, id, authorized.actor, reason);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === RANGE_TAKEN_ERROR || error.message === NOT_PENDING_ERROR)
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  await notifyGuest(id, action, reason);

  return NextResponse.json({ ok: true });
}

/**
 * Löscht eine Anfrage von Hand – oder anonymisiert sie, wenn eine Rechnung
 * aufbewahrt werden muss. Die Regeln stehen in `adminDeletionDecision`
 * (src/lib/retention.ts); geprüft wird hier auf dem Server, egal was die
 * Oberfläche anbietet.
 *
 * 404: unbekannt · 409: (noch) nicht löschbar, z. B. bestätigte Buchung mit
 * Abreise in der Zukunft.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorized = await authorizeAdmin(request);
  if ("denied" in authorized) return authorized.denied;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }

  try {
    const result = await deleteBookingRequest(db, id, authorized.actor, berlinDay(new Date()));
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof Error && error.message === REQUEST_NOT_FOUND_ERROR) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (
      error instanceof Error &&
      (error.message === STAY_AHEAD_ERROR || error.message === REQUEST_ALREADY_ANONYMIZED_ERROR)
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

/**
 * Die Entscheidung ist zu diesem Zeitpunkt bereits gespeichert – ein Mailfehler
 * darf sie nicht zurückdrehen, sonst stünde der Admin vor einer Anfrage, deren
 * Bestätigung scheinbar nicht funktioniert.
 */
async function notifyGuest(
  id: number,
  action: "confirm" | "decline",
  reason?: string,
): Promise<void> {
  const guest = await db.query.bookingRequest.findFirst({
    where: eq(bookingRequest.id, id),
  });
  if (!guest) {
    return;
  }

  try {
    if (action === "confirm") {
      await sendGuestConfirmation(guest);
    } else {
      await sendGuestDecline(guest, reason);
    }
  } catch (error) {
    console.error("Benachrichtigung des Gasts konnte nicht gesendet werden", error);
  }
}
