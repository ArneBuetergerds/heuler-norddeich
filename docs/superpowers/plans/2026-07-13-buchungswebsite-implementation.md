# Ferienwohnung-Buchungswebsite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Next.js-Website für die Ferienwohnung Norddeich, gehostet auf Vercel, mit
öffentlichem Verfügbarkeitskalender, Buchungsanfrageformular, E-Mail-Benachrichtigung
und einem geschützten Admin-Panel zur Pflege der Belegung.

**Architecture:** Next.js (App Router, TypeScript) als Monolith für Frontend + API-Routes.
Neon Postgres über Drizzle ORM als Datenhaltung (`booking_request`, `blocked_period`).
Auth.js (Credentials-Provider) schützt `/admin`. Resend verschickt Benachrichtigungs-
E-Mails. Deployment automatisch via Vercel-GitHub-Integration.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Drizzle ORM,
`@neondatabase/serverless`, Auth.js (`next-auth@5`), `bcryptjs`, `resend`, `zod`,
Vitest.

## Global Constraints

- Monatliche Betriebskosten: 0 € (alle Dienste im jeweiligen Free-Tier), einzige Kosten
  ist die jährliche Domain-Registrierung. Keine kostenpflichtigen Zusatzdienste ohne
  Rücksprache einführen.
- Keine Online-Zahlung, keine externe Kalender-Synchronisation (siehe Spec).
- Sitemap ist festgelegt: `/`, `/ausstattung`, `/lage`, `/verfuegbarkeit`, `/kontakt`,
  `/impressum`, `/datenschutz`, `/admin` (siehe
  `docs/superpowers/specs/2026-07-13-ferienwohnung-buchungswebsite-design.md`).
- Inhalte/Bilder stammen als Ausgangsmaterial von
  https://heuler-norddeich.jimdofree.com/, werden aber nicht 1:1 übernommen.
- Alle DB-Zugriffe laufen über Drizzle, kein rohes SQL in Komponenten/Routen.

---

### Task 1: Next.js-Projekt-Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`,
  `postcss.config.mjs`, `.eslintrc.json`, `.gitignore` (Ergänzung), `.env.example`,
  `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

**Interfaces:**
- Produces: lauffähiges Next.js-Projekt unter `src/app`, Import-Alias `@/*` →
  `src/*`.

- [ ] **Step 1: Next.js-App generieren**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-npm --turbopack=false
```

Bei der Nachfrage zu bereits vorhandenen Dateien (`docs/`, `.git`, `.claude`,
`.closedloop-ai`) bestätigen, dass diese erhalten bleiben sollen.

- [ ] **Step 2: Projekt startet lokal**

```bash
npm run dev
```

Erwartet: Server läuft auf `http://localhost:3000`, Default-Next.js-Seite lädt ohne
Fehler. Danach mit Strg+C beenden.

- [ ] **Step 3: `.env.example` anlegen**

```bash
cat > .env.example <<'EOF'
DATABASE_URL=
AUTH_SECRET=
ADMIN_EMAIL=
ADMIN_PASSWORD_HASH=
RESEND_API_KEY=
OWNER_NOTIFICATION_EMAIL=
EOF
```

- [ ] **Step 4: Sicherstellen, dass `.env*.local` ignoriert wird**

Prüfen, dass `.gitignore` (von create-next-app generiert) `.env*.local` enthält. Falls
nicht, ergänzen.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project"
```

---

### Task 2: Datenbank-Schema (Neon Postgres + Drizzle)

**Files:**
- Create: `src/db/schema.ts`, `src/db/client.ts`, `drizzle.config.ts`
- Modify: `package.json` (Dependencies), `.env.example` (bereits vorhanden,
  `DATABASE_URL` wird hier befüllt)

**Interfaces:**
- Produces: Tabellen `bookingRequest`, `blockedPeriod` (Drizzle-Schema-Objekte),
  Typen `BookingRequest`, `NewBookingRequest`, `BlockedPeriod`, `NewBlockedPeriod`,
  DB-Client `db` aus `src/db/client.ts`.

- [ ] **Step 1: Abhängigkeiten installieren**

```bash
npm install drizzle-orm @neondatabase/serverless ws
npm install -D drizzle-kit @types/ws
```

- [ ] **Step 2: Schema schreiben**

`src/db/schema.ts`:

```typescript
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
```

- [ ] **Step 3: DB-Client schreiben**

`src/db/client.ts`:

> **Hinweis (nachträglich, im Rahmen der Task-10-Code-Review):** Ursprünglich wurde
> hier der `neon-http`-Treiber (`drizzle-orm/neon-http` + `neon()`) eingesetzt. Der
> `neon-http`-Treiber unterstützt aber keine echten interaktiven
> `db.transaction()`-Aufrufe (nur HTTP-Einzelrequests), wodurch die
> Bestätigungslogik in Task 10 (`confirmBookingRequest`) aus zwei separaten,
> nicht-atomaren Schreibvorgängen bestand. Um echte Transaktionen zu ermöglichen,
> wurde auf den `neon-serverless`-Treiber (`drizzle-orm/neon-serverless` +
> `Pool` aus `@neondatabase/serverless`, WebSocket-basiert) umgestellt. Der
> folgende Code-Block zeigt den aktuellen Stand:

```typescript
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL ist nicht gesetzt");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
```

- [ ] **Step 4: Drizzle-Kit konfigurieren**

`drizzle.config.ts`:

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 5: Neon-Projekt anlegen und Migration ausführen**

Auf https://neon.tech ein kostenloses Projekt anlegen (oder über die Vercel-Marketplace-
Integration "Neon" im Vercel-Dashboard), Connection-String in `.env.local` als
`DATABASE_URL` eintragen. Danach:

```bash
npx drizzle-kit push
```

Erwartet: Ausgabe bestätigt, dass `booking_request` und `blocked_period` in der Neon-DB
angelegt wurden.

- [ ] **Step 6: Commit**

```bash
git add src/db drizzle.config.ts package.json package-lock.json
git commit -m "feat: add drizzle schema for booking_request and blocked_period"
```

---

### Task 3: Datums-Überschneidungslogik (TDD)

**Files:**
- Create: `src/lib/dateRange.ts`, `src/lib/dateRange.test.ts`
- Modify: `package.json` (Vitest-Dependency)

**Interfaces:**
- Produces: `rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean`
  — wird von Task 7 (Verfügbarkeitsprüfung) und Task 6 (Kalenderanzeige) genutzt.

- [ ] **Step 1: Vitest einrichten**

```bash
npm install -D vitest
```

`package.json` Scripts ergänzen:

```json
"scripts": {
  "test": "vitest run"
}
```

- [ ] **Step 2: Fehlschlagenden Test schreiben**

`src/lib/dateRange.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { rangesOverlap } from "./dateRange";

describe("rangesOverlap", () => {
  it("erkennt eine Überschneidung, wenn sich zwei Zeiträume schneiden", () => {
    const result = rangesOverlap(
      new Date("2026-08-01"),
      new Date("2026-08-10"),
      new Date("2026-08-05"),
      new Date("2026-08-15"),
    );
    expect(result).toBe(true);
  });

  it("erkennt keine Überschneidung bei direkt aneinandergrenzenden Zeiträumen", () => {
    const result = rangesOverlap(
      new Date("2026-08-01"),
      new Date("2026-08-10"),
      new Date("2026-08-10"),
      new Date("2026-08-15"),
    );
    expect(result).toBe(false);
  });

  it("erkennt keine Überschneidung bei komplett getrennten Zeiträumen", () => {
    const result = rangesOverlap(
      new Date("2026-08-01"),
      new Date("2026-08-05"),
      new Date("2026-09-01"),
      new Date("2026-09-05"),
    );
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 3: Test ausführen, Fehlschlag verifizieren**

```bash
npx vitest run src/lib/dateRange.test.ts
```

Erwartet: FAIL mit "Cannot find module './dateRange'" oder "rangesOverlap is not a
function".

- [ ] **Step 4: Minimalimplementierung schreiben**

`src/lib/dateRange.ts`:

```typescript
/**
 * An- und Abreisetag gelten als Übergabetag: ein Zeitraum, der am Abreisetag des
 * anderen beginnt, überschneidet sich nicht (Half-Open-Intervall [start, end)).
 */
export function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}
```

- [ ] **Step 5: Test ausführen, Erfolg verifizieren**

```bash
npx vitest run src/lib/dateRange.test.ts
```

Erwartet: 3 Tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dateRange.ts src/lib/dateRange.test.ts package.json package-lock.json
git commit -m "feat: add date range overlap check with tests"
```

---

### Task 4: Layout, Navigation & rechtliche Seiten

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/components/NavBar.tsx`, `src/components/Footer.tsx`,
  `src/app/impressum/page.tsx`, `src/app/datenschutz/page.tsx`

**Interfaces:**
- Consumes: keine (reines UI)
- Produces: gemeinsames Seiten-Layout mit `<NavBar />` und `<Footer />`, das alle
  folgenden Seiten (Task 5, 6) einbetten.

- [ ] **Step 1: NavBar-Komponente**

`src/components/NavBar.tsx`:

```typescript
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/", label: "Start" },
  { href: "/ausstattung", label: "Ausstattung" },
  { href: "/lage", label: "Lage" },
  { href: "/verfuegbarkeit", label: "Verfügbarkeit & Anfrage" },
  { href: "/kontakt", label: "Kontakt" },
];

export function NavBar() {
  return (
    <header className="border-b border-slate-200">
      <nav className="mx-auto flex max-w-5xl items-center justify-between p-4">
        <Link href="/" className="text-lg font-semibold">
          Ferienwohnung Heuler, Norddeich
        </Link>
        <ul className="flex flex-wrap gap-4 text-sm">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="hover:underline">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
```

- [ ] **Step 2: Footer-Komponente**

`src/components/Footer.tsx`:

```typescript
import Link from "next/link";

export function Footer() {
  return (
    <footer className="mx-auto mt-12 max-w-5xl border-t border-slate-200 p-4 text-sm text-slate-600">
      <div className="flex flex-wrap gap-4">
        <Link href="/impressum" className="hover:underline">
          Impressum
        </Link>
        <Link href="/datenschutz" className="hover:underline">
          Datenschutz
        </Link>
      </div>
    </footer>
  );
}
```

- [ ] **Step 3: Root-Layout einbinden**

`src/app/layout.tsx`:

```typescript
import type { Metadata } from "next";
import "./globals.css";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Ferienwohnung Heuler, Norddeich",
  description: "Ferienwohnung in Norddeich – Verfügbarkeit prüfen und anfragen.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-white text-slate-900">
        <NavBar />
        <main className="mx-auto max-w-5xl p-4">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Impressum-Seite**

`src/app/impressum/page.tsx` mit den Pflichtangaben nach § 5 TMG. Die Kontaktdaten der
alten Seite (Familie Wißmann) dienen als Platzhalter-Ausgangspunkt und müssen vom
Betreiber vor Go-Live durch die eigenen, rechtsverbindlichen Angaben ersetzt werden:

```typescript
export default function ImpressumPage() {
  return (
    <article className="prose max-w-none">
      <h1>Impressum</h1>
      <p>Angaben gemäß § 5 TMG:</p>
      <p>
        [Name/Firma des Betreibers]
        <br />
        [Straße Hausnummer]
        <br />
        [PLZ Ort]
      </p>
      <p>
        Telefon: [Telefonnummer]
        <br />
        E-Mail: [E-Mail-Adresse]
      </p>
    </article>
  );
}
```

- [ ] **Step 5: Datenschutz-Seite**

`src/app/datenschutz/page.tsx` mit einem Grundgerüst für die Datenschutzerklärung
(Verantwortlicher, welche Daten über das Anfrageformular verarbeitet werden, Cookies/
Session bei Admin-Login, Hosting bei Vercel):

```typescript
export default function DatenschutzPage() {
  return (
    <article className="prose max-w-none">
      <h1>Datenschutzerklärung</h1>
      <h2>Verantwortlicher</h2>
      <p>[Name/Firma des Betreibers, Anschrift, Kontakt]</p>
      <h2>Datenverarbeitung bei Buchungsanfragen</h2>
      <p>
        Wenn Sie über das Anfrageformular eine Buchungsanfrage senden, verarbeiten wir
        die von Ihnen angegebenen Daten (Name, E-Mail, Telefon, Zeitraum, Nachricht)
        ausschließlich zur Bearbeitung Ihrer Anfrage.
      </p>
      <h2>Hosting</h2>
      <p>
        Diese Website wird bei Vercel Inc. gehostet. Beim Aufruf der Seite werden
        technisch notwendige Zugriffsdaten (u. a. IP-Adresse) durch den Hosting-
        Anbieter verarbeitet.
      </p>
    </article>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/layout.tsx src/components/NavBar.tsx src/components/Footer.tsx \
  src/app/impressum src/app/datenschutz
git commit -m "feat: add shared layout, navigation and legal pages"
```

---

### Task 5: Inhaltsseiten (Start, Ausstattung, Lage, Kontakt)

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/app/ausstattung/page.tsx`, `src/app/lage/page.tsx`,
  `src/app/kontakt/page.tsx`, `public/images/` (Bilder)

**Interfaces:**
- Consumes: `NavBar`/`Footer` aus Task 4 (automatisch via Root-Layout)
- Produces: statische Content-Seiten, keine weiteren Konsumenten.

- [ ] **Step 1: Bildmaterial von der alten Seite sichern**

Von https://heuler-norddeich.jimdofree.com/ die Bilder der Galerien "Wohnen und Essen",
"Schlafzimmer groß", "Schlafzimmer klein", "Dusch-Bad", "Haus und Garten" und eine
Auswahl aus "Norddeich und Umgebung" herunterladen und ablegen unter:

```
public/images/wohnen-essen/
public/images/schlafzimmer-gross/
public/images/schlafzimmer-klein/
public/images/bad/
public/images/haus-garten/
public/images/umgebung/
```

Dateinamen sprechend vergeben (z. B. `wohnzimmer-01.jpg`). Die konkreten Dateinamen
fließen in Steps 2–5 als `src`-Pfade ein — beim Herunterladen ggf. an die tatsächlich
gespeicherten Namen anpassen.

- [ ] **Step 2: Startseite**

`src/app/page.tsx`:

```typescript
import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">
        Ferienwohnung „Heuler" in Norddeich
      </h1>
      <p>
        Willkommen in unserer gemütlichen Ferienwohnung direkt in Norddeich –
        ideal für einen erholsamen Urlaub an der ostfriesischen Nordseeküste. Nur
        wenige Gehminuten trennen Sie von der Seehundstation, dem Deich und dem
        Hafen.
      </p>
      <Image
        src="/images/haus-garten/haus-garten-01.jpg"
        alt="Außenansicht der Ferienwohnung Heuler"
        width={1200}
        height={800}
        className="rounded-lg"
      />
      <p>
        Auf den folgenden Seiten finden Sie Details zur{" "}
        <Link href="/ausstattung" className="underline">
          Ausstattung
        </Link>
        , zur{" "}
        <Link href="/lage" className="underline">
          Lage
        </Link>{" "}
        und können direkt die{" "}
        <Link href="/verfuegbarkeit" className="underline">
          Verfügbarkeit prüfen und anfragen
        </Link>
        .
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Ausstattungsseite**

`src/app/ausstattung/page.tsx`:

```typescript
export default function AusstattungPage() {
  return (
    <article className="prose max-w-none space-y-4">
      <h1>Ausstattung</h1>
      <h2>Wohn- und Essbereich</h2>
      <p>
        Ein Ecksofa mit Couchtisch, ein Sideboard und ein Essplatz laden zum
        Entspannen und gemeinsamen Essen ein.
      </p>
      <h2>Küche</h2>
      <p>
        Voll ausgestattete Küche mit Herd, Backofen, Geschirrspüler und
        Mikrowelle.
      </p>
      <h2>Schlafzimmer</h2>
      <p>
        Zwei Schlafzimmer mit unterschiedlichen Bettgrößen und ausreichend
        Stauraum.
      </p>
      <h2>Unterhaltung</h2>
      <p>TV, DVD/Blu-ray-Player, Radio sowie Gesellschaftsspiele und Bücher.</p>
      <h2>Balkon</h2>
      <p>Südwest-ausgerichteter Balkon mit schönem Ausblick.</p>
    </article>
  );
}
```

- [ ] **Step 4: Lage-Seite**

`src/app/lage/page.tsx`:

```typescript
export default function LagePage() {
  return (
    <article className="prose max-w-none space-y-4">
      <h1>Lage & Umgebung</h1>
      <p>
        Die Ferienwohnung liegt zentral in Norddeich. In etwa zwei Gehminuten
        erreichen Sie die Seehundstation. Auch Schwimmbad, Spielplatz,
        Restaurants und ein Supermarkt sind fußläufig erreichbar.
      </p>
      <p>
        Der Deich und der angrenzende Park laden zu Spaziergängen direkt an der
        Nordsee ein.
      </p>
    </article>
  );
}
```

- [ ] **Step 5: Kontakt-Seite**

`src/app/kontakt/page.tsx` (Kontaktdaten aus der alten Seite als Ausgangspunkt, vor
Go-Live vom Betreiber zu bestätigen):

```typescript
export default function KontaktPage() {
  return (
    <article className="prose max-w-none space-y-4">
      <h1>Kontakt</h1>
      <p>Bei Fragen erreichen Sie uns direkt:</p>
      <p>
        [Name des Betreibers]
        <br />
        Telefon: [Telefonnummer]
        <br />
        E-Mail: [E-Mail-Adresse]
      </p>
      <p>
        Für eine Buchungsanfrage nutzen Sie bitte das Formular auf der Seite{" "}
        <a href="/verfuegbarkeit" className="underline">
          Verfügbarkeit & Anfrage
        </a>
        .
      </p>
    </article>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx src/app/ausstattung src/app/lage src/app/kontakt \
  public/images
git commit -m "feat: add content pages migrated from previous site"
```

---

### Task 6: Verfügbarkeitskalender

**Files:**
- Create: `src/db/queries.ts`, `src/lib/calendar.ts`, `src/lib/calendar.test.ts`,
  `src/components/AvailabilityCalendar.tsx`, `src/app/verfuegbarkeit/page.tsx`

**Interfaces:**
- Consumes: `db` aus `src/db/client.ts` (Task 2), `blockedPeriod`-Schema (Task 2)
- Produces: `getBlockedPeriods(): Promise<BlockedPeriod[]>` (genutzt in Task 7 für die
  Verfügbarkeitsprüfung), `isDateBlocked(date: Date, periods: {startDate: Date, endDate:
  Date}[]): boolean` (genutzt von `AvailabilityCalendar`), `<AvailabilityCalendar
  blockedPeriods={...} />`

- [ ] **Step 1: Fehlschlagenden Test für `isDateBlocked` schreiben**

`src/lib/calendar.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { isDateBlocked } from "./calendar";

describe("isDateBlocked", () => {
  const periods = [
    { startDate: new Date("2026-08-05"), endDate: new Date("2026-08-10") },
  ];

  it("gibt true zurück für ein Datum innerhalb eines gesperrten Zeitraums", () => {
    expect(isDateBlocked(new Date("2026-08-07"), periods)).toBe(true);
  });

  it("gibt false zurück für den Abreisetag (Half-Open-Intervall)", () => {
    expect(isDateBlocked(new Date("2026-08-10"), periods)).toBe(false);
  });

  it("gibt false zurück für ein Datum außerhalb aller Zeiträume", () => {
    expect(isDateBlocked(new Date("2026-09-01"), periods)).toBe(false);
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag verifizieren**

```bash
npx vitest run src/lib/calendar.test.ts
```

Erwartet: FAIL, `isDateBlocked` existiert nicht.

- [ ] **Step 3: `isDateBlocked` implementieren**

`src/lib/calendar.ts`:

```typescript
export function isDateBlocked(
  date: Date,
  periods: { startDate: Date; endDate: Date }[],
): boolean {
  return periods.some((p) => date >= p.startDate && date < p.endDate);
}
```

- [ ] **Step 4: Test ausführen, Erfolg verifizieren**

```bash
npx vitest run src/lib/calendar.test.ts
```

Erwartet: 3 Tests PASS.

- [ ] **Step 5: Query-Funktion für gesperrte Zeiträume**

`src/db/queries.ts`:

```typescript
import { db } from "./client";
import { blockedPeriod, type BlockedPeriod } from "./schema";

export async function getBlockedPeriods(): Promise<BlockedPeriod[]> {
  return db.select().from(blockedPeriod);
}
```

- [ ] **Step 6: Kalender-Komponente**

`src/components/AvailabilityCalendar.tsx`:

```typescript
"use client";

import { useState } from "react";
import { isDateBlocked } from "@/lib/calendar";

type Period = { startDate: Date; endDate: Date };

function buildMonthDays(year: number, month: number): Date[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));
}

export function AvailabilityCalendar({ blockedPeriods }: { blockedPeriods: Period[] }) {
  const today = new Date();
  const [monthOffset, setMonthOffset] = useState(0);
  const viewDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const days = buildMonthDays(viewDate.getFullYear(), viewDate.getMonth());

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonthOffset((m) => m - 1)}
          className="px-2 py-1 hover:underline"
        >
          ← Vorheriger Monat
        </button>
        <span className="font-medium">
          {viewDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
        </span>
        <button
          type="button"
          onClick={() => setMonthOffset((m) => m + 1)}
          className="px-2 py-1 hover:underline"
        >
          Nächster Monat →
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {days.map((day) => {
          const blocked = isDateBlocked(day, blockedPeriods);
          return (
            <div
              key={day.toISOString()}
              className={
                blocked
                  ? "rounded bg-red-100 p-2 text-red-700"
                  : "rounded bg-green-50 p-2 text-green-700"
              }
              title={blocked ? "belegt" : "frei"}
            >
              {day.getDate()}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Rot = belegt, Grün = frei. Verbindliche Prüfung erfolgt nach Absenden Ihrer
        Anfrage.
      </p>
    </div>
  );
}
```

- [ ] **Step 7: Verfügbarkeitsseite (Server-Komponente lädt Daten)**

`src/app/verfuegbarkeit/page.tsx`:

```typescript
import { getBlockedPeriods } from "@/db/queries";
import { AvailabilityCalendar } from "@/components/AvailabilityCalendar";
import { BookingRequestForm } from "@/components/BookingRequestForm";

export default async function VerfuegbarkeitPage() {
  const blockedPeriods = await getBlockedPeriods();

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-bold">Verfügbarkeit</h1>
        <AvailabilityCalendar
          blockedPeriods={blockedPeriods.map((p) => ({
            startDate: p.startDate,
            endDate: p.endDate,
          }))}
        />
      </section>
      <section>
        <h2 className="text-2xl font-semibold">Preise</h2>
        <p>[Preisinformationen des Betreibers ergänzen, z. B. Preis pro Nacht,
          Nebenkosten, Mindestaufenthaltsdauer.]</p>
      </section>
      <section>
        <h2 className="text-2xl font-semibold">Anfrage senden</h2>
        <BookingRequestForm />
      </section>
    </div>
  );
}
```

Hinweis: `BookingRequestForm` wird in Task 7 implementiert — dieser Task lässt den Build
mit einem fehlenden Import bewusst noch nicht grün; Task 7 schließt das ab.

- [ ] **Step 8: Commit**

```bash
git add src/db/queries.ts src/lib/calendar.ts src/lib/calendar.test.ts \
  src/components/AvailabilityCalendar.tsx src/app/verfuegbarkeit
git commit -m "feat: add availability calendar"
```

---

### Task 7: Anfrageformular & API-Route

**Files:**
- Create: `src/lib/validation.ts`, `src/lib/booking.ts`, `src/lib/booking.test.ts`,
  `src/components/BookingRequestForm.tsx`, `src/app/api/booking-request/route.ts`

**Interfaces:**
- Consumes: `rangesOverlap` (Task 3), `db`/`blockedPeriod`/`bookingRequest` (Task 2)
- Produces: `bookingRequestSchema` (Zod), `isRangeAvailable(periods: {startDate: Date,
  endDate: Date}[], start: Date, end: Date): boolean` (genutzt von der API-Route und in
  Task 8 nicht weiter benötigt), `POST /api/booking-request`

- [ ] **Step 1: Zod-Validierungsschema**

`src/lib/validation.ts`:

```typescript
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
```

- [ ] **Step 2: Fehlschlagenden Test für Verfügbarkeitsprüfung schreiben**

`src/lib/booking.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { isRangeAvailable } from "./booking";

describe("isRangeAvailable", () => {
  const periods = [
    { startDate: new Date("2026-08-05"), endDate: new Date("2026-08-10") },
  ];

  it("gibt false zurück, wenn der Zeitraum einen gesperrten Zeitraum überschneidet", () => {
    expect(
      isRangeAvailable(periods, new Date("2026-08-08"), new Date("2026-08-12")),
    ).toBe(false);
  });

  it("gibt true zurück, wenn der Zeitraum frei ist", () => {
    expect(
      isRangeAvailable(periods, new Date("2026-09-01"), new Date("2026-09-05")),
    ).toBe(true);
  });
});
```

- [ ] **Step 3: Test ausführen, Fehlschlag verifizieren**

```bash
npx vitest run src/lib/booking.test.ts
```

Erwartet: FAIL, `isRangeAvailable` existiert nicht.

- [ ] **Step 4: `isRangeAvailable` implementieren**

`src/lib/booking.ts`:

```typescript
import { rangesOverlap } from "./dateRange";

export function isRangeAvailable(
  blockedPeriods: { startDate: Date; endDate: Date }[],
  start: Date,
  end: Date,
): boolean {
  return !blockedPeriods.some((p) =>
    rangesOverlap(start, end, p.startDate, p.endDate),
  );
}
```

- [ ] **Step 5: Test ausführen, Erfolg verifizieren**

```bash
npx vitest run src/lib/booking.test.ts
```

Erwartet: 2 Tests PASS.

- [ ] **Step 6: API-Route**

`src/app/api/booking-request/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { bookingRequest, blockedPeriod } from "@/db/schema";
import { bookingRequestSchema } from "@/lib/validation";
import { isRangeAvailable } from "@/lib/booking";
import { sendBookingRequestNotification } from "@/lib/email";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = bookingRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { name, email, phone, startDate, endDate, message } = parsed.data;

  const existingBlockedPeriods = await db.select().from(blockedPeriod);
  if (!isRangeAvailable(existingBlockedPeriods, startDate, endDate)) {
    return NextResponse.json(
      { error: "Der gewählte Zeitraum ist bereits belegt." },
      { status: 409 },
    );
  }

  const [created] = await db
    .insert(bookingRequest)
    .values({ name, email, phone, startDate, endDate, message })
    .returning();

  try {
    await sendBookingRequestNotification(created);
  } catch (error) {
    console.error("Benachrichtigungs-E-Mail konnte nicht gesendet werden", error);
  }

  return NextResponse.json({ id: created.id }, { status: 201 });
}
```

Hinweis: `sendBookingRequestNotification` wird in Task 8 implementiert.

- [ ] **Step 7: Formular-Komponente**

`src/components/BookingRequestForm.tsx`:

```typescript
"use client";

import { useState, type FormEvent } from "react";

export function BookingRequestForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setErrorMessage(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      startDate: formData.get("startDate"),
      endDate: formData.get("endDate"),
      message: formData.get("message"),
    };

    const response = await fetch("/api/booking-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      setStatus("success");
      event.currentTarget.reset();
    } else {
      const data = await response.json();
      setErrorMessage(
        typeof data.error === "string"
          ? data.error
          : "Bitte prüfen Sie Ihre Eingaben.",
      );
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <p className="rounded bg-green-50 p-4 text-green-700">
        Vielen Dank für Ihre Anfrage! Wir melden uns zeitnah bei Ihnen.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="name" className="block text-sm font-medium">
          Name
        </label>
        <input id="name" name="name" required className="w-full rounded border p-2" />
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          E-Mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded border p-2"
        />
      </div>
      <div>
        <label htmlFor="phone" className="block text-sm font-medium">
          Telefon (optional)
        </label>
        <input id="phone" name="phone" className="w-full rounded border p-2" />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="startDate" className="block text-sm font-medium">
            Anreise
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            required
            className="w-full rounded border p-2"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="endDate" className="block text-sm font-medium">
            Abreise
          </label>
          <input
            id="endDate"
            name="endDate"
            type="date"
            required
            className="w-full rounded border p-2"
          />
        </div>
      </div>
      <div>
        <label htmlFor="message" className="block text-sm font-medium">
          Nachricht (optional)
        </label>
        <textarea id="message" name="message" className="w-full rounded border p-2" />
      </div>
      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
      <button
        type="submit"
        disabled={status === "sending"}
        className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {status === "sending" ? "Wird gesendet…" : "Anfrage senden"}
      </button>
    </form>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/validation.ts src/lib/booking.ts src/lib/booking.test.ts \
  src/components/BookingRequestForm.tsx src/app/api/booking-request
git commit -m "feat: add booking request form and API route"
```

---

### Task 8: E-Mail-Benachrichtigung (Resend)

**Files:**
- Create: `src/lib/email.ts`

**Interfaces:**
- Consumes: `BookingRequest`-Typ (Task 2)
- Produces: `sendBookingRequestNotification(request: BookingRequest): Promise<void>`
  (bereits in Task 7 Step 6 verdrahtet)

- [ ] **Step 1: Resend installieren**

```bash
npm install resend
```

- [ ] **Step 2: E-Mail-Funktion implementieren**

`src/lib/email.ts`:

```typescript
import { Resend } from "resend";
import type { BookingRequest } from "@/db/schema";

function formatDate(date: Date): string {
  return date.toLocaleDateString("de-DE");
}

export async function sendBookingRequestNotification(
  request: BookingRequest,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const ownerEmail = process.env.OWNER_NOTIFICATION_EMAIL;

  if (!apiKey || !ownerEmail) {
    throw new Error(
      "RESEND_API_KEY oder OWNER_NOTIFICATION_EMAIL ist nicht konfiguriert",
    );
  }

  const resend = new Resend(apiKey);

  await resend.emails.send({
    from: "Ferienwohnung Heuler <onboarding@resend.dev>",
    to: ownerEmail,
    replyTo: request.email,
    subject: `Neue Buchungsanfrage von ${request.name}`,
    text: [
      `Name: ${request.name}`,
      `E-Mail: ${request.email}`,
      `Telefon: ${request.phone ?? "-"}`,
      `Zeitraum: ${formatDate(request.startDate)} bis ${formatDate(request.endDate)}`,
      `Nachricht: ${request.message ?? "-"}`,
    ].join("\n"),
  });
}
```

- [ ] **Step 3: Resend-Konto einrichten**

Auf https://resend.com kostenloses Konto anlegen, API-Key erzeugen, in `.env.local` als
`RESEND_API_KEY` eintragen. `OWNER_NOTIFICATION_EMAIL` auf die E-Mail-Adresse des
Betreibers setzen. Für Produktivbetrieb später eine verifizierte eigene Domain als
`from`-Adresse hinterlegen (bis dahin funktioniert die Resend-Sandbox-Adresse
`onboarding@resend.dev` nur mit der beim Resend-Konto verifizierten Empfängeradresse).

- [ ] **Step 4: Manueller Rauchtest**

```bash
npm run dev
```

Über `/verfuegbarkeit` eine Testanfrage mit einem freien Zeitraum absenden. Erwartet:
Erfolgsmeldung im Formular, neuer Eintrag in der `booking_request`-Tabelle (per Neon-
Dashboard-SQL-Editor prüfbar), E-Mail kommt beim Betreiber an.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email.ts package.json package-lock.json
git commit -m "feat: send owner notification email via resend"
```

---

### Task 9: Auth.js-Setup & Schutz von `/admin`

**Files:**
- Create: `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`,
  `src/middleware.ts`, `src/app/admin/login/page.tsx`,
  `scripts/hash-password.ts`

**Interfaces:**
- Produces: `auth()`, `signIn()`, `signOut()`, `handlers` aus `src/auth.ts` (genutzt in
  Task 10 zur Session-Prüfung), Middleware-Schutz für alle `/admin/*`-Routen außer
  `/admin/login`.

- [ ] **Step 1: Auth.js installieren**

```bash
npm install next-auth@beta bcryptjs
npm install -D @types/bcryptjs tsx
```

- [ ] **Step 2: Passwort-Hash-Skript**

`scripts/hash-password.ts`:

```typescript
import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password) {
  console.error("Nutzung: npx tsx scripts/hash-password.ts <passwort>");
  process.exit(1);
}

bcrypt.hash(password, 10).then((hash) => {
  console.log(hash);
});
```

Ausführen und Ergebnis als `ADMIN_PASSWORD_HASH` in `.env.local` eintragen:

```bash
npx tsx scripts/hash-password.ts "<gewünschtes-admin-passwort>"
```

- [ ] **Step 3: Auth-Konfiguration**

`src/auth.ts`:

```typescript
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-Mail", type: "email" },
        password: { label: "Passwort", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

        if (!email || !password || !adminEmail || !adminPasswordHash) {
          return null;
        }
        if (email !== adminEmail) {
          return null;
        }
        const valid = await bcrypt.compare(password, adminPasswordHash);
        if (!valid) {
          return null;
        }
        return { id: "admin", email: adminEmail };
      },
    }),
  ],
  pages: {
    signIn: "/admin/login",
  },
  session: { strategy: "jwt" },
});
```

- [ ] **Step 4: Route-Handler für Auth.js**

`src/app/api/auth/[...nextauth]/route.ts`:

```typescript
export { GET, POST } from "@/auth";
```

- [ ] **Step 5: Middleware zum Schutz von `/admin`**

`src/middleware.ts`:

```typescript
export { auth as middleware } from "@/auth";

export const config = {
  matcher: ["/admin/:path*"],
};
```

Da die Middleware alle `/admin/*`-Routen inklusive `/admin/login` abdeckt, wird in Task
10 in der Admin-Startseite selbst per `auth()` geprüft und bei fehlender Session auf
`/admin/login` umgeleitet, statt die Login-Seite aus dem Matcher auszuschließen (Auth.js-
Middleware leitet nicht angemeldete Zugriffe standardmäßig bereits auf `pages.signIn`
um).

- [ ] **Step 6: Login-Seite**

`src/app/admin/login/page.tsx`:

```typescript
"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    const result = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
    });

    if (result?.error) {
      setError("E-Mail oder Passwort ist falsch.");
      return;
    }
    router.push("/admin");
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-sm space-y-3">
      <h1 className="text-2xl font-bold">Admin-Login</h1>
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          E-Mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded border p-2"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Passwort
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="w-full rounded border p-2"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        className="rounded bg-slate-900 px-4 py-2 text-white"
      >
        Anmelden
      </button>
    </form>
  );
}
```

- [ ] **Step 7: `AUTH_SECRET` erzeugen**

```bash
npx auth secret
```

Erzeugten Wert als `AUTH_SECRET` in `.env.local` eintragen.

- [ ] **Step 8: Manueller Test**

```bash
npm run dev
```

`/admin/login` aufrufen, mit den in `.env.local` hinterlegten `ADMIN_EMAIL`/Klartext-
Passwort anmelden. Erwartet: Weiterleitung auf `/admin` (Seite existiert erst nach Task
10 — bis dahin ist ein 404 nach erfolgreichem Login erwartungsgemäß).

- [ ] **Step 9: Commit**

```bash
git add src/auth.ts src/app/api/auth src/middleware.ts src/app/admin/login \
  scripts/hash-password.ts package.json package-lock.json
git commit -m "feat: add credentials-based admin authentication"
```

---

### Task 10: Admin-Dashboard – Anfragen bestätigen/ablehnen

**Files:**
- Create: `src/app/admin/page.tsx`,
  `src/app/api/admin/booking-request/[id]/route.ts`,
  `src/db/adminQueries.ts`, `src/db/adminQueries.test.ts`

**Interfaces:**
- Consumes: `auth()` (Task 9), `db`/`bookingRequest`/`blockedPeriod` (Task 2)
- Produces: `confirmBookingRequest(db, id: number): Promise<void>`,
  `declineBookingRequest(db, id: number): Promise<void>` (reine, injizierbare
  Funktionen für Testbarkeit ohne echte DB), `PATCH
  /api/admin/booking-request/:id`

- [ ] **Step 1: Fehlschlagenden Test für die Bestätigungslogik schreiben**

`src/db/adminQueries.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { confirmBookingRequest, declineBookingRequest } from "./adminQueries";

function createFakeDb(request: { id: number; startDate: Date; endDate: Date }) {
  const inserted: unknown[] = [];
  const updated: unknown[] = [];
  return {
    inserted,
    updated,
    query: {
      bookingRequest: {
        findFirst: vi.fn().mockResolvedValue(request),
      },
    },
    insert: () => ({
      values: (values: unknown) => {
        inserted.push(values);
        return { returning: async () => [values] };
      },
    }),
    update: () => ({
      set: (values: unknown) => ({
        where: async () => {
          updated.push(values);
        },
      }),
    }),
  };
}

describe("confirmBookingRequest", () => {
  it("legt einen blocked_period-Eintrag an und setzt den Status auf confirmed", async () => {
    const request = {
      id: 1,
      startDate: new Date("2026-08-01"),
      endDate: new Date("2026-08-05"),
    };
    const fakeDb = createFakeDb(request);

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await confirmBookingRequest(fakeDb, request.id);

    expect(fakeDb.inserted).toHaveLength(1);
    expect(fakeDb.updated).toContainEqual({ status: "confirmed" });
  });
});

describe("declineBookingRequest", () => {
  it("setzt nur den Status auf declined, ohne blocked_period anzulegen", async () => {
    const request = {
      id: 2,
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-09-05"),
    };
    const fakeDb = createFakeDb(request);

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await declineBookingRequest(fakeDb, request.id);

    expect(fakeDb.inserted).toHaveLength(0);
    expect(fakeDb.updated).toContainEqual({ status: "declined" });
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag verifizieren**

```bash
npx vitest run src/db/adminQueries.test.ts
```

Erwartet: FAIL, `./adminQueries` existiert nicht.

- [ ] **Step 3: Implementierung**

`src/db/adminQueries.ts`:

> **Hinweis (nachträglich, Code-Review):** Die ursprüngliche Implementierung führte
> den Insert des `blockedPeriod`-Eintrags und das Update des `bookingRequest`-Status
> als zwei separate, nicht-atomare Schreibvorgänge aus (Risiko eines verwaisten
> `blockedPeriod`-Eintrags bei einem Fehler zwischen den beiden Writes). Im Zuge der
> Umstellung von `client.ts` auf den `neon-serverless`-Treiber (siehe Task 2) wurde
> `confirmBookingRequest` in eine echte `db.transaction()` gepackt, sodass Insert und
> Update atomar committen oder gemeinsam zurückgerollt werden. Aktueller Stand:

```typescript
import { eq, type SQL } from "drizzle-orm";
import { bookingRequest, blockedPeriod } from "./schema";

type DbLike = {
  query: {
    bookingRequest: {
      findFirst: (args: { where: SQL<unknown> }) => Promise<
        { id: number; startDate: Date; endDate: Date } | undefined
      >;
    };
  };
  insert: typeof import("./client").db.insert;
  update: typeof import("./client").db.update;
  transaction: typeof import("./client").db.transaction;
};

export async function confirmBookingRequest(db: DbLike, id: number): Promise<void> {
  const request = await db.query.bookingRequest.findFirst({
    where: eq(bookingRequest.id, id),
  });
  if (!request) {
    throw new Error(`Buchungsanfrage ${id} nicht gefunden`);
  }

  // Insert + Update müssen atomar sein: schlägt das Update fehl, nachdem der
  // blocked_period-Eintrag bereits angelegt wurde, bliebe sonst eine Anfrage
  // dauerhaft "pending" bei gleichzeitig gesperrtem Zeitraum zurück.
  await db.transaction(async (tx) => {
    await tx
      .insert(blockedPeriod)
      .values({
        startDate: request.startDate,
        endDate: request.endDate,
        note: `Bestätigte Anfrage #${request.id}`,
      })
      .returning();

    await tx
      .update(bookingRequest)
      .set({ status: "confirmed" })
      .where(eq(bookingRequest.id, id));
  });
}

export async function declineBookingRequest(db: DbLike, id: number): Promise<void> {
  await db
    .update(bookingRequest)
    .set({ status: "declined" })
    .where(eq(bookingRequest.id, id));
}
```

- [ ] **Step 4: Test ausführen, Erfolg verifizieren**

```bash
npx vitest run src/db/adminQueries.test.ts
```

Erwartet: 2 Tests PASS.

- [ ] **Step 5: API-Route für Bestätigen/Ablehnen**

`src/app/api/admin/booking-request/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { confirmBookingRequest, declineBookingRequest } from "@/db/adminQueries";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { action } = await request.json();
  const id = Number(params.id);

  if (action === "confirm") {
    await confirmBookingRequest(db, id);
  } else if (action === "decline") {
    await declineBookingRequest(db, id);
  } else {
    return NextResponse.json({ error: "Ungültige Aktion" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Admin-Dashboard-Seite**

`src/app/admin/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { bookingRequest } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AdminRequestActions } from "@/components/AdminRequestActions";

export default async function AdminPage() {
  const session = await auth();
  if (!session) {
    redirect("/admin/login");
  }

  const pendingRequests = await db
    .select()
    .from(bookingRequest)
    .where(eq(bookingRequest.status, "pending"));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Offene Buchungsanfragen</h1>
      {pendingRequests.length === 0 && <p>Keine offenen Anfragen.</p>}
      <ul className="space-y-3">
        {pendingRequests.map((request) => (
          <li key={request.id} className="rounded border p-4">
            <p className="font-medium">{request.name}</p>
            <p className="text-sm text-slate-600">
              {request.email} · {request.phone ?? "-"}
            </p>
            <p className="text-sm">
              {request.startDate.toLocaleDateString("de-DE")} –{" "}
              {request.endDate.toLocaleDateString("de-DE")}
            </p>
            {request.message && <p className="text-sm italic">{request.message}</p>}
            <AdminRequestActions requestId={request.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 7: Client-Komponente für Bestätigen/Ablehnen-Buttons**

`src/components/AdminRequestActions.tsx`:

```typescript
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminRequestActions({ requestId }: { requestId: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleAction(action: "confirm" | "decline") {
    setPending(true);
    await fetch(`/api/admin/booking-request/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <div className="mt-2 flex gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => handleAction("confirm")}
        className="rounded bg-green-600 px-3 py-1 text-sm text-white disabled:opacity-50"
      >
        Bestätigen
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => handleAction("decline")}
        className="rounded bg-red-600 px-3 py-1 text-sm text-white disabled:opacity-50"
      >
        Ablehnen
      </button>
    </div>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add src/app/admin/page.tsx src/app/api/admin/booking-request \
  src/db/adminQueries.ts src/db/adminQueries.test.ts \
  src/components/AdminRequestActions.tsx
git commit -m "feat: add admin dashboard to confirm or decline booking requests"
```

---

### Task 11: Admin – manuelle Sperrzeiträume

**Files:**
- Create: `src/app/admin/sperrzeitraeume/page.tsx`,
  `src/app/api/admin/blocked-period/route.ts`

**Interfaces:**
- Consumes: `auth()` (Task 9), `db`/`blockedPeriod` (Task 2), `getBlockedPeriods()`
  (Task 6)
- Produces: `POST /api/admin/blocked-period`, `DELETE
  /api/admin/blocked-period?id=<id>`

- [ ] **Step 1: API-Route**

`src/app/api/admin/blocked-period/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { blockedPeriod } from "@/db/schema";
import { z } from "zod";

const createSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  note: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [created] = await db.insert(blockedPeriod).values(parsed.data).returning();
  return NextResponse.json(created, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "id fehlt" }, { status: 400 });
  }

  await db.delete(blockedPeriod).where(eq(blockedPeriod.id, id));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verwaltungsseite**

`src/app/admin/sperrzeitraeume/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getBlockedPeriods } from "@/db/queries";
import { ManualBlockedPeriodForm } from "@/components/ManualBlockedPeriodForm";

export default async function SperrzeitraeumePage() {
  const session = await auth();
  if (!session) {
    redirect("/admin/login");
  }

  const periods = await getBlockedPeriods();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Sperrzeiträume</h1>
      <ManualBlockedPeriodForm />
      <ul className="space-y-2">
        {periods.map((period) => (
          <li key={period.id} className="rounded border p-3 text-sm">
            {period.startDate.toLocaleDateString("de-DE")} –{" "}
            {period.endDate.toLocaleDateString("de-DE")}
            {period.note ? ` (${period.note})` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Formular-Komponente**

`src/components/ManualBlockedPeriodForm.tsx`:

```typescript
"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function ManualBlockedPeriodForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const formData = new FormData(event.currentTarget);

    await fetch("/api/admin/blocked-period", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: formData.get("startDate"),
        endDate: formData.get("endDate"),
        note: formData.get("note"),
      }),
    });

    setPending(false);
    event.currentTarget.reset();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor="startDate" className="block text-sm">Von</label>
        <input
          id="startDate"
          name="startDate"
          type="date"
          required
          className="rounded border p-2"
        />
      </div>
      <div>
        <label htmlFor="endDate" className="block text-sm">Bis</label>
        <input
          id="endDate"
          name="endDate"
          type="date"
          required
          className="rounded border p-2"
        />
      </div>
      <div>
        <label htmlFor="note" className="block text-sm">Notiz</label>
        <input id="note" name="note" className="rounded border p-2" />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        Hinzufügen
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Manueller Test**

```bash
npm run dev
```

Als Admin anmelden, unter `/admin/sperrzeitraeume` einen Zeitraum anlegen, prüfen dass
er in der Liste erscheint und auf `/verfuegbarkeit` als belegt (rot) angezeigt wird.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/sperrzeitraeume src/app/api/admin/blocked-period \
  src/components/ManualBlockedPeriodForm.tsx
git commit -m "feat: allow admin to manage manual blocked periods"
```

---

### Task 12: Deployment auf Vercel & Domain-Anbindung

**Files:**
- Create: `vercel.json` (nur falls Standardkonfiguration nicht ausreicht — im
  Regelfall nicht nötig)
- Modify: keine Code-Änderungen, nur Konfiguration außerhalb des Repos

**Interfaces:**
- Consumes: alle vorherigen Tasks (fertiges, lauffähiges Projekt)
- Produces: öffentlich erreichbare, deployte Website

- [ ] **Step 1: GitHub-Repository verbinden**

Repository auf GitHub anlegen (falls noch nicht geschehen) und den lokalen `master`-
Branch pushen:

```bash
gh repo create heuler-norddeich --private --source=. --remote=origin
git push -u origin master
```

- [ ] **Step 2: Vercel-Projekt anlegen**

Auf https://vercel.com mit dem GitHub-Account anmelden, "Add New Project" → das Repo
`heuler-norddeich` importieren. Vercel erkennt Next.js automatisch (Build Command
`next build`, Output automatisch).

- [ ] **Step 3: Umgebungsvariablen in Vercel hinterlegen**

Im Vercel-Projekt unter "Settings → Environment Variables" alle Werte aus
`.env.example` mit den produktiven Werten eintragen: `DATABASE_URL`, `AUTH_SECRET`,
`ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `RESEND_API_KEY`, `OWNER_NOTIFICATION_EMAIL`.

- [ ] **Step 4: Deployment auslösen und prüfen**

Ein Deployment wird automatisch nach dem Verbinden ausgelöst. Erwartet: Build ist grün,
die von Vercel vergebene `*.vercel.app`-URL zeigt die Startseite.

- [ ] **Step 5: Eigene Domain verbinden**

Im Vercel-Projekt unter "Settings → Domains" die eigene Domain hinzufügen. Vercel zeigt
die nötigen DNS-Einträge (i. d. R. ein `A`- oder `CNAME`-Record) an; diese beim
Domain-Registrar eintragen. Warten bis Vercel den Domainstatus als "Valid" anzeigt
(kann bis zu 24h dauern, meist deutlich schneller).

- [ ] **Step 6: End-to-End-Rauchtest auf der produktiven Domain**

Über die eigene Domain: Startseite und alle Unterseiten aufrufen, eine Testanfrage über
`/verfuegbarkeit` senden (E-Mail-Empfang prüfen), als Admin einloggen und die Anfrage
bestätigen, prüfen dass der Zeitraum danach im öffentlichen Kalender als belegt
erscheint.

- [ ] **Step 7: Commit (falls Konfigurationsdateien ergänzt wurden)**

```bash
git add -A
git commit -m "chore: finalize deployment configuration" --allow-empty
```
