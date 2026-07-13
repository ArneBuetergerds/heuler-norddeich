import { z } from "zod";

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
  );

export type BookingRequestInput = z.infer<typeof bookingRequestSchema>;
