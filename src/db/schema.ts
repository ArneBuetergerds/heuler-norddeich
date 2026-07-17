import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  date,
  timestamp,
  pgEnum,
  integer,
  check,
} from "drizzle-orm/pg-core";

export const bookingRequestStatus = pgEnum("booking_request_status", [
  "pending",
  "confirmed",
  "declined",
]);

export const bookingRequest = pgTable("booking_request", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  startDate: date("start_date", { mode: "date" }).notNull(),
  endDate: date("end_date", { mode: "date" }).notNull(),
  message: text("message"),
  status: bookingRequestStatus("status").notNull().default("pending"),
  // Freitext-Begründung, die der Gast bei Ablehnung oder Storno per Mail erhält.
  reasonNote: text("reason_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Einzige Quelle der Wahrheit für die Verfügbarkeit: Jeder Eintrag sperrt einen
 * Zeitraum, unabhängig von seiner Herkunft. Die Herkunft entscheidet nur über
 * die Darstellung:
 *
 *   bookingRequestId gesetzt → Belegung aus bestätigter Anfrage (Gastname per Join)
 *   guestName gesetzt        → manuell eingetragener Aufenthalt (z. B. telefonisch vereinbart)
 *   beide null               → echter Sperrzeitraum (Wartung, Eigennutzung), `note` erklärt ihn
 */
export const blockedPeriod = pgTable(
  "blocked_period",
  {
    id: serial("id").primaryKey(),
    startDate: date("start_date", { mode: "date" }).notNull(),
    endDate: date("end_date", { mode: "date" }).notNull(),
    note: text("note"),
    guestName: text("guest_name"),
    bookingRequestId: integer("booking_request_id").references(
      () => bookingRequest.id,
      { onDelete: "cascade" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Ein Aufenthalt bezieht seinen Gastnamen entweder aus der Anfrage oder aus
    // guestName – nie aus beidem, sonst wäre der anzuzeigende Name mehrdeutig.
    check(
      "blocked_period_guest_source",
      sql`NOT (${table.guestName} IS NOT NULL AND ${table.bookingRequestId} IS NOT NULL)`,
    ),
  ],
);

export type BookingRequest = typeof bookingRequest.$inferSelect;
export type NewBookingRequest = typeof bookingRequest.$inferInsert;
export type BlockedPeriod = typeof blockedPeriod.$inferSelect;
export type NewBlockedPeriod = typeof blockedPeriod.$inferInsert;
