import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { blockedPeriod } from "@/db/schema";
import { z } from "zod";

const createSchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    note: z.string().optional(),
  })
  .refine((data) => data.startDate < data.endDate, {
    message: "Startdatum muss vor dem Enddatum liegen",
    path: ["endDate"],
  });

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [created] = await db.insert(blockedPeriod).values(parsed.data).returning();
  return NextResponse.json(created, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "id fehlt" }, { status: 400 });
  }

  await db.delete(blockedPeriod).where(eq(blockedPeriod.id, id));
  return NextResponse.json({ ok: true });
}
