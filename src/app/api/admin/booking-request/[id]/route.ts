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

  if (action === "confirm") {
    await confirmBookingRequest(db, id);
  } else if (action === "decline") {
    await declineBookingRequest(db, id);
  } else {
    return NextResponse.json({ error: "Ungültige Aktion" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
