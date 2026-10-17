import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { authorizeAdmin } from "@/lib/adminAuth";
import { db } from "@/db/client";
import { blockedPeriod, bookingRequest } from "@/db/schema";
import {
  cancelStay,
  createManualStay,
  createMaintenanceBlock,
  RANGE_TAKEN_ERROR,
} from "@/db/adminQueries";
import { sendGuestDecline } from "@/lib/email";
import { safeError } from "@/lib/safeError";
import { blockedPeriodCreateSchema } from "@/lib/validation";
import { withRouteErrors } from "@/lib/routeErrors";

export const POST = withRouteErrors("POST /api/admin/blocked-period", postBlockedPeriod);

async function postBlockedPeriod(request: Request) {
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

  const parsed = blockedPeriodCreateSchema.safeParse(body);
  if (!parsed.success) {
    // Die erste Meldung als Text: Das Formular zeigt sie direkt an.
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Bitte prüfen Sie Ihre Eingaben." },
      { status: 400 },
    );
  }

  const { startDate, endDate, note, guestName } = parsed.data;

  try {
    if (guestName) {
      await createManualStay(db, { guestName, startDate, endDate }, authorized.actor);
    } else {
      await createMaintenanceBlock(db, { startDate, endDate, note }, authorized.actor);
    }
  } catch (error) {
    if (error instanceof Error && error.message === RANGE_TAKEN_ERROR) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

/** Optionaler Storno-Grund; bei leerem Body bleibt er schlicht undefiniert. */
async function readReason(request: Request): Promise<string | undefined> {
  try {
    const parsed = z
      .object({ reason: z.string().optional() })
      .safeParse(await request.json());
    return parsed.success ? parsed.data.reason : undefined;
  } catch {
    return undefined;
  }
}

export const DELETE = withRouteErrors("DELETE /api/admin/blocked-period", deleteBlockedPeriod);

async function deleteBlockedPeriod(request: Request) {
  const authorized = await authorizeAdmin(request);
  if ("denied" in authorized) return authorized.denied;

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }

  const reason = await readReason(request);

  const stay = await db.query.blockedPeriod.findFirst({
    where: eq(blockedPeriod.id, id),
  });
  if (!stay) {
    return NextResponse.json({ error: "Zeitraum nicht gefunden" }, { status: 404 });
  }

  // Den Gast vor dem Storno laden: danach ist die Verknüpfung zur Anfrage
  // gelöscht und der Empfänger der Absage-Mail nicht mehr ermittelbar.
  const guest =
    stay.bookingRequestId === null
      ? undefined
      : await db.query.bookingRequest.findFirst({
          where: eq(bookingRequest.id, stay.bookingRequestId),
        });

  await cancelStay(db, id, authorized.actor, reason);

  if (guest) {
    try {
      await sendGuestDecline(guest, reason);
    } catch (error) {
      // Der Storno selbst ist erfolgt – ein Mailfehler darf ihn nicht zurückdrehen.
      console.error("Storno-E-Mail an den Gast konnte nicht gesendet werden", safeError(error));
    }
  }

  return NextResponse.json({ ok: true });
}
