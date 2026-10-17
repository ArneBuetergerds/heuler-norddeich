import { NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bookingRequest } from "@/db/schema";
import { isRangeFree } from "@/db/queries";
import { bookingRequestSchema } from "@/lib/validation";
import {
  sendBookingRequestNotification,
  sendGuestRequestReceived,
  sendOperatorDigest,
} from "@/lib/email";
import {
  buildBookingRequestPush,
  buildOperatorDigestPush,
  sendPushToAdmins,
} from "@/lib/push";
import { clientIp, createRateLimiter } from "@/lib/rateLimit";
import { safeError } from "@/lib/safeError";
import {
  GLOBAL_REQUEST_LIMIT,
  GLOBAL_REQUEST_WINDOW_MS,
  createOperatorDigest,
  notifyAboutBookingRequest,
} from "@/lib/bookingNotifications";

// Je Besucher genügen ein paar Versuche (Tippfehler, zweiter Zeitraum); das
// Limit je IP ist die einzige harte Ablehnung. Das Gesamtlimit fängt verteilte
// Bots ab, die viele IPs nutzen – es lehnt aber niemanden ab (sonst könnte ein
// Angreifer das Formular für alle Gäste sperren), sondern unterdrückt nur die
// Eingangsbestätigung an die angegebene Adresse, damit die Seite nie zur
// Spam-Schleuder an fremde Postfächer wird, und fasst die Meldungen an die
// Betreiberin zu höchstens einer Sammelmeldung je Stunde zusammen. Siehe
// notifyAboutBookingRequest und createOperatorDigest.
const perIp = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });
const allVisitors = createRateLimiter({
  limit: GLOBAL_REQUEST_LIMIT,
  windowMs: GLOBAL_REQUEST_WINDOW_MS,
});

const DIGEST_THRESHOLD = {
  limit: GLOBAL_REQUEST_LIMIT,
  windowHours: GLOBAL_REQUEST_WINDOW_MS / (60 * 60 * 1000),
};

const operatorDigest = createOperatorDigest({
  notifiers: {
    mail: (count) => sendOperatorDigest(count, DIGEST_THRESHOLD),
    push: (count) => sendPushToAdmins(buildOperatorDigestPush(count)),
  },
});

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

  // Kein Abbruch bei Überschreitung: Die Anfrage wird gespeichert, nur die
  // Einzelmeldungen entfallen (siehe notifyAboutBookingRequest). Die Antwort
  // an den Client bleibt dieselbe.
  const withinGlobalLimit = allVisitors.hit("alle");

  const { name, email, phone, startDate, endDate, message, guests, linens, towels } =
    parsed.data;

  if (!(await isRangeFree(startDate, endDate))) {
    return NextResponse.json(
      { error: "Der gewählte Zeitraum ist bereits belegt." },
      { status: 409 },
    );
  }

  const [{ id }] = await db
    .insert(bookingRequest)
    .values({ name, email, phone, startDate, endDate, message, guests, linens, towels })
    .$returningId();

  // Die Anfrage ist gespeichert, der Gast bekommt sofort seine Antwort. Mails
  // und Push laufen nach dem Senden der Antwort (`after`, vom Standalone-
  // Server `server.js` im Container unterstützt) – ein langsamer SMTP-Server
  // hält das Formular so nicht auf. Fehler werden geloggt; die Anfrage bleibt
  // in jedem Fall gespeichert und steht im Admin.
  after(async () => {
    try {
      // Vollständiger Datensatz (Status, Eingangszeit) für die Benachrichtigungen.
      const [created] = await db
        .select()
        .from(bookingRequest)
        .where(eq(bookingRequest.id, id));
      if (!created) {
        console.error("Gespeicherte Anfrage für die Benachrichtigung nicht gefunden", id);
        return;
      }

      await notifyAboutBookingRequest(
        created,
        { withinGlobalLimit },
        {
          // Das Ergebnis des Push-Versands interessiert hier nicht – die Mail an
          // die Betreiberin geht ohnehin raus.
          pushAdmins: (stored) => sendPushToAdmins(buildBookingRequestPush(stored)),
          notifyOperator: sendBookingRequestNotification,
          confirmToGuest: sendGuestRequestReceived,
        },
        operatorDigest,
      );
    } catch (error) {
      console.error("Benachrichtigungen zur neuen Anfrage fehlgeschlagen", id, safeError(error));
    }
  });

  return NextResponse.json({ id }, { status: 201 });
}
