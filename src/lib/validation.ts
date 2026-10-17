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

export const bookingRequestSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name ist erforderlich")
      .max(100, "Der Name ist zu lang")
      .regex(NAME_PATTERN, "Bitte nur den Namen angeben (Buchstaben, Leerzeichen, Bindestrich)"),
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
  })
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
    // Spiegelt die CHECK-Constraint der Tabelle: mehr Wäschesätze als Gäste
    // ergeben keinen Sinn. Hier abgefangen, damit der Gast eine Meldung sieht
    // statt eines Datenbankfehlers.
    for (const key of ["linens", "towels"] as const) {
      if (data[key] > data.guests) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Nicht mehr Sätze als Personen",
        });
      }
    }

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
 * Manueller Eintrag im Admin: mit `guestName` ein telefonisch vereinbarter
 * Aufenthalt, ohne einen reinen Sperrzeitraum (Wartung, Eigennutzung).
 *
 * Die beiden meinen mit `endDate` Verschiedenes: beim Aufenthalt den
 * Abreisetag (zählt nicht mit, `createManualStay` speichert ihn so), beim
 * Sperrzeitraum den letzten gesperrten Tag (zählt mit, `createMaintenanceBlock`
 * rechnet einen Tag dazu). Ein Sperrzeitraum darf deshalb an einem Tag
 * beginnen und enden, ein Aufenthalt braucht mindestens eine Nacht.
 */
export const blockedPeriodCreateSchema = z
  .object({
    startDate: z.coerce.date({ error: "Bitte ein gültiges Startdatum angeben" }),
    endDate: z.coerce.date({ error: "Bitte ein gültiges Enddatum angeben" }),
    note: z.string().optional(),
    guestName: z.string().min(1, "Bitte einen Gastnamen angeben").optional(),
  })
  .superRefine((data, ctx) => {
    if (data.guestName !== undefined) {
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
