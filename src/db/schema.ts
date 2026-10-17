import { sql } from "drizzle-orm";
import {
  mysqlTable,
  int,
  text,
  date,
  timestamp,
  mysqlEnum,
  check,
  varchar,
  json,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { MAX_GUESTS } from "../lib/pricing";
import type { InvoiceSnapshot } from "../lib/invoice";

export const bookingRequestStatus = ["pending", "confirmed", "declined"] as const;

export const bookingRequest = mysqlTable(
  "booking_request",
  {
    id: int("id").autoincrement().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    startDate: date("start_date", { mode: "date" }).notNull(),
    endDate: date("end_date", { mode: "date" }).notNull(),
    message: text("message"),
    // Personenzahl: begrenzt zugleich, wie viele Wäschesätze bestellbar sind.
    guests: int("guests").notNull().default(1),
    // Zusatzleistungen, je Satz und Aufenthalt, bar vor Ort. Zahl statt
    // Ja/Nein, weil selten alle Gäste Wäsche brauchen - manche bringen eigene
    // mit.
    linens: int("linens").notNull().default(0),
    towels: int("towels").notNull().default(0),
    status: mysqlEnum("status", bookingRequestStatus).notNull().default("pending"),
    // Freitext-Begründung, die der Gast bei Ablehnung oder Storno per Mail erhält.
    reasonNote: text("reason_note"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "booking_request_guests_range",
      sql`${table.guests} >= 1 AND ${table.guests} <= ${sql.raw(String(MAX_GUESTS))}`,
    ),
    // Mehr Wäschesätze als Gäste zu bestellen ergibt keinen Sinn und wäre in
    // der Abrechnung vor Ort nur eine Rückfrage.
    check(
      "booking_request_extras_range",
      sql`${table.linens} >= 0 AND ${table.linens} <= ${table.guests}
          AND ${table.towels} >= 0 AND ${table.towels} <= ${table.guests}`,
    ),
  ],
);

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

/**
 * Ausgestellte Rechnungen. Eine Rechnung ist ein unveränderliches Dokument:
 * Ihr kompletter Inhalt steht als Snapshot in `snapshot`, das PDF wird bei
 * jedem Abruf daraus erzeugt – nie aus den aktuellen Preisen.
 */
export const invoice = mysqlTable(
  "invoice",
  {
    id: int("id").autoincrement().primaryKey(),
    year: int("year").notNull(),
    sequence: int("sequence").notNull(),
    number: varchar("number", { length: 32 }).notNull(),
    // Kein onDelete-cascade, bewusst: Ausgestellte Rechnungen müssen
    // aufbewahrt werden. Die Voreinstellung (restrict) verhindert, dass eine
    // Anfrage gelöscht wird, zu der es eine Rechnung gibt.
    bookingRequestId: int("booking_request_id")
      .notNull()
      .references(() => bookingRequest.id),
    snapshot: json("snapshot").$type<InvoiceSnapshot>().notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    // Die laufende Nummer ist je Jahr eindeutig – das ist die Garantie gegen
    // doppelt vergebene Nummern, auch wenn zwei Rechnungen gleichzeitig
    // entstehen.
    uniqueIndex("invoice_year_sequence").on(table.year, table.sequence),
    uniqueIndex("invoice_number").on(table.number),
    // Eine Rechnung je Buchung. Eine Korrektur wäre eine Stornorechnung plus
    // neue Rechnung, kein Überschreiben.
    uniqueIndex("invoice_booking_request").on(table.bookingRequestId),
  ],
);

/**
 * Push-Abos der Admin-Geräte. Ein Eintrag je Browser bzw. installierter App:
 * Sabrina kann Handy und Rechner unabhängig voneinander an- und abmelden.
 * Die Felder sind genau das, was der Browser bei `pushManager.subscribe()`
 * liefert – mehr braucht `web-push` für den Versand nicht.
 */
export const pushSubscription = mysqlTable(
  "push_subscription",
  {
    id: int("id").autoincrement().primaryKey(),
    // Die Endpoint-URL identifiziert das Abo. 700 Zeichen passen bei utf8mb4
    // noch in einen InnoDB-Index (3072 Byte); reale Endpoints liegen weit
    // darunter.
    endpoint: varchar("endpoint", { length: 700 }).notNull(),
    p256dh: varchar("p256dh", { length: 255 }).notNull(),
    auth: varchar("auth", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("push_subscription_endpoint").on(table.endpoint)],
);

export type BookingRequest = typeof bookingRequest.$inferSelect;
export type NewBookingRequest = typeof bookingRequest.$inferInsert;
export type BlockedPeriod = typeof blockedPeriod.$inferSelect;
export type NewBlockedPeriod = typeof blockedPeriod.$inferInsert;
export type Invoice = typeof invoice.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscription.$inferSelect;
