# Umzug auf Self-Hosting (VPS/Coolify, MySQL, IONOS-Mail)

Status: Freigegeben, bereit für Implementierungsplan
Datum: 2026-08-04

## Ziel

Die Website läuft aktuell komplett auf externen SaaS-Anbietern (angedacht: Vercel-Hosting,
Neon Postgres, Resend für Mail). Diese werden durch selbst betriebene Infrastruktur
ersetzt, damit alle Daten (Buchungen, Mails) auf der eigenen VPS/Coolify-Plattform
liegen und kein externer Anbieter mehr involviert ist:

- **Deployment:** eigener Netcup-VPS mit Coolify (Docker + Traefik), Domain
  `norddeich-heuler.de` bei IONOS registriert (inkl. E-Mail-Paket), zeigt auf den
  Coolify-Container.
- **Datenbank:** eigene MySQL-Instanz als Coolify-Resource auf dem VPS statt Neon
  Postgres.
- **Mail:** Nodemailer über die eigene Domain-Mailbox (IONOS-SMTP) statt Resend.

Vollständige Infrastruktur-Referenz (Server-Eckdaten, Coolify-Konventionen,
Deployment-Stolpersteine): `/home/arne/git/privat/Handoff.md`.

## Ausgangslage

- **DB:** `drizzle-orm/neon-serverless` (Postgres), zwei Tabellen (`booking_request`,
  `blocked_period`) mit Postgres-Enum und Check-Constraint. Enthält aktuell nur einen
  Smoke-Test-Datensatz – keine echten Buchungen zu migrieren.
- **Auth:** next-auth v5-beta, reiner Credentials-Provider mit JWT-Session, **kein
  DB-Adapter** – Admin-Login läuft vollständig über Env-Vars. Von der DB-Migration nicht
  betroffen.
- **Mail:** Resend, gekapselt in einer `send()`-Hilfsfunktion in `src/lib/email.ts` mit
  4 Templates (Betreiber-Benachrichtigung, Eingangsbestätigung, Zusage, Absage).
- **Deployment:** kein Dockerfile im Repo, kein `output: "standalone"`, `package.json`
  und Boilerplate-README deuten noch auf Vercel als ursprüngliches Ziel hin.
- **Rechtstexte:** `src/app/(site)/datenschutz/page.tsx` benennt aktuell explizit
  "Resend" als Mail-Dienst und "Vercel Inc." als Hosting-Anbieter – beides wird nach dem
  Umzug falsch und muss angepasst werden.

## A) Deployment (Coolify + Domain)

**Manuelle Schritte (außerhalb des Repos, durch den Nutzer):**

1. Domain `norddeich-heuler.de` bei IONOS registrieren, inkl. E-Mail-Paket für zwei
   Mailboxen: `noreply@norddeich-heuler.de` (SMTP-Login zum Versenden) und
   `kontakt@norddeich-heuler.de` (Empfänger der Betreiber-Benachrichtigungen).
2. In Coolify: Project/Environment + Application anlegen, Source = GitHub-Repo (private
   Repos benötigen einmalig eine Coolify GitHub App), Build Pack = **Dockerfile**.
3. In Coolify: MySQL-Resource anlegen – **intern, kein Public Port** – liefert die
   interne `DATABASE_URL` für die App.
4. Erst unter einer Coolify-Plattform-Subdomain deployen und testen (löst sofort auf).
   Danach bei IONOS die DNS-Records setzen (Apex `@` → A-Record auf die VPS-IP, `www` →
   CNAME/A auf denselben Host), Domain in Coolify eintragen und **redeployen** (Traefik-
   Routing-Labels entstehen erst beim Deploy neu).

**Änderungen im Repo:**

- Neues `Dockerfile`: Multi-Stage-Build für Next.js (Standalone-Output). Der finale
  Start-Command führt vor dem App-Start automatisch die DB-Migration aus:
  `drizzle-kit migrate && node server.js`.
- `next.config.ts`: `output: "standalone"` ergänzen (schlankes Image).
- Ports Exposes in Coolify = 3000; App bindet `0.0.0.0` (beim Next.js-Standalone-Server
  über `HOSTNAME=0.0.0.0` sicherstellen).
- `.env.example` aktualisieren: `DATABASE_URL` (jetzt `mysql://…`), `SMTP_HOST`,
  `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `OWNER_NOTIFICATION_EMAIL` (=
  `kontakt@norddeich-heuler.de`), `AUTH_URL` (= `https://norddeich-heuler.de` in
  Produktion, next-auth v5 braucht das explizit für serverseitige Callback-URLs) sowie
  `AUTH_TRUST_HOST=true` (next-auth v5 verwirft sonst Requests hinter Traefiks
  Reverse-Proxy mit "UntrustedHost", da es die `X-Forwarded-*`-Header ohne diesen Schalter
  nicht als vertrauenswürdig einstuft). `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH` bleiben
  unverändert. `RESEND_API_KEY` entfällt.
- Alle Secrets (`DATABASE_URL`, `SMTP_PASS`, `ADMIN_PASSWORD_HASH`, `AUTH_SECRET`) in
  Coolify mit **„Build Variable" AUS** eintragen, sonst landen sie in der Image-History.

## B) Datenbank (Postgres → MySQL)

- **`src/db/schema.ts`:** Umstellung von `drizzle-orm/pg-core` auf
  `drizzle-orm/mysql-core`: `pgTable` → `mysqlTable`, `pgEnum` → `mysqlEnum`,
  `serial("id")` → `int("id").autoincrement()`. Der `check()`-Constraint bleibt
  inhaltlich gleich (nur Import aus `mysql-core`) – MySQL ≥ 8.0.16 unterstützt CHECK
  nativ. `date`/`timestamp` haben mysql-core-Äquivalente mit denselben `mode`-Optionen.
- **`src/db/client.ts`:** `drizzle-orm/neon-serverless`, `@neondatabase/serverless` und
  `ws` entfernen; stattdessen `drizzle-orm/mysql2` mit einem `mysql2/promise`-Pool. Der
  `neonConfig.webSocketConstructor`-Hack entfällt (war Neon-spezifisch).
- **`drizzle.config.ts`:** `dialect: "mysql"`.
- **Migrationen:** Bestehende `drizzle/0000_*.sql`, `0001_*.sql` und `drizzle/meta/`
  (Postgres-Dialekt) löschen, mit `drizzle-kit generate` frisch für MySQL erzeugen. Keine
  Datenmigration nötig (nur Smoke-Test-Daten vorhanden).
- **`scripts/verify-booking-flow.ts`:** Nutzt aktuell `.returning()` nach einem Insert
  (Postgres-spezifisch, unter `mysql2` nicht verfügbar). Wird ersetzt durch: Insert
  ausführen, anschließend die Zeile über die von `mysql2` zurückgegebene `insertId`
  erneut abfragen.
- **Nicht betroffen:** `adminQueries.ts`, `queries.ts`, `booking.ts` und ihre Tests –
  arbeiten ausschließlich über die generische Drizzle-Query-API (`eq`, `select`,
  `transaction`), keine Postgres-spezifischen Aufrufe. Die Unit-Tests laufen komplett
  gegen eine gemockte `FakeDb`, nicht gegen eine echte Datenbank, und bleiben unverändert
  lauffähig.

## C) E-Mail (Resend → Nodemailer) + Rechtstexte

- **`src/lib/email.ts`:** `resend` durch `nodemailer` ersetzen. Ein SMTP-Transport (beim
  Modul-Import einmal erstellt, Connection Pooling statt Neuverbindung pro Mail): Host
  `smtp.ionos.de`, Port 587, STARTTLS, Login über `SMTP_USER`/`SMTP_PASS`
  (= Zugangsdaten von `noreply@norddeich-heuler.de`).
  - `FROM` ändert sich von `onboarding@resend.dev` zu
    `Ferienwohnung Heuler <noreply@norddeich-heuler.de>`.
  - Die öffentliche Signatur der 4 Template-Funktionen
    (`sendBookingRequestNotification`, `sendGuestRequestReceived`,
    `sendGuestConfirmation`, `sendGuestDecline`) bleibt unverändert – nur `send()`
    intern wird ausgetauscht. Nodemailer wirft bei Zustellfehlern regulär eine
    Exception (einfacher als Resends Error-im-Result-Pattern), die Fehlerprüfung bleibt
    also weiterhin explizit vorhanden.
  - `OWNER_NOTIFICATION_EMAIL` wird künftig auf `kontakt@norddeich-heuler.de` gesetzt
    (reine Env-Var-Änderung, kein Code betroffen).
- **`src/app/(site)/datenschutz/page.tsx`:** Zwei Textstellen anpassen:
  - Abschnitt zu Benachrichtigungs-Mails: Erwähnung von "Dienst Resend" ersetzen durch
    einen Hinweis, dass der E-Mail-Versand über den eigenen Mailserver (IONOS) erfolgt,
    kein externer Drittanbieter beteiligt ist.
  - Abschnitt "4. Hosting": "Diese Website wird bei Vercel Inc. gehostet" ersetzen durch
    einen Hinweis auf eigenes VPS-Hosting (kein externer Cloud-Anbieter, Verarbeitung von
    Zugriffsdaten erfolgt auf eigener Infrastruktur).

## D) Testing & Reihenfolge

**Verifikation im Repo (ohne externe Accounts möglich):**

- Bestehende Vitest-Suite (31 Tests) bleibt unverändert lauffähig (dialektunabhängig).
- `tsc --noEmit` bleibt fehlerfrei.
- `scripts/verify-booking-flow.ts` (nach dem `.returning()`-Fix) gegen die bereits lokal
  laufende MySQL-Instanz ausführen – deckt Transaktionsverhalten, Check-Constraint und
  Occupancy-Logik gegen eine echte MySQL-DB ab.
- Lokaler `docker build` + Testlauf des Containers gegen die lokale MySQL, bevor das
  erste Mal in Coolify deployt wird (Sanity-Check für den Standalone-Build).

**Abhängigkeit auf externe Schritte:** Der tatsächliche Mail-Versand (Nodemailer/SMTP)
lässt sich erst mit echten Zugangsdaten final verifizieren, sobald die IONOS-Mailboxen
eingerichtet sind. Bis dahin wird der Code fertiggestellt; die Versand-Verifikation ist
der letzte Schritt vor Go-live.

**Empfohlene Reihenfolge:**

1. **DB-Migration (Abschnitt B)** – sofort startbar, lokal gegen die bereits laufende
   MySQL-Instanz testbar.
2. **Mail-Migration + Rechtstexte (Abschnitt C)** – Code parallel entwickelbar; finale
   SMTP-Versand-Verifikation erst nach IONOS-Einrichtung möglich.
3. **Dockerfile + Coolify-Setup (Abschnitt A)** – sobald B und C stehen; zuerst unter
   Test-Subdomain, danach echte Domain nach DNS-Umstellung.

## Out of Scope

- Umbenennung von `package.json` (`"name": "nextgen"`) – bereits als kosmetischer
  Altfollow-up bekannt, nicht Teil dieses Umzugs.
- Migration von Bestandsdaten aus Neon – es existieren keine echten Buchungen, nur ein
  Smoke-Test-Datensatz.
- Änderungen an der Auth-Logik (`src/auth.ts`) – kein DB-Adapter im Einsatz, von der
  DB-Migration nicht betroffen.
