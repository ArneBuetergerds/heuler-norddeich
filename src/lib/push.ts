import webpush, { WebPushError } from "web-push";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { pushSubscription, type BookingRequest } from "../db/schema";
import { formatDate } from "./format";
import { safeError } from "./safeError";

/**
 * Inhalt einer Benachrichtigung, wie ihn der Service Worker (`public/sw.js`)
 * erwartet. `url` ist die Seite, die ein Tipp auf die Benachrichtigung öffnet.
 */
export type PushPayload = {
  title: string;
  body: string;
  url: string;
};

/**
 * Der Inhalt ist Ende-zu-Ende verschlüsselt (RFC 8291): Der Push-Dienst des
 * Browserherstellers stellt nur zu und kann ihn nicht lesen. Der Gastname darf
 * deshalb mit – er erscheint ausschließlich auf Sabrinas eigenen Geräten.
 */
export function buildBookingRequestPush(request: BookingRequest): PushPayload {
  return {
    title: "Neue Buchungsanfrage",
    body: [
      request.name,
      `${formatDate(request.startDate)} bis ${formatDate(request.endDate)}`,
      `${request.guests} ${request.guests === 1 ? "Person" : "Personen"}`,
    ].join(" · "),
    url: "/admin",
  };
}

/**
 * Sammelmeldung über dem Gesamtlimit (siehe `createOperatorDigest`): nur die
 * Anzahl, kein Gastname – die Anfragen können von einem Bot stammen.
 */
export function buildOperatorDigestPush(count: number): PushPayload {
  return {
    title: "Ungewöhnlich viele Buchungsanfragen",
    body: `${count === 1 ? "Eine weitere Anfrage" : `${count} weitere Anfragen`} in der letzten Stunde. Einzelmeldungen sind pausiert – alle Anfragen stehen im Admin.`,
    url: "/admin",
  };
}

/**
 * Push-Dienste der Browserhersteller. Nur an diese Hosts darf der Server
 * später Benachrichtigungen schicken – sonst ließe sich über ein
 * präpariertes Abo erreichen, dass der Server Requests an beliebige
 * (auch interne) Adressen absetzt.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge (Android/Desktop)
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^[a-z0-9.-]+\.push\.apple\.com$/, // Safari (macOS, iOS)
  /^[a-z0-9.-]+\.notify\.windows\.com$/, // Edge (Windows)
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

export const TEST_PUSH: PushPayload = {
  title: "Testbenachrichtigung",
  body: "Push-Benachrichtigungen sind auf diesem Gerät eingerichtet.",
  url: "/admin",
};

/**
 * VAPID-Schlüssel, oder `null`, wenn Push nicht eingerichtet ist. Anders als
 * beim Mailversand ist das kein Fehler: Push ist eine Ergänzung zur Mail, und
 * eine Installation ohne Schlüssel soll ganz normal Anfragen annehmen.
 */
export function vapidConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) {
    return null;
  }
  return {
    publicKey,
    privateKey,
    subject: process.env.VAPID_SUBJECT?.trim() || "mailto:kontakt@norddeich-heuler.de",
  };
}

/**
 * 404 und 410 heißen: Das Abo existiert beim Push-Dienst nicht mehr (App
 * gelöscht, Berechtigung entzogen). Alle anderen Fehler sind vorübergehend –
 * das Abo bleibt dann erhalten.
 */
export function isSubscriptionGone(error: unknown): boolean {
  return error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410);
}

/**
 * Ergebnis eines Versands. `configured: false`: keine VAPID-Schlüssel, es
 * wurde nichts versucht. Sonst je Gerät genau einer der Ausgänge:
 * zugestellt (`sent`), fehlgeschlagen (`failed`, Abo bleibt) oder beim
 * Push-Dienst nicht mehr vorhanden und deshalb gelöscht (`removedEndpoints`).
 */
export type PushResult =
  | { configured: false }
  | {
      configured: true;
      devices: number;
      sent: number;
      failed: number;
      removedEndpoints: string[];
    };

type DeviceOutcome = "sent" | "failed" | "removed";

/**
 * Schickt eine Benachrichtigung an alle angemeldeten Admin-Geräte. Geräte
 * werden unabhängig voneinander beliefert – ein totes Abo darf die übrigen
 * nicht aufhalten – und abgelaufene Abos dabei gleich aufgeräumt.
 */
export async function sendPushToAdmins(payload: PushPayload): Promise<PushResult> {
  const config = vapidConfig();
  if (!config) {
    return { configured: false };
  }

  const subscriptions = await db.select().from(pushSubscription);
  const body = JSON.stringify(payload);

  const outcomes = await Promise.all(
    subscriptions.map(async (subscription): Promise<DeviceOutcome> => {
      // Zweite Linie: Auch ein Abo, das an der API-Prüfung vorbei in die
      // Datenbank gelangt ist, wird nie an einen fremden Host gesendet.
      if (!isAllowedPushEndpoint(subscription.endpoint)) {
        console.error("Push-Abo mit unbekanntem Host übersprungen", subscription.id);
        return "failed";
      }
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body,
          {
            vapidDetails: config,
            // Eine Anfrage ist auch Stunden später noch relevant, etwa wenn das
            // Handy über Nacht aus war – der Push-Dienst hält sie einen Tag vor.
            TTL: 60 * 60 * 24,
          },
        );
        return "sent";
      } catch (error) {
        if (isSubscriptionGone(error)) {
          try {
            await db.delete(pushSubscription).where(eq(pushSubscription.id, subscription.id));
          } catch (deleteError) {
            // Das Abo ist trotzdem tot; beim nächsten Versand wird erneut gelöscht.
            console.error("Abgelaufenes Push-Abo konnte nicht gelöscht werden", safeError(deleteError));
          }
          return "removed";
        }
        console.error("Push-Benachrichtigung fehlgeschlagen", safeError(error));
        return "failed";
      }
    }),
  );

  return {
    configured: true,
    devices: subscriptions.length,
    sent: outcomes.filter((outcome) => outcome === "sent").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
    removedEndpoints: subscriptions
      .filter((_, index) => outcomes[index] === "removed")
      .map((subscription) => subscription.endpoint),
  };
}

export type TestPushResponse = {
  status: number;
  body: {
    ok: boolean;
    error?: string;
    /**
     * Ist das Gerät, das den Test ausgelöst hat, nach dem Versand noch für
     * Push angemeldet? `null`, wenn es sich nicht zu erkennen gegeben hat.
     */
    currentDeviceActive: boolean | null;
  };
};

/**
 * Antwort auf "Test senden". Erfolg nur, wenn mindestens ein Gerät beliefert
 * wurde – sonst glaubt die Betreiberin, Push funktioniere, und verpasst
 * später Anfragen. `currentEndpoint` ist das Abo des auslösenden Geräts,
 * `currentRegistered`, ob es vor dem Versand in der Datenbank stand.
 */
export function testPushResponse(
  result: PushResult,
  current: { endpoint: string; registered: boolean } | null,
): TestPushResponse {
  if (!result.configured) {
    return {
      status: 503,
      body: {
        ok: false,
        error: "Push ist auf dem Server nicht eingerichtet (VAPID-Schlüssel fehlen).",
        currentDeviceActive: null,
      },
    };
  }

  const currentDeviceActive =
    current === null
      ? null
      : current.registered && !result.removedEndpoints.includes(current.endpoint);

  if (result.devices === 0) {
    return {
      status: 409,
      body: {
        ok: false,
        error:
          "Es ist kein Gerät für Push eingetragen. Bitte Benachrichtigungen auf diesem Gerät neu einschalten.",
        currentDeviceActive,
      },
    };
  }

  if (result.sent === 0) {
    const allRemoved = result.removedEndpoints.length === result.devices;
    return {
      status: 502,
      body: {
        ok: false,
        error: allRemoved
          ? "Kein Gerät erreichbar: Die Anmeldungen waren beim Push-Dienst abgelaufen und wurden entfernt. Bitte Benachrichtigungen neu einschalten."
          : "Der Versand ist fehlgeschlagen, kein Gerät wurde erreicht. Bitte später erneut versuchen.",
        currentDeviceActive,
      },
    };
  }

  return { status: 200, body: { ok: true, currentDeviceActive } };
}
