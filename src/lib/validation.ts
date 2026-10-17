import { z } from "zod";
import { minNightsMessage, extrasBookable, nightsBetween, MAX_GUESTS } from "./pricing";

/**
 * Obergrenzen gegen Missbrauch. Ohne sie legt ein einzelner Request mit
 * Abreise im Jahr 9999 den Server lahm: Die Preisberechnung erzeugt ein Objekt
 * pro Nacht, also Millionen.
 */
export const MAX_NIGHTS = 60;
export const MAX_MONTHS_AHEAD = 24;

/**
 * Nur Buchstaben (inkl. Umlaute und Akzente), Leerzeichen, Punkt, Bindestrich
 * und Apostroph. Der Name steht in der Eingangsbestätigung an die angegebene
 * Adresse – ohne diese Regel ließe sich darüber beliebiger Text (Links,
 * Werbung) an fremde Postfächer schicken.
 */
const NAME_PATTERN = /^[\p{L}][\p{L}\p{M} .'’-]*$/u;

/**
 * Web- oder Mailadressen im Namen. Das Zeichenmuster oben lässt Punkte zu
 * (für „Dr.“, „St.“, „J. R. R.“) – damit käme aber „www.beispiel.com Jetzt
 * gewinnen“ durch und stünde als Werbung in der Mail an eine fremde Adresse.
 *
 * Domain-artig heißt: auf einen Punkt folgen ohne Leerzeichen mindestens zwei
 * Buchstaben („beispiel.com“, „x.de“). Abkürzungen haben nach dem Punkt ein
 * Leerzeichen oder nur einen einzelnen Buchstaben („J.R.R.“). Dazu „www“ und
 * „http“ als eigenes Wort sowie „://“ und „@“ – die beiden letzten verbietet
 * schon das Zeichenmuster, sie stehen hier, damit die Regel für sich allein
 * vollständig ist.
 */
const ADDRESS_IN_NAME = [
  /\p{L}\.[\p{L}\p{M}]{2,}/u,
  /(?<!\p{L})www(?!\p{L})/iu,
  /(?<!\p{L})https?(?!\p{L})/iu,
  /:\/\//,
  /@/,
];

export function looksLikeAddress(name: string): boolean {
  return ADDRESS_IN_NAME.some((pattern) => pattern.test(name));
}

/**
 * Felder einer Anfrage ohne die Regeln über ihr Zusammenspiel. Geteilt vom
 * öffentlichen Formular (`bookingRequestSchema`) und der manuellen Buchung im
 * Admin (`manualBookingSchema`), damit Namensregel, E-Mail, Telefon und
 * Personenzahl an beiden Stellen gleich geprüft werden.
 */
const bookingRequestFields = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name ist erforderlich")
    .max(100, "Der Name ist zu lang")
    .regex(NAME_PATTERN, "Bitte nur den Namen angeben (Buchstaben, Leerzeichen, Bindestrich)")
    .refine(
      (name) => !looksLikeAddress(name),
      "Bitte nur den Namen angeben, ohne Web- oder E-Mail-Adresse",
    ),
  email: z.string().trim().max(254, "Die E-Mail-Adresse ist zu lang").email("Ungültige E-Mail-Adresse"),
  phone: z
    .string()
    .trim()
    .max(40, "Die Telefonnummer ist zu lang")
    .regex(/^[0-9+()/ .-]*$/, "Bitte nur Ziffern und + ( ) / - verwenden")
    .optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  message: z.string().trim().max(2000, "Die Nachricht ist zu lang (max. 2000 Zeichen)").optional(),
  guests: z.coerce.number().int().min(1).max(MAX_GUESTS),
  linens: z.coerce.number().int().min(0).default(0),
  towels: z.coerce.number().int().min(0).default(0),
});

/**
 * Spiegelt die CHECK-Constraint der Tabelle: mehr Wäschesätze als Gäste
 * ergeben keinen Sinn. Hier abgefangen, damit eine Meldung erscheint statt
 * eines Datenbankfehlers.
 */
function addExtrasWithinGuestsIssues(
  data: { guests: number; linens: number; towels: number },
  ctx: z.RefinementCtx,
): void {
  for (const key of ["linens", "towels"] as const) {
    if (data[key] > data.guests) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: "Nicht mehr Sätze als Personen",
      });
    }
  }
}

export const bookingRequestSchema = bookingRequestFields
  .refine((data) => data.startDate < data.endDate, {
    message: "Anreisedatum muss vor dem Abreisedatum liegen",
    path: ["endDate"],
  })
  .refine(
    (data) => {
      // `z.coerce.date()` parst "YYYY-MM-DD"-Strings (aus <input type="date">)
      // als UTC-Mitternacht. Der Vergleichswert für "heute" muss deshalb
      // ebenfalls in UTC gebildet werden, sonst verschiebt sich die Prüfung
      // für Besucher außerhalb UTC um einen Tag.
      const now = new Date();
      const todayUtc = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      return data.startDate >= todayUtc;
    },
    {
      message: "Anreisedatum darf nicht in der Vergangenheit liegen",
      path: ["startDate"],
    },
  )
  .superRefine((data, ctx) => {
    if (nightsBetween(data.startDate, data.endDate) > MAX_NIGHTS) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: `Online sind bis zu ${MAX_NIGHTS} Nächte anfragbar – für längere Aufenthalte schreiben Sie uns bitte direkt`,
      });
    }

    const latestStart = new Date();
    latestStart.setUTCMonth(latestStart.getUTCMonth() + MAX_MONTHS_AHEAD);
    if (data.startDate > latestStart) {
      ctx.addIssue({
        code: "custom",
        path: ["startDate"],
        message: `Anfragen sind bis zu ${MAX_MONTHS_AHEAD} Monate im Voraus möglich`,
      });
    }
  })
  .superRefine((data, ctx) => {
    addExtrasWithinGuestsIssues(data, ctx);

    // Wäsche braucht eine Woche Vorlauf, gemessen ab der Anreise.
    const now = new Date();
    const todayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    if (
      (data.linens > 0 || data.towels > 0) &&
      !extrasBookable(data.startDate, todayUtc)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["linens"],
        message:
          "Bettwäsche und Handtücher müssen spätestens eine Woche vor Anreise angemeldet werden",
      });
    }
  })
  .superRefine((data, ctx) => {
    // `.refine()`s Funktions-Form für dynamische Messages wird bei der
    // Schema-Erstellung ausgewertet statt pro Validierung (in dieser
    // Zod-Version wirkungslos) - für eine vom Anreisedatum abhängige
    // Meldung braucht es `.superRefine()` mit `ctx.addIssue()`.
    const message = minNightsMessage(data.startDate, data.endDate);
    if (message) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message });
    }
  });

export type BookingRequestInput = z.infer<typeof bookingRequestSchema>;

/**
 * Manuelle Buchung im Admin (z. B. telefonisch vereinbart): eine volle Buchung
 * mit denselben Feldern und Feldregeln wie die Online-Anfrage
 * (`bookingRequestFields`). E-Mail ist Pflicht, weil die Spalte
 * `booking_request.email` NOT NULL ist.
 *
 * Bewusst NICHT geprüft, weil die Betreiberin auch nachträglich und
 * abweichend von den Online-Regeln einträgt: Mindestnächte, höchstens
 * MAX_MONTHS_AHEAD im Voraus, Wäsche eine Woche vorher, Anreise nicht in der
 * Vergangenheit. Geprüft bleiben ein gültiger Zeitraum (Anreise vor Abreise),
 * MAX_NIGHTS als Schutz der Preisberechnung (ein Objekt je Nacht) und
 * höchstens so viele Wäschesätze wie Personen.
 */
export const manualBookingSchema = bookingRequestFields
  .extend({
    startDate: z.coerce.date({ error: "Bitte ein gültiges Anreisedatum angeben" }),
    endDate: z.coerce.date({ error: "Bitte ein gültiges Abreisedatum angeben" }),
  })
  .refine((data) => data.startDate < data.endDate, {
    message: "Die Abreise muss nach der Anreise liegen",
    path: ["endDate"],
  })
  .superRefine((data, ctx) => {
    if (nightsBetween(data.startDate, data.endDate) > MAX_NIGHTS) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: `Höchstens ${MAX_NIGHTS} Nächte je Buchung – längere Aufenthalte bitte aufteilen`,
      });
    }
    addExtrasWithinGuestsIssues(data, ctx);
  });

export type ManualBookingInput = z.infer<typeof manualBookingSchema>;

/**
 * Interne Belegung oder Sperrzeitraum im Admin, jeweils Zeitraum plus
 * optionaler Notiz, ohne Gastdaten.
 *
 * Die beiden meinen mit `endDate` Verschiedenes: Bei der internen Belegung
 * (`internal`, Eigennutzung, Familie, Freunde) ist es der Abreisetag (zählt
 * nicht mit, `createInternalStay` speichert ihn so) – wie bei Gästen. Beim
 * Sperrzeitraum (`block`, z. B. Wartung) ist es der letzte gesperrte Tag
 * (zählt mit, `createMaintenanceBlock` rechnet einen Tag dazu). Ein
 * Sperrzeitraum darf deshalb an einem Tag beginnen und enden, eine interne
 * Belegung braucht mindestens eine Nacht.
 *
 * Manuelle Aufenthalte nur mit Gastnamen (früher `guestName`) werden nicht
 * mehr angelegt: Telefonische Buchungen laufen über `manualBookingSchema`.
 */
export const blockedPeriodCreateSchema = z
  .object({
    kind: z.enum(["block", "internal"], { error: "Bitte die Art des Eintrags wählen" }),
    startDate: z.coerce.date({ error: "Bitte ein gültiges Startdatum angeben" }),
    endDate: z.coerce.date({ error: "Bitte ein gültiges Enddatum angeben" }),
    note: z.string().trim().max(500, "Die Notiz ist zu lang (max. 500 Zeichen)").optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "internal") {
      if (data.startDate >= data.endDate) {
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "Die Abreise muss nach der Anreise liegen",
        });
      }
    } else if (data.startDate > data.endDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Der letzte gesperrte Tag darf nicht vor dem ersten liegen",
      });
    }
  });
