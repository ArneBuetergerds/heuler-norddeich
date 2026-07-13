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
  .refine((data) => data.startDate >= new Date(new Date().toDateString()), {
    message: "Anreisedatum darf nicht in der Vergangenheit liegen",
    path: ["startDate"],
  });

export type BookingRequestInput = z.infer<typeof bookingRequestSchema>;
