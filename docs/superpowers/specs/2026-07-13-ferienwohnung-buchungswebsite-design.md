# Ferienwohnung Norddeich – Website mit Buchungsanfragen & Verfügbarkeitskalender

Status: In Abstimmung (Grundgerüst freigegeben, Rest in Review)
Datum: 2026-07-13

## Ziel

Website für eine Ferienwohnung in Norddeich unter eigener Domain. Gäste sollen die
Verfügbarkeit in einem Kalender einsehen und eine unverbindliche Buchungsanfrage stellen
können. Der Betreiber bestätigt Anfragen manuell und pflegt die Belegung über ein
geschütztes Admin-Panel. Monatliche Betriebskosten sollen minimal (idealerweise 0 €)
bleiben.

## Anforderungen (geklärt)

- **Buchungsart:** Nur Anfrage, keine Online-Zahlung. Architektur soll eine spätere
  Erweiterung um Zahlung (z. B. Stripe) nicht ausschließen.
- **Kalenderquelle:** Ausschließlich die eigene Website – kein Sync mit Airbnb/Booking/
  FeWo-direkt o. ä.
- **Pflege der Belegung:** Über ein einfaches Admin-Panel, kein manuelles Bearbeiten von
  Dateien im Repo.
- **Benachrichtigung:** Der Betreiber erhält bei jeder neuen Anfrage eine E-Mail
  (zusätzlich zur Sichtbarkeit im Admin-Panel).
- **Admin-Login:** E-Mail/Passwort-Login über einen Auth-Anbieter (kein reines
  Umgebungsvariablen-Passwort).

## Architektur-Übersicht (freigegeben)

- **Next.js (App Router)** – Frontend (öffentliche Seite, Kalender, Anfrageformular) und
  Backend (API-Routes) in einem Projekt.
- **Vercel (Hobby-Plan)** – Hosting; automatisches Deployment bei jedem Push auf `main`
  via GitHub-Integration; eigene Domain wird per DNS auf Vercel verbunden.
- **GitHub** – Repository, einfache Update-Workflow via Commit/Push.
- **Datenbank: Neon Postgres** – serverloser Postgres-Anbieter, als Vercel-Marketplace-
  Integration einfach anzubinden, großzügiger Free-Tier für dieses Datenvolumen
  passend.
- **ORM: Drizzle** – typsicherer, leichtgewichtiger DB-Zugriff (Alternative: Prisma,
  aber Drizzle passt besser zu Next.js/Vercel Edge-Runtime und hat weniger Overhead).
- **Auth: Auth.js (NextAuth) mit Credentials-Provider** – schützt ausschließlich das
  Admin-Panel; nur ein Admin-Account nötig, Session per Cookie/JWT.
- **E-Mail: Resend** – Free-Tier (3.000 E-Mails/Monat), sendet Benachrichtigung an den
  Betreiber bei neuer Anfrage.

## Datenmodell (Vorschlag)

**`booking_request`** – jede eingehende Anfrage eines Gasts
- `id`, `name`, `email`, `phone` (optional), `start_date`, `end_date`, `message`
  (optional), `status` (`pending` | `confirmed` | `declined`), `created_at`

**`blocked_period`** – tatsächlich belegte/gesperrte Zeiträume (Quelle der Wahrheit für
den öffentlichen Kalender)
- `id`, `start_date`, `end_date`, `note` (z. B. "Eigennutzung" oder Verweis auf
  `booking_request.id`), `created_at`

Bestätigt der Admin eine Anfrage, wird automatisch ein `blocked_period`-Eintrag erzeugt
und der Status der Anfrage auf `confirmed` gesetzt. So bleibt der öffentliche Kalender
unabhängig von offenen (unbestätigten) Anfragen – ein "pending"-Zeitraum blockiert den
Kalender für andere Gäste noch nicht automatisch.

## Ablauf

1. **Gast** öffnet die Website, sieht im Kalender belegte Zeiträume (`blocked_period`)
   und wählt einen freien Zeitraum für seine Anfrage.
2. Gast füllt Formular aus (Name, E-Mail, Zeitraum, Nachricht) → `POST
   /api/booking-request`.
3. Server validiert Eingaben (Zod), prüft auf Überschneidung mit bestehenden
   `blocked_period`n, speichert die Anfrage als `pending` in der DB.
4. Resend verschickt eine Benachrichtigungs-E-Mail an den Betreiber; optional eine
   Eingangsbestätigung an den Gast.
5. **Admin** loggt sich im geschützten Bereich ein, sieht offene Anfragen, bestätigt
   oder lehnt ab. Bei Bestätigung wird automatisch ein `blocked_period` angelegt.
6. Admin kann zusätzlich manuell `blocked_period`-Einträge anlegen (z. B. für
   Eigennutzung ohne Gastanfrage).

## Fehlerbehandlung

- Formularvalidierung serverseitig mit Zod (Pflichtfelder, Datumsformat,
  Start < Ende, Zeitraum in der Zukunft).
- Überschneidungsprüfung verhindert, dass zwei Anfragen denselben bereits bestätigten
  Zeitraum doppelt blockieren; bei Überschneidung mit einem `confirmed`-Zeitraum wird
  die Anfrage mit Fehlermeldung abgelehnt.
- Schlägt der E-Mail-Versand fehl, wird die Anfrage trotzdem gespeichert (E-Mail ist
  "best effort", kein harter Fehler für den Gast) und der Fehler serverseitig geloggt.
- Admin-Bereich ist durchgängig durch Auth.js-Middleware geschützt; nicht angemeldete
  Zugriffe werden zur Login-Seite umgeleitet.

## Testing

- Unit-Tests für die Datums-Überschneidungslogik (Kernstück der Buchungslogik).
- Integrationstest für `POST /api/booking-request` (Validierung, Speicherung,
  Konfliktfall).
- Manuelle Prüfung des Admin-Flows (Login, Anfrage bestätigen/ablehnen, Kalender
  aktualisiert sich).

## Kosten

Alle genutzten Dienste (Vercel Hobby, Neon Free-Tier, Resend Free-Tier) sind für dieses
Nutzungsvolumen kostenlos. Einzige Kosten sind die Domain-Registrierung (~10–15 €/Jahr,
kein monatlicher Posten).

## Offene Punkte / spätere Erweiterungen

- Online-Zahlung (z. B. Stripe) ist bewusst nicht Teil des ersten Wurfs, Datenmodell
  und Ablauf lassen sich aber später um einen Zahlungsstatus erweitern.
- Kein iCal-Sync mit externen Portalen vorgesehen (aktuell nicht benötigt).
