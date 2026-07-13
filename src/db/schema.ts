import { pgTable, serial, text, date, timestamp, pgEnum } from "drizzle-orm/pg-core";

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const blockedPeriod = pgTable("blocked_period", {
  id: serial("id").primaryKey(),
  startDate: date("start_date", { mode: "date" }).notNull(),
  endDate: date("end_date", { mode: "date" }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BookingRequest = typeof bookingRequest.$inferSelect;
export type NewBookingRequest = typeof bookingRequest.$inferInsert;
export type BlockedPeriod = typeof blockedPeriod.$inferSelect;
export type NewBlockedPeriod = typeof blockedPeriod.$inferInsert;
