import { z } from "zod";
import { seasonForDate, nightsBetween } from "./pricing";

export const bookingRequestSchema = z
  .object({
    name: z.string().min(1, "Name ist erforderlich"),
    email: z.string().email("Ungültige E-Mail-Adresse"),
    phone: z.string().optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    message: z.string().optional(),
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
    // `.refine()`s Funktions-Form für dynamische Messages wird bei der
    // Schema-Erstellung ausgewertet statt pro Validierung (in dieser
    // Zod-Version wirkungslos) - für eine vom Anreisedatum abhängige
    // Meldung braucht es `.superRefine()` mit `ctx.addIssue()`.
    const season = seasonForDate(data.startDate);
    if (nightsBetween(data.startDate, data.endDate) < season.minNights) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: `Für Anreisen in diesem Zeitraum (${season.label}) sind mindestens ${season.minNights} Nächte erforderlich`,
      });
    }
  });

export type BookingRequestInput = z.infer<typeof bookingRequestSchema>;
