import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/adminAuth";
import { db } from "@/db/client";
import { pushSubscription } from "@/db/schema";
import { sendPushToAdmins, TEST_PUSH, testPushResponse, vapidConfig } from "@/lib/push";
import { withRouteErrors } from "@/lib/routeErrors";

// Optional: das Abo des auslösenden Geräts, damit die Antwort sagen kann, ob
// genau dieses Gerät noch angemeldet ist.
const testSchema = z.object({ endpoint: z.string().min(1).max(700).optional() });

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

/**
 * Schickt eine Testbenachrichtigung an alle angemeldeten Admin-Geräte und
 * meldet nur dann Erfolg, wenn mindestens eines beliefert wurde.
 */
export const POST = withRouteErrors("POST /api/admin/push-subscription/test", postTestPush);

async function postTestPush(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  if (!vapidConfig()) {
    return NextResponse.json(
      { error: "Push ist auf dem Server nicht eingerichtet (VAPID-Schlüssel fehlen)." },
      { status: 503 },
    );
  }

  const parsed = testSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const endpoint = parsed.data.endpoint;
  const registered =
    endpoint === undefined
      ? false
      : (
          await db
            .select({ id: pushSubscription.id })
            .from(pushSubscription)
            .where(eq(pushSubscription.endpoint, endpoint))
        ).length > 0;

  const result = await sendPushToAdmins(TEST_PUSH);
  const { status, body } = testPushResponse(
    result,
    endpoint === undefined ? null : { endpoint, registered },
  );
  return NextResponse.json(body, { status });
}
