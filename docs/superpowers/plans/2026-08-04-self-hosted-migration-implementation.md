# Umzug auf Self-Hosting (VPS/Coolify, MySQL, IONOS-Mail) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Website von Vercel/Neon/Resend auf eine selbst betriebene VPS/Coolify-Plattform mit eigener MySQL-Datenbank und Mail-Versand über die eigene Domain (IONOS) umziehen, damit keine externen Anbieter mehr involviert sind.

**Architecture:** Next.js-App unverändert (App Router, next-auth Credentials-Login ohne DB-Adapter). Drei unabhängige Umbauten: (1) Datenbankschicht von `drizzle-orm/neon-serverless` (Postgres) auf `drizzle-orm/mysql2` (MySQL), (2) Mail-Versand von Resend auf Nodemailer mit SMTP über eine IONOS-Mailbox, (3) Containerisierung per Dockerfile für Coolify-Deployment mit automatischer Migration beim Start.

**Tech Stack:** Next.js 16, drizzle-orm + drizzle-kit, `mysql2`, `nodemailer`, Docker (node:20-alpine), Coolify (Traefik-Routing), IONOS (Domain + Mailboxen + SMTP).

## Global Constraints

- Domain: `norddeich-heuler.de`. Mailboxen: `noreply@norddeich-heuler.de` (SMTP-Login zum Versenden), `kontakt@norddeich-heuler.de` (Empfänger der Betreiber-Benachrichtigung).
- SMTP: `smtp.ionos.de`, Port 587, STARTTLS.
- MySQL ≥ 8.0.16 (wird für nativen `CHECK`-Constraint-Support vorausgesetzt).
- Keine Datenmigration nötig — die bestehende Neon-DB enthält nur einen Smoke-Test-Datensatz.
- `src/auth.ts` ist von der DB-Migration nicht betroffen (next-auth nutzt keinen DB-Adapter).
- Docker-Image nutzt bewusst **kein** `output: "standalone"` — stattdessen ein normales `npm ci` (alle Dependencies) + `next start` im finalen Stage. Grund: `drizzle-kit`, das für die automatische Migration beim Container-Start gebraucht wird, taucht in Next.js' Standalone-Dependency-Tracing nicht auf, da es nirgends vom App-Code importiert wird (nur per CLI aufgerufen). Ein normales Image vermeidet diesen Sonderfall.
- Für lokale Verifikation steht bereits eine lokal laufende MySQL-Instanz per Docker zur Verfügung (nicht Teil dieses Repos).
- Nach jedem `npm install`/`npm uninstall` muss `package-lock.json` mit committet werden — der Dockerfile-Build nutzt `npm ci`, das eine synchrone Lockfile voraussetzt.

---

### Task 1: Datenbank-Client auf MySQL umstellen

**Files:**
- Modify: `package.json` (via `npm install`/`npm uninstall`, nicht manuell editieren)
- Modify: `src/db/schema.ts`
- Modify: `src/db/client.ts`
- Modify: `drizzle.config.ts`
- Modify: `src/app/api/booking-request/route.ts` (**Nachtrag, während Task 1 entdeckt:** diese Route nutzt ebenfalls `.insert(...).returning()`, das unter `drizzle-orm/mysql2` nicht existiert. War im ursprünglichen Scope von Task 1 nicht erfasst — ohne den Fix hier hätte Step 6 (`tsc --noEmit`, 0 Fehler) gar nicht erfüllbar sein können. Fix analog zu `scripts/verify-booking-flow.ts`: `.returning()` → `.$returningId()`, anschließend die vollständige Zeile per `db.select().from(bookingRequest).where(eq(bookingRequest.id, id))` nachladen, da der volle Datensatz für die E-Mail-Templates gebraucht wird.)
- Delete: `drizzle/0000_adorable_otto_octavius.sql`, `drizzle/0001_sturdy_wasp.sql`, `drizzle/meta/*`
- Create: neue `drizzle/0000_*.sql` + `drizzle/meta/*` (per `drizzle-kit generate`)

**Interfaces:**
- Produces: `db` (aus `src/db/client.ts`, unverändertes Interface — wird von `src/db/queries.ts` und `src/db/adminQueries.ts` weiterhin exakt so importiert wie bisher: `import { db } from "./client"`).
- Produces: `bookingRequest`, `blockedPeriod` Tabellen sowie `BookingRequest`, `NewBookingRequest`, `BlockedPeriod`, `NewBlockedPeriod` Typen aus `src/db/schema.ts` — Feldnamen und Typen bleiben identisch zur Postgres-Version, nur der Dialekt ändert sich.

- [ ] **Step 1: Dependencies austauschen**

Run:
```bash
npm uninstall @neondatabase/serverless ws @types/ws
npm install mysql2
```

- [ ] **Step 2: `src/db/schema.ts` auf `mysql-core` umstellen**

Ersetze den kompletten Inhalt von `src/db/schema.ts` durch:

```ts
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
```

- [ ] **Step 3: `src/db/client.ts` auf `mysql2` umstellen**

Ersetze den kompletten Inhalt von `src/db/client.ts` durch:

```ts
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL ist nicht gesetzt");
}

const pool = mysql.createPool(process.env.DATABASE_URL);
export const db = drizzle({ client: pool, schema, mode: "default" });
```

- [ ] **Step 4: `drizzle.config.ts` auf MySQL-Dialekt umstellen**

In `drizzle.config.ts`, Zeile `dialect: "postgresql",` ersetzen durch `dialect: "mysql",`. Der Rest der Datei (das `.env.local`-Loading, `out`, `schema`, `dbCredentials.url`) bleibt unverändert.

- [ ] **Step 5: Alte Postgres-Migrationen löschen und für MySQL neu generieren**

Run:
```bash
rm drizzle/0000_adorable_otto_octavius.sql drizzle/0001_sturdy_wasp.sql
rm -rf drizzle/meta
npx drizzle-kit generate
```

Erwartet: `drizzle-kit` legt eine neue `drizzle/0000_*.sql` (mit `CREATE TABLE` in MySQL-Syntax, Backticks statt doppelter Anführungszeichen) sowie `drizzle/meta/_journal.json` und `drizzle/meta/0000_snapshot.json` an.

- [ ] **Step 6: Typecheck und bestehende Testsuite laufen lassen**

Run: `npx tsc --noEmit && npm test`
Expected: beide Befehle laufen fehlerfrei durch (0 TS-Fehler, 31/31 Tests grün). Die Tests sind dialektunabhängig (gemockte `FakeDb` in `adminQueries.test.ts`), sie prüfen also nur, dass durch die Umstellung nichts anderes kaputtgegangen ist.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/db/schema.ts src/db/client.ts drizzle.config.ts drizzle
git commit -m "feat(db): switch database layer from Neon Postgres to MySQL"
```

---

### Task 2: E2E-Verify-Skript gegen die lokale MySQL-DB verifizieren

**Files:**
- Keine eigene Code-Änderung mehr — `scripts/verify-booking-flow.ts` wurde bereits in Task 1 auf MySQL umgestellt (siehe Nachtrag unten). Diese Task führt nur noch die Verifikation gegen eine echte lokale MySQL-Datenbank durch.

**Interfaces:**
- Consumes: `db` aus `src/db/client.ts` (Task 1), `bookingRequest`/`blockedPeriod` aus `src/db/schema.ts` (Task 1), `confirmBookingRequest`/`declineBookingRequest`/`createManualStay`/`cancelStay` aus `src/db/adminQueries.ts` (unverändert), `getOccupancy` aus `src/db/queries.ts` (unverändert).

**Bereits erledigt (Nachtrag):** Die `.returning()` → `$returningId()`-Umstellung in `scripts/verify-booking-flow.ts` wurde schon als Teil von Task 1 durchgeführt — sie war zwingend nötig, damit Task 1s eigener Erfolgstest (`tsc --noEmit`, 0 Fehler) überhaupt erfüllbar war, da das Skript sonst nicht mehr kompiliert hätte. Der Task-1-Implementer hat dabei die Variable `id` statt `requestId` genannt (funktional identisch, keine weitere Code-Änderung nötig) und den Fix bereits im Task-1-Commit `feat(db): switch database layer from Neon Postgres to MySQL` mit committet. Task 2 besteht deshalb nur noch aus Verifikation gegen eine echte lokale MySQL-Datenbank — keine weitere Code-Änderung, kein eigener Commit.

- [ ] **Step 1: Typecheck zur Bestätigung**

Run: `npx tsc --noEmit`
Expected: 0 Fehler.

- [ ] **Step 2: Migrationen gegen die lokale MySQL-Instanz anwenden**

Trage in `.env.local` die `DATABASE_URL` für die bereits laufende lokale MySQL-Instanz ein (Format `mysql://<user>:<passwort>@<host>:<port>/<datenbank>`), dann:

Run: `npx drizzle-kit migrate`
Expected: Meldung, dass die neue MySQL-Migration erfolgreich angewendet wurde; `booking_request` und `blocked_period` existieren danach in der lokalen Datenbank.

- [ ] **Step 3: E2E-Skript ausführen**

Run: `npx tsx --env-file=.env.local scripts/verify-booking-flow.ts`
Expected: Alle Zeilen beginnen mit `OK` (kein `FAIL`), Exit-Code 0. Dies bestätigt Transaktionsverhalten, Check-Constraint und Occupancy-Logik gegen eine echte MySQL-Datenbank.

**Nachtrag, während Task 2 entdeckt:** Der Lauf gegen echtes MySQL zeigte, dass sich `scripts/verify-booking-flow.ts` nach Abschluss aller Checks nicht von selbst beendet (Prozess hängt, statt zu terminieren) — der `mysql2`-Connection-Pool aus `src/db/client.ts` hält den Node-Prozess offen, da er nie geschlossen wird. Unter dem alten Neon-Treiber (WebSocket-basiert) trat das nicht auf. Funktional ist das kein Bug in der Migration selbst (alle 9 Checks laufen korrekt durch), aber ein „einmal laufen und beenden"-Skript, das hängen bleibt, ist ein echter Papercut. Fix in `scripts/verify-booking-flow.ts`:

Ersetze:
```ts
main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
```

durch:
```ts
main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$client.end();
  });
```

(`process.exitCode` statt `process.exit(1)`, damit der Prozess erst nach dem `.finally()` sauber beendet wird, statt den Pool-Schluss abzuwürgen.)

- [ ] **Step 4: Fix verifizieren**

Run: `npx tsx --env-file=.env.local scripts/verify-booking-flow.ts` — erwartet: alle 9 Zeilen `OK`, Prozess beendet sich von selbst (kein Hängenbleiben, kein manuelles Abbrechen nötig).

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-booking-flow.ts
git commit -m "fix(scripts): close the mysql2 pool so the verify script exits cleanly"
```

---

### Task 3: E-Mail-Versand auf Nodemailer umstellen

**Files:**
- Modify: `package.json` (via `npm install`/`npm uninstall`)
- Modify: `src/lib/email.ts`
- Create: `src/lib/email.test.ts`

**Interfaces:**
- Produces: `sendBookingRequestNotification(request: BookingRequest): Promise<void>`, `sendGuestRequestReceived(request: BookingRequest): Promise<void>`, `sendGuestConfirmation(request: BookingRequest): Promise<void>`, `sendGuestDecline(request: BookingRequest, reason?: string | null): Promise<void>` — Signaturen exakt wie bisher, werden von `src/app/api/booking-request/route.ts` und `src/db/adminQueries.ts`-Aufrufern unverändert konsumiert.
- Consumes: `BookingRequest` Typ aus `src/db/schema.ts` (Task 1).

- [ ] **Step 1: Dependencies austauschen**

Run:
```bash
npm uninstall resend
npm install nodemailer
npm install --save-dev @types/nodemailer
```

- [ ] **Step 2: Fehlschlagenden Test für den Nodemailer-Versand schreiben**

Erstelle `src/lib/email.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sendBookingRequestNotification,
  sendGuestRequestReceived,
  sendGuestConfirmation,
  sendGuestDecline,
} from "./email";
import type { BookingRequest } from "@/db/schema";

const sendMail = vi.fn();

vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail }) },
}));

const request: BookingRequest = {
  id: 1,
  name: "Erika Musterfrau",
  email: "erika@example.invalid",
  phone: null,
  startDate: new Date("2027-05-01"),
  endDate: new Date("2027-05-08"),
  message: null,
  status: "pending",
  reasonNote: null,
  createdAt: new Date("2027-01-01"),
};

describe("email", () => {
  beforeEach(() => {
    sendMail.mockReset();
    sendMail.mockResolvedValue(undefined);
    process.env.SMTP_HOST = "smtp.example.invalid";
    process.env.SMTP_USER = "noreply@example.invalid";
    process.env.SMTP_PASS = "secret";
    process.env.OWNER_NOTIFICATION_EMAIL = "kontakt@example.invalid";
  });

  it("benachrichtigt den Betreiber unter der konfigurierten Adresse", async () => {
    await sendBookingRequestNotification(request);

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Ferienwohnung Heuler <noreply@norddeich-heuler.de>",
        to: "kontakt@example.invalid",
        replyTo: request.email,
      }),
    );
  });

  it("bestätigt dem Gast den Eingang unter dessen eigener Adresse", async () => {
    await sendGuestRequestReceived(request);

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: request.email }),
    );
  });

  it("sendet die Zusage an den Gast", async () => {
    await sendGuestConfirmation(request);

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: request.email, subject: expect.stringContaining("bestätigt") }),
    );
  });

  it("wirft, wenn OWNER_NOTIFICATION_EMAIL fehlt", async () => {
    delete process.env.OWNER_NOTIFICATION_EMAIL;

    await expect(sendBookingRequestNotification(request)).rejects.toThrow(
      "OWNER_NOTIFICATION_EMAIL",
    );
  });

  it("wirft eine Exception, wenn der SMTP-Versand fehlschlägt", async () => {
    sendMail.mockRejectedValue(new Error("Verbindung abgelehnt"));

    await expect(sendGuestDecline(request)).rejects.toThrow("Verbindung abgelehnt");
  });
});
```

- [ ] **Step 3: Testlauf zur Bestätigung, dass er fehlschlägt**

Run: `npx vitest run src/lib/email.test.ts`
Expected: FAIL — `src/lib/email.ts` importiert noch `resend`, nicht `nodemailer`; die gemockten Assertions (`from: "...noreply@norddeich-heuler.de..."` etc.) passen nicht zum aktuellen Code.

- [ ] **Step 4: `src/lib/email.ts` auf Nodemailer umstellen**

Ersetze den kompletten Inhalt von `src/lib/email.ts` durch:

```ts
import nodemailer from "nodemailer";
import type { BookingRequest } from "@/db/schema";

const FROM = "Ferienwohnung Heuler <noreply@norddeich-heuler.de>";

const transporter = nodemailer.createTransport({
  pool: true,
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function formatDate(date: Date): string {
  return date.toLocaleDateString("de-DE");
}

function formatRange(request: Pick<BookingRequest, "startDate" | "endDate">): string {
  return `${formatDate(request.startDate)} bis ${formatDate(request.endDate)}`;
}

type Mail = {
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
};

async function send(mail: Mail): Promise<void> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error("SMTP-Zugangsdaten sind nicht konfiguriert");
  }

  await transporter.sendMail({ from: FROM, ...mail });
}

/** Benachrichtigt den Betreiber über eine neu eingegangene Anfrage. */
export async function sendBookingRequestNotification(
  request: BookingRequest,
): Promise<void> {
  const ownerEmail = process.env.OWNER_NOTIFICATION_EMAIL;
  if (!ownerEmail) {
    throw new Error("OWNER_NOTIFICATION_EMAIL ist nicht konfiguriert");
  }

  await send({
    to: ownerEmail,
    replyTo: request.email,
    subject: `Neue Buchungsanfrage von ${request.name}`,
    text: [
      `Name: ${request.name}`,
      `E-Mail: ${request.email}`,
      `Telefon: ${request.phone ?? "-"}`,
      `Zeitraum: ${formatRange(request)}`,
      `Nachricht: ${request.message ?? "-"}`,
    ].join("\n"),
  });
}

/** Bestätigt dem Gast den Eingang seiner Anfrage. */
export async function sendGuestRequestReceived(request: BookingRequest): Promise<void> {
  await send({
    to: request.email,
    subject: "Ihre Anfrage für die Ferienwohnung Heuler",
    text: [
      `Hallo ${request.name},`,
      "",
      `vielen Dank für Ihre Anfrage für den Zeitraum ${formatRange(request)}.`,
      "Wir haben sie erhalten und melden uns in Kürze bei Ihnen.",
      "",
      "Diese E-Mail ist noch keine Buchungsbestätigung.",
      "",
      "Viele Grüße",
      "Ferienwohnung Heuler, Norddeich",
    ].join("\n"),
  });
}

/** Sagt dem Gast den Aufenthalt verbindlich zu. */
export async function sendGuestConfirmation(request: BookingRequest): Promise<void> {
  await send({
    to: request.email,
    subject: "Ihre Buchung für die Ferienwohnung Heuler ist bestätigt",
    text: [
      `Hallo ${request.name},`,
      "",
      `Ihre Buchung für den Zeitraum ${formatRange(request)} ist bestätigt.`,
      "Wir freuen uns auf Ihren Besuch in Norddeich.",
      "",
      "Bei Fragen antworten Sie einfach auf diese E-Mail.",
      "",
      "Viele Grüße",
      "Ferienwohnung Heuler, Norddeich",
    ].join("\n"),
  });
}

/**
 * Informiert den Gast über eine Ablehnung oder eine Stornierung. Beide Fälle
 * teilen denselben Text – aus Sicht des Gasts ist das Ergebnis dasselbe: der
 * Zeitraum kommt nicht zustande.
 */
export async function sendGuestDecline(
  request: BookingRequest,
  reason?: string | null,
): Promise<void> {
  const reasonLines = reason?.trim() ? [`Grund: ${reason.trim()}`, ""] : [];

  await send({
    to: request.email,
    subject: "Ihre Anfrage für die Ferienwohnung Heuler",
    text: [
      `Hallo ${request.name},`,
      "",
      `leider können wir Ihnen den Zeitraum ${formatRange(request)} nicht anbieten.`,
      "",
      ...reasonLines,
      "Gerne prüfen wir einen anderen Termin – antworten Sie dazu einfach auf diese E-Mail.",
      "",
      "Viele Grüße",
      "Ferienwohnung Heuler, Norddeich",
    ].join("\n"),
  });
}
```

- [ ] **Step 5: Test erneut laufen lassen, jetzt erwartet grün**

Run: `npx vitest run src/lib/email.test.ts`
Expected: PASS, alle 5 Tests grün.

- [ ] **Step 6: Gesamte Testsuite und Typecheck**

Run: `npx tsc --noEmit && npm test`
Expected: 0 TS-Fehler, alle Tests (jetzt 36 statt 31) grün.

- [ ] **Step 7: `.env.example` aktualisieren**

Öffne `.env.example` und nimm folgende Änderungen vor:
- Zeile mit `RESEND_API_KEY` entfernen.
- Folgende Zeilen ergänzen:
  ```
  SMTP_HOST=smtp.ionos.de
  SMTP_PORT=587
  SMTP_USER=noreply@norddeich-heuler.de
  SMTP_PASS=
  ```
- Den Beispielwert von `OWNER_NOTIFICATION_EMAIL` auf `kontakt@norddeich-heuler.de` setzen (Variable selbst bleibt, nur der Beispielwert ändert sich).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/lib/email.ts src/lib/email.test.ts .env.example
git commit -m "feat(mail): replace Resend with Nodemailer over IONOS SMTP"
```

---

### Task 4: Datenschutzerklärung an die neue Infrastruktur anpassen

**Files:**
- Modify: `src/app/(site)/datenschutz/page.tsx`

- [ ] **Step 1: Abschnitt 3 (Benachrichtigung) anpassen**

In `src/app/(site)/datenschutz/page.tsx`, ersetze im `SECTIONS`-Array den `body` von `"3. Benachrichtigung"`:

Alt:
```ts
    body: "Nach Eingang einer Anfrage wird automatisch eine Benachrichtigungs-E-Mail über den Dienst Resend an den Betreiber versendet, damit die Anfrage zeitnah bearbeitet werden kann.",
```

Neu:
```ts
    body: "Nach Eingang einer Anfrage wird automatisch eine Benachrichtigungs-E-Mail über unseren E-Mail-Provider IONOS versendet, damit die Anfrage zeitnah bearbeitet werden kann.",
```

- [ ] **Step 2: Abschnitt 4 (Hosting) anpassen**

Ersetze den `body` von `"4. Hosting"`:

Alt:
```ts
    body: "Diese Website wird bei Vercel Inc. gehostet. Beim Aufruf der Seite werden technisch bedingt Zugriffsdaten (z. B. IP-Adresse, Zeitpunkt des Zugriffs) durch den Hosting-Anbieter verarbeitet.",
```

Neu:
```ts
    body: "Diese Website wird auf einem eigenen Server (VPS) betrieben, nicht bei einem externen Cloud-Anbieter. Beim Aufruf der Seite werden technisch bedingt Zugriffsdaten (z. B. IP-Adresse, Zeitpunkt des Zugriffs) auf dieser eigenen Infrastruktur verarbeitet.",
```

- [ ] **Step 3: Verifikation**

Run: `grep -n "Resend\|Vercel" "src/app/(site)/datenschutz/page.tsx"`
Expected: keine Treffer mehr.

Run: `npx tsc --noEmit`
Expected: 0 Fehler.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(site)/datenschutz/page.tsx"
git commit -m "docs: update privacy policy for self-hosted mail and VPS hosting"
```

---

### Task 5: Dockerfile, .dockerignore und Coolify-Deployment vorbereiten

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `npm run build` und `npm run start` aus `package.json` (unverändert vorhanden), `npx drizzle-kit migrate` (Task 1/2 bereits funktionsfähig gegen MySQL).

- [ ] **Step 1: `.dockerignore` anlegen**

Erstelle `.dockerignore`:

```
node_modules
.next
.git
.env
.env.local
.env.*.local
docs
.superpowers
.claude
.closedloop-ai
*.md
```

- [ ] **Step 2: `Dockerfile` anlegen**

Erstelle `Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

EXPOSE 3000
CMD ["sh", "-c", "node_modules/.bin/drizzle-kit migrate && node_modules/.bin/next start"]
```

- [ ] **Step 3: Lokalen Image-Build ausführen**

Run: `docker build -t norddeich-heuler:local .`
Expected: Build läuft ohne Fehler durch (insbesondere `npm run build` innerhalb des `builder`-Stage erfolgreich).

- [ ] **Step 4: Container lokal gegen die laufende lokale MySQL-Instanz testen**

Run (Platzhalter `<user>`, `<passwort>`, `<port>`, `<datenbank>` durch die tatsächlichen Werte der lokalen MySQL-Instanz ersetzen; `--network host` sorgt dafür, dass der Container `localhost` des Hosts direkt erreicht):
```bash
docker run --rm --network host \
  -e DATABASE_URL="mysql://<user>:<passwort>@localhost:<port>/<datenbank>" \
  -e SMTP_HOST=smtp.example.invalid \
  -e SMTP_USER=noreply@example.invalid \
  -e SMTP_PASS=dummy \
  -e OWNER_NOTIFICATION_EMAIL=kontakt@example.invalid \
  -e ADMIN_EMAIL=admin@example.invalid \
  -e ADMIN_PASSWORD_HASH='<bcrypt-hash>' \
  -e AUTH_SECRET='<beliebiger-test-secret>' \
  -e AUTH_TRUST_HOST=true \
  norddeich-heuler:local
```
Expected: Log-Ausgabe zeigt zuerst die `drizzle-kit migrate`-Meldung (Migration bereits angewendet oder neu angewendet), danach den `next start`-Start-Log ("Ready on port 3000"). Mit `curl -I http://localhost:3000` in einem zweiten Terminal prüfen, dass die Startseite mit `200`/`307` antwortet.

- [ ] **Step 5: `.env.example` um Deployment-Variablen ergänzen**

Öffne `.env.example` und ergänze:
```
AUTH_URL=https://norddeich-heuler.de
AUTH_TRUST_HOST=true
```
mit einem Kommentar direkt darüber: `# AUTH_TRUST_HOST=true ist zwingend, sonst weist next-auth v5 Requests hinter Traefiks Reverse-Proxy mit "UntrustedHost" ab.`

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore .env.example
git commit -m "feat(deploy): add Dockerfile for Coolify deployment with automatic migrations"
```

**Nachtrag, während Task 5 entdeckt:** Der lokale `docker build`/`docker run`-Test (Steps 3-4) deckte drei Probleme auf, die im ursprünglichen Plan nicht vorgesehen waren:

1. **Platzhalter-`DATABASE_URL` im `builder`-Stage nötig.** `next build` importiert beim Sammeln der Seiten-/Routendaten transitiv `src/db/client.ts`, das ohne `DATABASE_URL` sofort wirft. `mysql.createPool()` verbindet aber erst bei der ersten echten Query (lazy) — ein Fake-Wert ist während des Builds also gefahrlos. Nur im `builder`-Stage gesetzt (Docker-`ENV` ist Stage-scoped), landet also nicht im finalen Image. Ergänze im Dockerfile vor `RUN npm run build`:
   ```dockerfile
   ENV DATABASE_URL="mysql://build:build@localhost:3306/build"
   ```
2. **`package-lock.json` muss mit npm 10 (nicht npm 11) neu erzeugt werden.** `node:20-alpine` bringt npm 10.8.2 mit; eine mit npm 11 erzeugte Lockfile wird von `npm ci` als "not in sync" abgelehnt (betrifft verschachtelte `optionalDependencies` von `esbuild`, transitiv über `tsx`). Fix: `npm install --package-lock-only` innerhalb eines `node:20-alpine`-Containers ausführen. Keine Dependency-Version ändert sich dabei (`git diff package.json` bleibt leer).
3. **`src/app/(site)/verfuegbarkeit/page.tsx` braucht `export const dynamic = "force-dynamic";`.** Diese Seite fragt `getBlockedPeriods()` direkt ab, ohne `cookies()`/`headers()` — Next.js hätte sie sonst beim Build statisch vorgerendert und die Belegung als Snapshot vom Deploy-Zeitpunkt eingefroren, sodass Gäste dauerhaft veraltete Verfügbarkeit sähen. Das ist ein eigenständiger, vom Docker-Umzug unabhängiger Korrektheits-Bug (auf Vercel+Neon wäre die DB beim Build erreichbar gewesen, das Einfrieren der Daten also lautlos passiert, statt wie hier als Build-Fehler aufzufallen). Die beiden Admin-Seiten, die ebenfalls die DB abfragen, rufen vorher `auth()` auf und sind dadurch bereits dynamisch — nur diese eine Seite war betroffen.

Alle drei Punkte sind in Step 6s Commit `4281b63` bereits mit enthalten (`Dockerfile`, `.dockerignore`, `package-lock.json`, `src/app/(site)/verfuegbarkeit/page.tsx`) — bewusst ein gemeinsamer Commit, da Punkt 2 und 3 beide zwingende Voraussetzungen dafür waren, den in Step 3/4 dokumentierten Build-und-Run-Test überhaupt erfolgreich durchzuführen.

---

## Nach Abschluss aller Tasks (manuell, außerhalb des Repos)

Diese Schritte sind nicht Teil der Implementierung, sondern der eigentliche Go-live (siehe `docs/superpowers/specs/2026-08-04-self-hosted-migration-design.md`, Abschnitt A):

1. Domain `norddeich-heuler.de` + E-Mail-Paket bei IONOS registrieren, Mailboxen `noreply@` und `kontakt@` anlegen.
2. In Coolify: Project/Environment + Application (Source: GitHub-Repo, Build Pack: Dockerfile) sowie eine interne MySQL-Resource anlegen. **Explizit MySQL ≥ 8.0.16 wählen** (Global Constraint) — ältere Versionen parsen `CHECK`-Constraints stillschweigend, ohne sie durchzusetzen; der `blocked_period_guest_source`-Constraint wäre dann wirkungslos, ohne dass die Migration einen Fehler wirft. Nach dem ersten `drizzle-kit migrate` einmal mit `SHOW CREATE TABLE blocked_period;` verifizieren, dass der CHECK-Constraint tatsächlich in der Tabellendefinition steht.
3. Alle Secrets (`DATABASE_URL`, `SMTP_PASS`, `ADMIN_PASSWORD_HASH`, `AUTH_SECRET`) mit „Build Variable" AUS in Coolify eintragen.
4. Erst unter einer Coolify-Plattform-Subdomain deployen und testen. **`AUTH_URL` in dieser Phase noch NICHT setzen** — mit gesetztem `AUTH_URL=https://norddeich-heuler.de` erzeugt next-auth v5 Callback-/Redirect-URLs auf die noch nicht auflösende Zieldomain, wodurch der Admin-Login im Testdeploy fehlschlägt (leicht mit „`AUTH_TRUST_HOST` wirkt nicht" zu verwechseln — ist es aber nicht: `AUTH_TRUST_HOST=true` allein lässt next-auth die URL korrekt aus den `X-Forwarded-*`-Headern ableiten). `AUTH_URL` erst in Schritt 5, zusammen mit der echten Domain, setzen.
5. DNS bei IONOS setzen (Apex `@` → A-Record auf VPS-IP, `www` → CNAME/A auf denselben Host), Domain in Coolify eintragen, `AUTH_URL=https://norddeich-heuler.de` setzen, redeployen.
