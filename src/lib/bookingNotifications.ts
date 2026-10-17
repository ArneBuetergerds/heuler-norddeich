import type { BookingRequest } from "../db/schema";

/**
 * Gesamtlimit über alle Besucher („globales Limit“): bis zu so vielen
 * gespeicherten Anfragen im Zeitfenster läuft alles normal. Darüber hinaus
 * bekommt der Absender keine Eingangsbestätigung mehr, und die Betreiberin
 * statt Einzelmeldungen nur noch eine Sammelmeldung je Stunde.
 */
export const GLOBAL_REQUEST_LIMIT = 40;
export const GLOBAL_REQUEST_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Höchstens eine Sammelmeldung an die Betreiberin je Intervall. */
export const OPERATOR_DIGEST_INTERVAL_MS = 60 * 60 * 1000;

/** Die drei Benachrichtigungen zu einer neuen Anfrage, als Funktionen übergeben, damit sie testbar sind. */
export type BookingRequestNotifiers = {
  pushAdmins: (request: BookingRequest) => Promise<unknown>;
  notifyOperator: (request: BookingRequest) => Promise<unknown>;
  confirmToGuest: (request: BookingRequest) => Promise<unknown>;
};

/** Sammelmeldung an die Betreiberin: nur die Anzahl, keine Gastdaten. */
export type OperatorDigestNotifiers = {
  mail: (count: number) => Promise<unknown>;
  push: (count: number) => Promise<unknown>;
};

export type OperatorDigest = {
  /** Eine weitere Anfrage über dem Gesamtlimit vormerken. */
  record(): void;
};

/**
 * Sammelt Anfragen über dem Gesamtlimit und meldet sie der Betreiberin
 * gebündelt – höchstens einmal je `intervalMs`.
 *
 * Gezählt wird im Arbeitsspeicher wie in `rateLimit.ts`: Das reicht, weil die
 * App als ein einzelner Container läuft. Nach einem Neustart ist der Zähler
 * leer; noch nicht gemeldete Anfragen erscheinen dann in keiner Sammelmeldung,
 * stehen aber wie alle anderen im Admin. Bei mehreren Instanzen würde jede für
 * sich zählen und melden.
 *
 * Versand über einen Timer statt „beim nächsten Request nach Ablauf der
 * Stunde“: Endet ein Ansturm, käme kein nächster Request mehr, und genau die
 * letzte Gruppe Anfragen bliebe ungemeldet. Der Timer meldet sie in jedem Fall
 * nach spätestens einer Stunde, und der Request-Pfad bleibt frei von
 * Versandarbeit. `next start` läuft im Container dauerhaft, der Timer überlebt
 * also; `unref`, damit er Tests und Skripte nicht am Beenden hindert.
 *
 * Der Timer startet mit der ersten vorgemerkten Anfrage und meldet nach
 * Ablauf alles, was bis dahin zusammengekommen ist. Die nächste Anfrage
 * startet ein neues Intervall – zwischen zwei Meldungen liegt so immer
 * mindestens `intervalMs`.
 */
export function createOperatorDigest({
  notifiers,
  intervalMs = OPERATOR_DIGEST_INTERVAL_MS,
}: {
  notifiers: OperatorDigestNotifiers;
  intervalMs?: number;
}): OperatorDigest {
  let count = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush(): void {
    timer = null;
    const reported = count;
    count = 0;
    if (reported === 0) return;

    // Unabhängig voneinander: Fällt die Mail aus, soll der Push trotzdem
    // rausgehen und umgekehrt. Fehler werden nur geloggt – der Timer hat
    // niemanden, an den er sie zurückgeben könnte.
    void notifiers.mail(reported).catch((error: unknown) => {
      console.error("Sammelmeldung per Mail an die Betreiberin fehlgeschlagen", error);
    });
    void notifiers.push(reported).catch((error: unknown) => {
      console.error("Sammelmeldung per Push an die Betreiberin fehlgeschlagen", error);
    });
  }

  return {
    record() {
      count += 1;
      if (timer === null) {
        timer = setTimeout(flush, intervalMs);
        timer.unref?.();
      }
    },
  };
}

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
 * trotzdem angenommen – ein echter Gast soll nie abgewiesen werden. Es gehen
 * aber keine Einzelmeldungen mehr raus:
 * - keine Eingangsbestätigung an die vom Absender angegebene Adresse. Sie ist
 *   die einzige Mail an eine fremde Adresse; ohne diese Bremse ließe sich das
 *   Formular als Mail-Relay benutzen.
 * - keine Einzel-Mail und kein Einzel-Push an die Betreiberin, sonst würde
 *   ihr Postfach und Handy mit jeder Bot-Anfrage geflutet. Stattdessen merkt
 *   `digest` die Anfrage für die stündliche Sammelmeldung vor.
 */
export async function notifyAboutBookingRequest(
  request: BookingRequest,
  { withinGlobalLimit }: { withinGlobalLimit: boolean },
  notifiers: BookingRequestNotifiers,
  digest: OperatorDigest,
): Promise<void> {
  if (!withinGlobalLimit) {
    digest.record();
    // Bewusst ohne Name, Adresse oder ID: Das Log soll nur das Ereignis zeigen.
    console.warn(
      "Globales Anfrage-Limit überschritten – Anfrage gespeichert, nur für die Sammelmeldung vorgemerkt",
    );
    return;
  }

  await Promise.allSettled([
    notifiers.pushAdmins(request).catch((error: unknown) => {
      console.error("Push an die Betreiberin fehlgeschlagen", error);
    }),
    notifiers.notifyOperator(request).catch((error: unknown) => {
      console.error("Benachrichtigung des Betreibers fehlgeschlagen", error);
    }),
    notifiers.confirmToGuest(request).catch((error: unknown) => {
      console.error("Eingangsbestätigung an den Gast fehlgeschlagen", error);
    }),
  ]);
}
