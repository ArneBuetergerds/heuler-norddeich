# Heuler – Ferienwohnung Norddeich

Buchungswebsite für eine Ferienwohnung in Norddeich: Verfügbarkeitskalender, Buchungsanfragen und ein geschütztes Admin-Panel zur Verwaltung von Anfragen und Sperrzeiträumen.

## Tech-Stack

- [Next.js](https://nextjs.org) (App Router) + React + TypeScript
- [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)
- [Drizzle ORM](https://orm.drizzle.team) auf MySQL
- [next-auth](https://authjs.dev) (Credentials-Login, ausschließlich für das Admin-Panel)
- [Nodemailer](https://nodemailer.com) für den Mailversand (SMTP)
- [Vitest](https://vitest.dev) für Tests

## Lokale Entwicklung

### Voraussetzungen

- Node.js 20+
- Eine erreichbare MySQL-Instanz, **Version ≥ 8.0.16** – ältere Versionen parsen `CHECK`-Constraints, ohne sie durchzusetzen

### Setup

1. Abhängigkeiten installieren:
   ```bash
   npm install
   ```
2. `.env.example` nach `.env.local` kopieren und ausfüllen:
   ```bash
   cp .env.example .env.local
   ```

   | Variable | Zweck |
   |---|---|
   | `DATABASE_URL` | `mysql://user:passwort@host:port/datenbank` |
   | `AUTH_SECRET` | Zufalls-String für next-auth, z. B. `openssl rand -base64 32` |
   | `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` | Zugangsdaten fürs Admin-Panel (siehe unten) |
   | `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Mailversand |
   | `OWNER_NOTIFICATION_EMAIL` | Empfänger der Betreiber-Benachrichtigung bei neuen Anfragen |
   | `AUTH_URL` / `AUTH_TRUST_HOST` | Nur für den Betrieb hinter einem Reverse Proxy (Produktion) nötig – lokal weglassen |

   Admin-Passwort-Hash erzeugen:
   ```bash
   npx tsx scripts/hash-password.ts "DeinPasswort"
   ```

   **Achtung beim Eintragen des Hashes in `.env.local`:** Next.js interpretiert `$` in Env-Dateien als Variablenreferenz (dotenv-Expansion). Ein bcrypt-Hash wie `$2b$10$...` muss deshalb escaped werden:
   ```
   ADMIN_PASSWORD_HASH=\$2b\$10\$...
   ```
   Ohne das Escaping wird der Hash beim Laden lautlos zerstört und der Login schlägt fehl, egal welches Passwort man eingibt.

3. Datenbankschema anlegen:
   ```bash
   npx drizzle-kit migrate
   ```
4. Dev-Server starten:
   ```bash
   npm run dev
   ```
   → [http://localhost:3000](http://localhost:3000)

### Tests

```bash
npm test           # Vitest
npx tsc --noEmit    # Typecheck
```

Zusätzlich prüft ein Skript den kompletten Buchungsablauf (Anfrage, Bestätigung, Ablehnung, Sperrzeiträume, Check-Constraint) gegen eine echte Datenbank:
```bash
npx tsx --env-file=.env.local scripts/verify-booking-flow.ts
```

## Deployment

Die App läuft containerisiert (siehe `Dockerfile`) auf einem selbst betriebenen VPS mit [Coolify](https://coolify.io) und einer eigenen MySQL-Instanz – nicht auf Vercel. Mailversand läuft über SMTP der eigenen Domain, nicht über einen Drittanbieter.

- Architektur & Entscheidungen: [`docs/superpowers/specs/2026-08-04-self-hosted-migration-design.md`](docs/superpowers/specs/2026-08-04-self-hosted-migration-design.md)
- Umsetzung, Deployment-Stolpersteine & Go-live-Checkliste: [`docs/superpowers/plans/2026-08-04-self-hosted-migration-implementation.md`](docs/superpowers/plans/2026-08-04-self-hosted-migration-implementation.md)

Docker-Image lokal bauen und testen:
```bash
docker build -t norddeich-heuler:local .
docker run --rm --network host \
  -e DATABASE_URL="mysql://user:passwort@localhost:3306/datenbank" \
  -e SMTP_HOST=... -e SMTP_USER=... -e SMTP_PASS=... \
  -e OWNER_NOTIFICATION_EMAIL=... \
  -e ADMIN_EMAIL=... -e ADMIN_PASSWORD_HASH='...' \
  -e AUTH_SECRET=... -e AUTH_TRUST_HOST=true \
  norddeich-heuler:local
```
