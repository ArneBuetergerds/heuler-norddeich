import type { BookingRequest } from "../db/schema";

/** Die drei Benachrichtigungen zu einer neuen Anfrage, als Funktionen übergeben, damit sie testbar sind. */
export type BookingRequestNotifiers = {
  pushAdmins: (request: BookingRequest) => Promise<unknown>;
  notifyOperator: (request: BookingRequest) => Promise<unknown>;
  confirmToGuest: (request: BookingRequest) => Promise<unknown>;
};

/**
 * Benachrichtigt nach einer gespeicherten Anfrage Betreiberin und Gast.
 *
 * Die Anfrage ist zu diesem Zeitpunkt gespeichert – ein Mailfehler darf sie
 * nicht verwerfen, sonst verliert der Gast seine Eingabe wegen eines Problems
 * beim Versand. Alles wird unabhängig versendet: schlägt eins fehl, sollen
 * die anderen trotzdem rausgehen.
 *
 * `withinGlobalLimit = false` heißt: Das Gesamtlimit über alle Besucher ist
 * überschritten (möglicher Angriff über viele IPs). Die Anfrage wird dann
 * trotzdem angenommen und die Betreiberin benachrichtigt – ein echter Gast
 * soll nie abgewiesen werden. Nur die Eingangsbestätigung an die vom Absender
 * angegebene Adresse entfällt: Sie ist die einzige Mail an eine fremde
 * Adresse, und ohne diese Bremse ließe sich das Formular als Mail-Relay
 * benutzen.
 */
export async function notifyAboutBookingRequest(
  request: BookingRequest,
  { withinGlobalLimit }: { withinGlobalLimit: boolean },
  notifiers: BookingRequestNotifiers,
): Promise<void> {
  const jobs: Promise<unknown>[] = [
    notifiers.pushAdmins(request).catch((error: unknown) => {
      console.error("Push an die Betreiberin fehlgeschlagen", error);
    }),
    notifiers.notifyOperator(request).catch((error: unknown) => {
      console.error("Benachrichtigung des Betreibers fehlgeschlagen", error);
    }),
  ];

  if (withinGlobalLimit) {
    jobs.push(
      notifiers.confirmToGuest(request).catch((error: unknown) => {
        console.error("Eingangsbestätigung an den Gast fehlgeschlagen", error);
      }),
    );
  } else {
    // Bewusst ohne Name, Adresse oder ID: Das Log soll nur das Ereignis zeigen.
    console.warn(
      "Globales Anfrage-Limit überschritten – Anfrage gespeichert, Eingangsbestätigung an den Gast nicht verschickt",
    );
  }

  await Promise.allSettled(jobs);
}
