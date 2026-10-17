import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bookingRequest, blockedPeriod } from "@/db/schema";
import { bookingRequestSchema } from "@/lib/validation";
import { isRangeAvailable } from "@/lib/booking";
import {
  sendBookingRequestNotification,
  sendGuestRequestReceived,
} from "@/lib/email";
import { buildBookingRequestPush, sendPushToAdmins } from "@/lib/push";
import { clientIp, createRateLimiter } from "@/lib/rateLimit";

// Je Besucher genügen ein paar Versuche (Tippfehler, zweiter Zeitraum). Das
// Gesamtlimit fängt verteilte Bots ab, die viele IPs nutzen – jede Anfrage
// löst Mails aus, und die sollen nie zur Spam-Schleuder werden.
const perIp = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });
const allVisitors = createRateLimiter({ limit: 40, windowMs: 24 * 60 * 60 * 1000 });

// Menschen brauchen für das Formular deutlich länger; Bots füllen sofort aus.
const MIN_FORM_MS = 3000;

const TOO_MANY =
  "Zu viele Anfragen in kurzer Zeit. Bitte versuchen Sie es später erneut oder schreiben Sie an kontakt@norddeich-heuler.de.";

/**
 * Bot-Merkmale: das unsichtbare Feld `website` ist ausgefüllt, oder das
 * Formular wurde schneller abgeschickt, als ein Mensch es ausfüllen kann bzw.
 * gar nicht über das Formular (dann fehlt `formMs`).
 */
function looksLikeBot(body: unknown): boolean {
  if (body === null || typeof body !== "object") return false;
  const { website, formMs } = body as { website?: unknown; formMs?: unknown };
  if (typeof website === "string" && website.trim() !== "") return true;
  return typeof formMs !== "number" || formMs < MIN_FORM_MS;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ungültiger Anfragekörper (kein valides JSON)" },
      { status: 400 },
    );
  }

  if (!perIp.hit(clientIp(request.headers))) {
    return NextResponse.json({ error: TOO_MANY }, { status: 429 });
  }

  // Bots bekommen scheinbar Erfolg – eine Fehlermeldung würde ihnen nur
  // verraten, woran sie erkannt wurden. Gespeichert und gemailt wird nichts.
  if (looksLikeBot(body)) {
    return NextResponse.json({ id: 0 }, { status: 201 });
  }

  const parsed = bookingRequestSchema.safeParse(body);

  if (!parsed.success) {
    // Die erste Meldung als Text plus das betroffene Feld: Das Formular zeigt
    // sie direkt dort an und springt hin.
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: issue?.message ?? "Bitte prüfen Sie Ihre Eingaben.",
        field: typeof issue?.path[0] === "string" ? issue.path[0] : null,
      },
      { status: 400 },
    );
  }

  if (!allVisitors.hit("alle")) {
    console.error("Globales Anfrage-Limit erreicht – möglicher Bot-Angriff");
    return NextResponse.json({ error: TOO_MANY }, { status: 429 });
  }

  const { name, email, phone, startDate, endDate, message, guests, linens, towels } =
    parsed.data;

  const existingBlockedPeriods = await db.select().from(blockedPeriod);
  if (!isRangeAvailable(existingBlockedPeriods, startDate, endDate)) {
    return NextResponse.json(
      { error: "Der gewählte Zeitraum ist bereits belegt." },
      { status: 409 },
    );
  }

  const [{ id }] = await db
    .insert(bookingRequest)
    .values({ name, email, phone, startDate, endDate, message, guests, linens, towels })
    .$returningId();

  // Hole den vollständigen Datensatz für die E-Mails
  const [created] = await db
    .select()
    .from(bookingRequest)
    .where(eq(bookingRequest.id, id));

  // Die Anfrage ist gespeichert – ein Mailfehler darf sie nicht verwerfen,
  // sonst verliert der Gast seine Eingabe wegen eines Problems beim Versand.
  // Mails und Push unabhängig versenden: schlägt eins fehl, sollen die anderen
  // trotzdem rausgehen.
  await Promise.allSettled([
    sendPushToAdmins(buildBookingRequestPush(created)).catch((error: unknown) => {
      console.error("Push an die Betreiberin fehlgeschlagen", error);
    }),
    sendBookingRequestNotification(created).catch((error: unknown) => {
      console.error("Benachrichtigung des Betreibers fehlgeschlagen", error);
    }),
    sendGuestRequestReceived(created).catch((error: unknown) => {
      console.error("Eingangsbestätigung an den Gast fehlgeschlagen", error);
    }),
  ]);

  return NextResponse.json({ id }, { status: 201 });
}
