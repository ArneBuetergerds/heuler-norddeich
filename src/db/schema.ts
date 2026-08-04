import { sql } from "drizzle-orm";
import {
  mysqlTable,
  int,
  text,
  date,
  timestamp,
  mysqlEnum,
  check,
} from "drizzle-orm/mysql-core";

export const bookingRequestStatus = ["pending", "confirmed", "declined"] as const;

export const bookingRequest = mysqlTable("booking_request", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  startDate: date("start_date", { mode: "date" }).notNull(),
  endDate: date("end_date", { mode: "date" }).notNull(),
  message: text("message"),
  status: mysqlEnum("status", bookingRequestStatus).notNull().default("pending"),
  // Freitext-Begründung, die der Gast bei Ablehnung oder Storno per Mail erhält.
  reasonNote: text("reason_note"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
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
export const blockedPeriod = mysqlTable(
  "blocked_period",
  {
    id: int("id").autoincrement().primaryKey(),
    startDate: date("start_date", { mode: "date" }).notNull(),
    endDate: date("end_date", { mode: "date" }).notNull(),
    note: text("note"),
    guestName: text("guest_name"),
    bookingRequestId: int("booking_request_id").references(
      () => bookingRequest.id,
      { onDelete: "cascade" },
    ),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
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
