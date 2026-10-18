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
  index,
} from "drizzle-orm/mysql-core";
import { MAX_GUESTS } from "../lib/pricing";
import type { InvoiceSnapshot } from "../lib/invoice";
import type { AdminAction, AdminActionDetails } from "../lib/adminActions";

export const bookingRequestStatus = ["pending", "confirmed", "declined"] as const;

/**
 * Herkunft einer Anfrage: `online` über das Formular der Website, `manual`
 * von der Betreiberin im Admin eingetragen (z. B. telefonisch vereinbart).
 * Eine manuelle Buchung ist sofort bestätigt und bekommt keine automatischen
 * Mails; sonst verhält sie sich wie eine Online-Buchung (Rechnung,
 * Löschfristen, Anonymisierung).
 */
export const bookingRequestSource = ["online", "manual"] as const;
export type BookingRequestSource = (typeof bookingRequestSource)[number];

export const bookingRequest = mysqlTable(
  "booking_request",
  {
    id: int("id").autoincrement().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    // Rechnungsanschrift: Empfänger der Rechnung, die mit der Bestätigung
    // verschickt wird. Online Pflicht, bei manuellen Buchungen optional.
    // Nullable, weil Anfragen von vor diesen Spalten keine Anschrift haben –
    // für sie fragt der Bestätigen-Dialog sie ab. Längen wie in
    // src/lib/invoice.ts (ADDRESS_LIMITS).
    street: varchar("street", { length: 150 }),
    postalCode: varchar("postal_code", { length: 12 }),
    city: varchar("city", { length: 100 }),
    country: varchar("country", { length: 60 }),
    startDate: date("start_date", { mode: "date" }).notNull(),
    endDate: date("end_date", { mode: "date" }).notNull(),
    message: text("message"),
    // Personenzahl: begrenzt zugleich, wie viele Wäschesätze bestellbar sind.
    guests: int("guests").notNull().default(1),
    // Davon Kinder unter 14 Jahren: Sie zahlen keinen Gästebeitrag der Stadt
    // Norden (src/lib/pricing.ts, `payingGuests`). Default 0 für Anfragen von
    // vor dieser Spalte – für sie zahlen alle Gäste (BDS-006). Mindestens eine
    // Person ist 14 oder älter, siehe Check unten.
    guestsUnder14: int("guests_under_14").notNull().default(0),
    // Zusatzleistungen, je Satz und Aufenthalt, bar vor Ort. Zahl statt
    // Ja/Nein, weil selten alle Gäste Wäsche brauchen - manche bringen eigene
    // mit.
    linens: int("linens").notNull().default(0),
    towels: int("towels").notNull().default(0),
    status: mysqlEnum("status", bookingRequestStatus).notNull().default("pending"),
    // Default `online`: Alle Zeilen von vor dieser Spalte kamen über die Website.
    source: mysqlEnum("source", bookingRequestSource).notNull().default("online"),
    // Freitext-Begründung, die der Gast bei Ablehnung oder Storno per Mail erhält.
    reasonNote: text("reason_note"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    // Zeitpunkt der letzten Entscheidung: Bestätigung, Absage oder Storno.
    // Ab ihm läuft die Löschfrist abgelehnter und stornierter Anfragen
    // (src/lib/retention.ts). Nullable, damit Zeilen von vor dieser Spalte
    // gültig bleiben; für sie gilt ersatzweise `created_at`.
    decidedAt: timestamp("decided_at", { mode: "date" }),
    // Gesetzt, sobald Name, E-Mail, Telefon, Anschrift und Nachricht entfernt wurden,
    // weil eine aufzubewahrende Rechnung das Löschen der Zeile verhindert.
    anonymizedAt: timestamp("anonymized_at", { mode: "date" }),
    // Nachweis des Vertragsinhalts: wann der Gast im Online-Formular die
    // Mietbedingungen bestätigt hat und welchen Stand
    // (RENTAL_TERMS_VERSION, src/lib/rentalTerms.ts, "YYYY-MM-DD"). Nullable:
    // Anfragen von vor diesen Spalten und manuelle Buchungen haben keinen
    // Haken. Bleiben bei der Anonymisierung stehen – sie sagen ohne Name und
    // Kontaktdaten nichts über eine Person, belegen aber, welche Bedingungen
    // für die aufbewahrte Rechnung galten.
    termsAcceptedAt: timestamp("terms_accepted_at", { mode: "date" }),
    termsVersion: varchar("terms_version", { length: 20 }),
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
    // Mindestens eine Person ist 14 oder älter: Unter 14 sind höchstens alle
    // Gäste bis auf einen. Dieselbe Regel prüft die Validierung
    // (`addUnder14WithinGuestsIssues` in src/lib/validation.ts).
    check(
      "booking_request_guests_under_14_range",
      sql`${table.guestsUnder14} >= 0 AND ${table.guestsUnder14} <= ${table.guests} - 1`,
    ),
  ],
);

/**
 * Art eines Eintrags in `blocked_period`:
 *
 *   booking     → Belegung aus bestätigter Anfrage (online oder manuell
 *                 eingetragen), `bookingRequestId` gesetzt, Gastname per Join
 *   block       → Sperrzeitraum ohne Personenbezug (z. B. Wartung), `note`
 *                 erklärt ihn; wird nicht automatisch gelöscht
 *   internal    → interne Belegung (Eigennutzung, Familie, Freunde): Zeitraum
 *                 plus `note`, keine Rechnung, keine Gastdaten; wird
 *                 INTERNAL_RETENTION_MONTHS nach dem Ende gelöscht
 *   legacy_stay → ALTBESTAND: früher manuell eingetragener Aufenthalt nur mit
 *                 `guestName`. Wird nicht mehr neu angelegt, bleibt aber les-
 *                 und anzeigbar und läuft wie eine Buchung ab
 *                 (src/lib/retention.ts), bis er als manuelle Buchung oder
 *                 interne Belegung neu eingetragen ist.
 */
export const blockedPeriodKind = ["booking", "block", "internal", "legacy_stay"] as const;
export type BlockedPeriodKind = (typeof blockedPeriodKind)[number];

/**
 * Einzige Quelle der Wahrheit für die Verfügbarkeit: Jeder Eintrag sperrt einen
 * Zeitraum, unabhängig von seiner Art (`kind`, siehe `blockedPeriodKind`).
 * Die Art entscheidet über Darstellung und Löschfrist.
 */
export const blockedPeriod = mysqlTable(
  "blocked_period",
  {
    id: int("id").autoincrement().primaryKey(),
    startDate: date("start_date", { mode: "date" }).notNull(),
    endDate: date("end_date", { mode: "date" }).notNull(),
    // Default `block` nur für das Hinzufügen der Spalte: Die Migration ordnet
    // Altbestand danach per UPDATE zu (Anfrage → booking, Gastname →
    // legacy_stay). Neue Einträge setzen die Art immer ausdrücklich, außer
    // dem Sperrzeitraum, für den der Default zutrifft.
    kind: mysqlEnum("kind", blockedPeriodKind).notNull().default("block"),
    note: text("note"),
    // Nur Altbestand (`kind = legacy_stay`), siehe `blockedPeriodKind`.
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
    // Art und Herkunft passen zusammen: genau Belegungen haben eine Anfrage,
    // genau Altbestands-Aufenthalte einen Gastnamen. Interne Belegungen und
    // Sperrzeiträume haben beides nicht.
    check(
      "blocked_period_kind_booking",
      sql`(${table.kind} = 'booking') = (${table.bookingRequestId} IS NOT NULL)`,
    ),
    check(
      "blocked_period_kind_legacy_stay",
      sql`(${table.kind} = 'legacy_stay') = (${table.guestName} IS NOT NULL)`,
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

/**
 * Protokoll administrativer Aktionen (Bestätigen, Stornieren, Löschen, …).
 *
 * `booking_request_id` und `blocked_period_id` sind bewusst einfache Zahlen
 * ohne Fremdschlüssel: Ein Eintrag soll die Löschung des Datensatzes, auf den
 * er sich bezieht, überdauern. `details` enthält nie Gastdaten (Name,
 * Kontakt, Nachricht), nur Zeiträume, Status und Anzahlen.
 *
 * Aufbewahrung: ACTION_LOG_RETENTION_YEARS in src/lib/retention.ts; ältere
 * Einträge räumt die automatische Löschung mit auf.
 */
export const adminActionLog = mysqlTable(
  "admin_action_log",
  {
    id: int("id").autoincrement().primaryKey(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    // E-Mail des angemeldeten Admins oder "system" für die automatische Löschung.
    actor: varchar("actor", { length: 320 }).notNull(),
    // varchar statt Enum: Eine neue Aktion braucht so keine Migration.
    action: varchar("action", { length: 32 }).$type<AdminAction>().notNull(),
    bookingRequestId: int("booking_request_id"),
    blockedPeriodId: int("blocked_period_id"),
    details: json("details").$type<AdminActionDetails>(),
  },
  // Die automatische Löschung räumt nach `created_at` auf.
  (table) => [index("admin_action_log_created_at").on(table.createdAt)],
);

export type BookingRequest = typeof bookingRequest.$inferSelect;
export type NewBookingRequest = typeof bookingRequest.$inferInsert;
export type BlockedPeriod = typeof blockedPeriod.$inferSelect;
export type NewBlockedPeriod = typeof blockedPeriod.$inferInsert;
export type Invoice = typeof invoice.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscription.$inferSelect;
export type AdminActionLogRow = typeof adminActionLog.$inferSelect;
export type NewAdminActionLogRow = typeof adminActionLog.$inferInsert;
