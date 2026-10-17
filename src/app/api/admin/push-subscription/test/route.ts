import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { sendPushToAdmins, TEST_PUSH, vapidConfig } from "@/lib/push";

/** Schickt eine Testbenachrichtigung an alle angemeldeten Admin-Geräte. */
export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  if (!vapidConfig()) {
    return NextResponse.json(
      { error: "Push ist auf dem Server nicht eingerichtet (VAPID-Schlüssel fehlen)." },
      { status: 503 },
    );
  }

  await sendPushToAdmins(TEST_PUSH);
  return NextResponse.json({ ok: true });
}
