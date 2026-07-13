import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { confirmBookingRequest, declineBookingRequest } from "@/db/adminQueries";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { action } = await request.json();
  const { id: idParam } = await params;
  const id = Number(idParam);

  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Ungültige ID" }, { status: 400 });
  }

  try {
    if (action === "confirm") {
      await confirmBookingRequest(db, id);
    } else if (action === "decline") {
      await declineBookingRequest(db, id);
    } else {
      return NextResponse.json({ error: "Ungültige Aktion" }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Zeitraum ist inzwischen belegt") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
