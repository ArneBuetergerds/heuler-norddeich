import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/adminAuth";
import { db } from "@/db/client";
import { pushSubscription } from "@/db/schema";
import { isAllowedPushEndpoint } from "@/lib/push";

// Entspricht PushSubscription.toJSON() im Browser.
const subscribeSchema = z.object({
  endpoint: z
    .url()
    .max(700)
    .refine(isAllowedPushEndpoint, "Unbekannter Push-Dienst"),
  keys: z.object({
    p256dh: z.string().min(1).max(255),
    auth: z.string().min(1).max(255),
  }),
});

const unsubscribeSchema = z.object({ endpoint: z.string().min(1) });

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** Meldet das aufrufende Gerät für Push an (erneutes Anmelden aktualisiert die Schlüssel). */
export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const parsed = subscribeSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { endpoint, keys } = parsed.data;
  await db
    .insert(pushSubscription)
    .values({ endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onDuplicateKeyUpdate({ set: { p256dh: keys.p256dh, auth: keys.auth } });

  return NextResponse.json({ ok: true }, { status: 201 });
}

/** Meldet das aufrufende Gerät ab. */
export async function DELETE(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const parsed = unsubscribeSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  await db.delete(pushSubscription).where(eq(pushSubscription.endpoint, parsed.data.endpoint));
  return NextResponse.json({ ok: true });
}
