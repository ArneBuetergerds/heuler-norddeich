import { NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/adminAuth";
import { db } from "@/db/client";
import { createManualBooking, RANGE_TAKEN_ERROR } from "@/db/adminQueries";
import { manualBookingSchema } from "@/lib/validation";
import { withRouteErrors } from "@/lib/routeErrors";

/**
 * Manuelle Buchung (z. B. telefonisch vereinbart): legt eine bestätigte
 * Anfrage mit Herkunft `manual` samt Belegung an (`createManualBooking`).
 *
 * Bewusst ohne Mail an den Gast und ohne Push oder Mail an die Betreiberin –
 * sie trägt die Buchung selbst ein und hat mit dem Gast schon gesprochen.
 *
 * 400: Eingabe ungültig (lesbare Meldung in `error`) · 409: Zeitraum belegt.
 */
export const POST = withRouteErrors("POST /api/admin/manual-booking", postManualBooking);

async function postManualBooking(request: Request) {
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

  const parsed = manualBookingSchema.safeParse(body);
  if (!parsed.success) {
    // Die erste Meldung als Text plus das betroffene Feld, wie beim
    // öffentlichen Formular.
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: issue?.message ?? "Bitte prüfen Sie Ihre Eingaben.",
        field: typeof issue?.path[0] === "string" ? issue.path[0] : null,
      },
      { status: 400 },
    );
  }

  try {
    const { bookingRequestId } = await createManualBooking(db, parsed.data, authorized.actor);
    return NextResponse.json({ id: bookingRequestId }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === RANGE_TAKEN_ERROR) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
