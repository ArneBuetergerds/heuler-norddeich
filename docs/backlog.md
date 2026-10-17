# Heuler – Backlog

Abgeleitet aus `Heuler TODO.md` (Stand 2026-09-20). Reihenfolge = Vorschlag für die Umsetzung.
Aufgaben mit **BLOCKIERT** brauchen zuerst eine Antwort von Arne/Sabbi.

## 1. Startseite als One-Pager

Entscheidung: `/verfuegbarkeit` wird aufgelöst, alles wandert auf `/`.

- **1.1 Hero ersetzen** – `src/app/(site)/page.tsx`: starres `h-[440px]`-Einzelbild raus,
  stattdessen Bildergalerie/Slider mit `aspect-ratio` statt fixer Höhe. Bildmaterial liegt
  unter `public/images/` (haus-garten, wohnen-essen, schlafzimmer-*, bad, umgebung).
  Mobil zuerst entwerfen: aktuell schneidet das Hero-Bild auf schmalen Viewports hart ab.
- **1.2 Kalender + Formular auf die Startseite** – `AvailabilityCalendar` und
  `BookingRequestForm` einbinden. Seite braucht dann `export const dynamic = "force-dynamic"`
  und `getOccupancy()` (siehe bisheriges `verfuegbarkeit/page.tsx`), sonst friert Next.js die
  Belegung zum Build-Zeitpunkt ein.
- **1.3 Preistabelle, An-/Abreise, Kurkarten-Block übernehmen** – aus
  `verfuegbarkeit/page.tsx` auf die Startseite, darunter die Teaser-Karten.
- **1.4 `/verfuegbarkeit` entfernen + Redirect** – `redirects()` in `next.config.ts` auf `/`
  (301). Interne Links anpassen: `page.tsx` (2×), `kontakt/page.tsx`, `NavBar.tsx`, `Footer.tsx`.
  Anker `/#anfrage` für die bisherigen CTA-Buttons.
- **1.5 Mobil-Durchgang** – Preistabelle (scrollt aktuell horizontal), Teaser-Grid,
  Kalender-Popover mit `numberOfMonths={2}` (auf Mobil auf 1 reduzieren).

## 2. Inhalte und Preise

- **2.1 WLAN** – ✅ erledigt, steht jetzt auf „Vorhanden".
  Offen: kostenfrei? Als eigene Feature-Karte statt nur Policy-Zeile?
- **2.2 Kurtaxe** – 2,50 € → **3,50 €** (Haupt), 1,20 € → **1,80 €** (Neben).
  Link von `http://` auf `https://` und auf Gültigkeit prüfen. **BLOCKIERT** – siehe Fragen.
- **2.3 Kurkarten-Text** – aktuell: „Die Kurtaxe wird von uns eingezogen und an die Stadt
  Norden weitergeleitet." Widerspricht dem TODO („Kurtaxe vor Ort bar"). **BLOCKIERT**.

## 3. Bettwäsche/Handtücher als buchbare Option

Entscheidung: buchbar im Anfrageformular, nicht nur Info-Text.

- **3.1 DB-Migration** – `booking_request` um `guests` (int), `linens` (bool),
  `towels` (bool) erweitern; Drizzle-Migration erzeugen.
- **3.2 Formular** – Personenzahl (1–4, Wohnung ist für max. 4 Gäste) plus zwei Checkboxen
  in `BookingRequestForm.tsx`, mit Preisanzeige 10 €/5 € pro Person.
- **3.3 Validierung** – `validation.ts`: `guests` 1–4, Zusatzposten nur mit Personenzahl.
- **3.4 Hinweis „1 Woche vor Anreise anmelden"** – am Formular und im Nebenkostenblock.
  Bei Anreise in unter 7 Tagen sollte die Option deaktiviert oder als „auf Anfrage" markiert sein.
- **3.5 Ausgabe** – Betreiber-Mail und Gast-Mails (`email.ts`) um die Posten ergänzen,
  ebenso die Admin-Detailansicht (5.1) und die Rechnung (7).
- **BLOCKIERT** – Zuordnung 10 €/5 € und „pro Aufenthalt vs. pro Woche", siehe Fragen.

## 4. Datepicker

- **4.1 Admin-Sperrzeiträume** – `ManualBlockedPeriodForm.tsx` nutzt zwei nackte
  `<input type="date">` → auf `DateRangePicker` umstellen. Achtung: `blocked_period.endDate`
  ist intern **exklusiv** gespeichert (siehe `createMaintenanceBlock` und `lastBlockedDay`
  in `admin/sperrzeitraeume/page.tsx`) – die Umrechnung muss erhalten bleiben.
  Im Admin dürfen anders als im Gast-Picker auch Vergangenheitsdaten wählbar sein.
- **4.2 Gast-Picker härten** – `DateRangePicker.tsx`: gesperrte Tage sind `disabled`, ein
  Zeitraum kann aber darüber *hinwegspringen*. Das fällt erst serverseitig als 409 auf.
  Fix über `excludeDisabled` bzw. eigene Prüfung gegen `occupancy`.
- **4.3 Mindestnächte durchsetzen** – aktuell nur grauer Hinweistext; `BookingRequestForm`
  soll vor dem Absenden blockieren (dieselbe Regel wie `validation.ts` per `superRefine`).
- **4.4 Tests** – `booking.test.ts` / `dateRange.test.ts` um die Sprung-Fälle erweitern.

## 5. Admin-Belegübersicht

- **5.1 Detailansicht** – Klick auf einen Aufenthalt in `StayList`/`OccupancyCalendar` öffnet
  einen Dialog mit Name, E-Mail, Telefon, Nachricht, Nächten, Preis (aus `pricing.ts`),
  Status, Eingangsdatum, Zusatzposten (3.5) und Link zur Rechnung (7).
  `getOccupancy()` liefert Gastname/Notiz bereits mit, die übrigen Felder brauchen einen
  Join auf `booking_request`.

## 6. Mail-Durchstich

- **6.1 Testversand** aller vier Mails: Eingang Gast, Info an Betreiberin, Bestätigt,
  Abgelehnt. Unit-Tests existieren bereits (`email.test.ts`) – hier geht es um echten SMTP.
  **BLOCKIERT** – Admin-Seite mit Buttons oder `scripts/send-test-mails.ts`? Siehe Fragen.
- **6.2 `replyTo` in den Gast-Mails setzen** – ✅ erledigt. Kein Datenverlust: `noreply@` ist ein Alias,
  der auf `kontakt@` zustellt. Trotzdem sinnvoll, weil Bestätigung und Absage wörtlich zum
  Antworten auffordern („Bei Fragen antworten Sie einfach auf diese E-Mail"), der Gast im
  Client aber „noreply@" liest – viele antworten auf so einen Absender grundsätzlich nicht.
  Fix: `replyTo: "kontakt@norddeich-heuler.de"` in allen drei Gast-Mails.
- **6.3 SPF/DKIM/DMARC** für die Versanddomain gegenchecken.

## 7. Rechnungserzeugung

Entscheidung: nur Miete, PDF-Download im Admin, Versand macht Sabbi selbst.

- **7.1 PDF-Generierung** – Nächte × Saisonpreis (`pricing.ts` liefert die Saison;
  bei saisonübergreifenden Aufenthalten pro Nacht einzeln bewerten – das kann `pricing.ts`
  noch nicht, `seasonForDate` gilt aktuell nur für den Anreisetag).
- **7.2 Hinweisblock** – „Vor Ort bar zu zahlen: Endreinigung 55 €, Servicegebühr 30 €,
  Kurtaxe" – ohne Summierung in der Rechnungssumme.
- **7.3 Rechnungsnummern** – fortlaufend, eigene Tabelle oder Spalte an `booking_request`.
- **7.4 Route** – `GET /api/admin/booking-request/[id]/invoice`, auth-geschützt, Button in 5.1.
- ✅ **Steuer geklärt (2026-09-27):** Sabrina Rönne ist Kleinunternehmerin – keine USt,
  Pflichthinweis nach § 19 UStG steht bereits in der Rechnung (`SMALL_BUSINESS_NOTE`
  in `invoice.ts`). Anzahlung 30 % ist ebenfalls abgebildet (`DEPOSIT_SHARE`).

## 8. PWA und Push-Notifications

Entscheidung: volle PWA inkl. Install-Prompt für Gäste.

- ✅ **8.1–8.5 Push für die Betreiberin** (2026-09-27) – `public/sw.js` (Scope `/admin`, ohne
  Caching), `public/admin.webmanifest` + Icons unter `public/icons/`, Tabelle
  `push_subscription` (Migration 0003), Schalter mit „Test senden" oben auf `/admin`, Versand in
  `POST /api/booking-request` parallel zur Mail. Datenschutzerklärung Abschnitt 4 ergänzt.
  **Offen für den Go-live:** VAPID-Schlüssel erzeugen (`npx web-push generate-vapid-keys`) und
  in Coolify sowie `.env.example` eintragen; auf Sabbis iPhone einmal „Zum Home-Bildschirm"
  und einschalten.
- **8.6 Install-Prompt für Gäste** – noch offen. Bräuchte ein zweites, öffentliches Manifest
  (`start_url: /`) und einen dezenten Banner; iOS nur per Hinweis „Teilen → Zum Home-Bildschirm".

## 9. Rechtstexte

Geklärt am 2026-09-20: **BDS = Bütergerds Digital Solutions**, Kleinunternehmen von Arne.
Die Rolle ist damit eindeutig:

    Sabrina Rönne          Verantwortliche (Art. 4 Nr. 7) – vermietet, entscheidet über Zwecke
      └─ BDS               Auftragsverarbeiter (Art. 28) – betreibt Website + DB, VPS gehört BDS
           └─ netcup       Unterauftragsverarbeiter (Art. 28 Abs. 4)
           └─ IONOS        Unterauftragsverarbeiter (Mailvertrag liegt bei BDS)

BDS: Bütergerds Digital Solutions, Schulstr. 6, 48465 Ohne.

- **9.1 AV-Vertrag Rönne ↔ BDS** – Entwurf liegt vor:
  `docs/datenschutz/av-vertrag-roenne-bds.md` (inkl. Anlage 1 TOMs, Anlage 2
  Unterauftragsverarbeiter, Anlage 3 genehmigte Gestaltungsentscheidungen).
  Offen: `[…]`-Stellen ausfüllen, juristische Prüfung, Unterschrift.
- **9.2 AV-Vertrag BDS ↔ netcup** – ✅ erledigt (Stand 2026-09-20).
- ✅ **9.3 Datenschutzerklärung, Abschnitt 4 (Hosting) ist sachlich falsch** –
  „ein von uns angemieteter Server (VPS) der netcup GmbH". „Uns" ist laut Abschnitt 1
  Sabrina Rönne; der VPS gehört aber BDS. Neu formulieren: Betrieb durch BDS als
  Auftragsverarbeiter, netcup als Unterauftragsverarbeiter.
- ✅ **9.4 Neuer Abschnitt „Auftragsverarbeitung"** – Bütergerds Digital Solutions,
  Schulstr. 6, 48465 Ohne. Auftragsverarbeiter sind Empfänger i. S. v. Art. 4 Nr. 9,
  gehören also nach Art. 13 Abs. 1 lit. e in die Erklärung.
- ✅ **9.5 Abschnitt 3 (IONOS) korrigieren** – der Mailvertrag liegt bei BDS, IONOS ist damit
  Unterauftragsverarbeiter von BDS, nicht direkter Dienstleister von Rönne. Rönne hat
  Zugang zu `kontakt@` für die Gastkommunikation – das ist Zugriff der Verantwortlichen
  auf eigene Daten und begründet keinen weiteren Verarbeiter.
- ✅ **9.6 Rechtsgrundlagen fehlen komplett** – kein Art. 6 in der gesamten Erklärung.
  Buchungsanfrage: Art. 6 Abs. 1 lit. b. Pflichtangabe nach Art. 13 Abs. 1 lit. c.
- ✅ **9.7 Beschwerderecht fehlt** – Abschnitt 6 listet Auskunft, Berichtigung, Löschung,
  Einschränkung. Es fehlen Widerspruch, Datenübertragbarkeit und vor allem das
  Beschwerderecht bei der Aufsichtsbehörde (Art. 77), Pflichtangabe nach Art. 13 Abs. 2 lit. d.
  Zuständig ist die Landesbeauftragte für den Datenschutz Niedersachsen (Sitz der
  Verantwortlichen: Schüttorf).
- ✅ **9.8 Google Maps lädt ohne Einwilligung** – `lage/page.tsx:106` bindet ein nacktes
  `<iframe>` auf `google.com/maps` ein. Abschnitt 5 der Erklärung beschreibt den Verstoß
  selbst („unabhängig davon, ob Sie mit der Karte interagieren"). § 25 TDDDG verlangt
  Einwilligung. Fix: Zwei-Klick-Lösung oder statisches Kartenbild mit Link auf Maps.
- ✅ **9.9 Impressum zitiert außer Kraft gesetzte Gesetze** – „§ 5 TMG" heißt seit Mai 2024
  § 5 DDG, „§ 55 Abs. 2 RStV" seit 2020 § 18 Abs. 2 MStV. Zwei Strings in
  `impressum/page.tsx`. BDS gehört *nicht* ins Impressum – Diensteanbieterin ist Rönne.
- **9.10 Verarbeitungsverzeichnisse** – Entwürfe liegen vor:
  `docs/datenschutz/verzeichnis-roenne-art30-1.md` und `…/verzeichnis-bds-art30-2.md`.
  Offen: `[…]`-Stellen, Löschfristen mit der Steuerberatung abstimmen.
- **9.11 TOMs (Art. 32)** – gehören als Anlage an den AV-Vertrag. Konkreter offener Punkt
  aus dem `Dockerfile`: der Container läuft als root (dort bereits als TODO vermerkt).
- **9.12 Backups einrichten** – aktuell **keine** vorhanden. Art. 32 Abs. 1 lit. c verlangt
  Wiederherstellbarkeit. Über Coolify auf dem VPS einstellbar. Zwei Folgefragen, die
  datenschutzrechtlich durchschlagen:
  * Ziel **lokal auf demselben VPS** erfüllt den Zweck nicht – bei Verlust des VPS ist das
    Backup mit weg. Ziel **S3/Object Storage** löst das, ist aber ein weiterer
    Unterauftragsverarbeiter und muss in 9.4 mit aufgenommen werden.
  * Aufbewahrungszyklus. Abschnitt 7 der Erklärung verspricht Löschung „sobald nicht mehr
    erforderlich" – Backups halten gelöschte Anfragedaten weiter vor. Der Text braucht den
    üblichen Zusatz, dass Sicherungskopien turnusmäßig überschrieben werden.
- **9.13 CODE: Es gibt keine Löschfunktion** – weder im Admin noch automatisiert lässt sich
  eine Buchungsanfrage löschen. Solange das so ist, kann keine Löschfrist eingehalten
  werden und die Zusage in der Datenschutzerklärung („werden gelöscht, sobald nicht mehr
  erforderlich") ist nicht eingelöst. Nötig: Löschen-Aktion im Admin plus eine Routine,
  die abgelaufene Datensätze nach den Fristen aus dem Löschkonzept entfernt.
  Beachten: `blocked_period.booking_request_id` hat `onDelete: cascade` – beim Löschen
  einer bestätigten Anfrage verschwindet auch die Belegung aus dem Kalender.
- **9.14 CODE: Serverprotokolle** – Aufbewahrungsdauer der Logs ist nirgends festgelegt.
  Vorschlag 7 Tage, in Coolify/Docker konfigurieren.
- **9.15 Meldescheine nach §§ 29, 30 BMG** – Ferienwohnungen sind Beherbergungsstätten und
  meldescheinpflichtig. Die Aufbewahrung ist zwingend auf **ein Jahr** festgelegt, danach
  Vernichtung binnen drei Monaten (§ 30 Abs. 4 BMG). Läuft derzeit offenbar außerhalb des
  Systems und ist nirgends dokumentiert. Klären, ob Meldescheine geführt werden – wenn ja,
  gehören sie ins Verzeichnis (dort bereits als Tätigkeit 4 vorbereitet).
- ✅ **9.16 IONOS-AVV** – abgeschlossen (Stand 2026-09-27).
- **9.17 Protokollierung administrativer Aktionen** – Bestätigung, Absage, Storno und das
  Anlegen/Löschen von Sperrzeiträumen werden nicht protokolliert. In Anlage 1 des
  AV-Vertrags als Lücke bei der Eingabekontrolle geführt.

## 10. SEO

- ✅ **10.1–10.4 umgesetzt** (2026-09-27) – `src/lib/site.ts` (Stammdaten, `pageMetadata`),
  Titel/Beschreibung/Canonical/OpenGraph je Seite, Vorschaubild `public/og-image.jpg`,
  `app/sitemap.ts` + `app/robots.ts` (Admin/API ausgeschlossen, Admin zusätzlich `noindex`),
  JSON-LD `LodgingBusiness` auf der Startseite (`src/lib/structuredData.ts`).
- **10.5 Semantik/A11y** – Überschriftenhierarchie prüfen, Alt-Texte sind gepflegt.
- **10.7 Nach dem Go-live** – Google Search Console einrichten (Domain per DNS bestätigen),
  Sitemap einreichen, strukturierte Daten mit dem Rich-Results-Test prüfen.
- **10.6 Google Business Profile / Maps-Eintrag** – manuell, kein Code. Offen: wer macht das?

## 11. Sicherheit (Review 2026-09-27)

- ✅ **11.1 Rechen-DoS** – max. 60 Nächte, Anreise max. 24 Monate voraus (`validation.ts`).
- ✅ **11.2 Formular als Spam-Relay** – Rate-Limit (10/h je IP, 40/Tag gesamt), Fangfeld
  `website` + Mindest-Ausfüllzeit 3 s, Längen- und Zeichengrenzen für Name/Telefon/Nachricht.
- ✅ **11.3 Auth fail-open bei Fehlkonfiguration** – next-auth beta.32, `requireAdmin()`/`isAdmin()`
  prüfen die Admin-Adresse statt nur `session !== null`; zusätzlich Origin-Prüfung.
- ✅ **11.4 Login-Brute-Force** – 5 Fehlversuche/15 min je IP, 30 gesamt; bcrypt läuft auch bei
  falscher E-Mail (kein Timing-Leak); Sitzung 12 h statt 30 Tage; neue Hashes mit Cost 12.
- ✅ **11.5 Security-Header** – CSP, HSTS, X-Frame-Options, nosniff, Referrer-/Permissions-Policy,
  `X-Powered-By` entfernt (`next.config.ts`).
- ✅ **11.6 Doppelbuchung** – `FOR UPDATE` bei der Verfügbarkeitsprüfung, nur offene Anfragen
  bestätigbar.
- ✅ **11.7 Dependencies** – next 16.3.6, nodemailer 10, `npm audit --omit=dev`: 0 Treffer.
- ✅ **11.8 Push-SSRF** – nur Push-Dienste von Google, Mozilla, Apple, Microsoft.
- ✅ **11.9 Docker** – läuft als `node` statt root, `.env*` nie im Image.
- **11.10 Offen** – Löschfunktion/Löschfristen (siehe 9.13); Migration mit eigenem DB-User statt
  App-User; `output: "standalone"` für ein schlankeres Image; CSP ohne `'unsafe-inline'` (Nonces)
  bräuchte durchgehend dynamisches Rendering.

## 12. Conversion (2026-09-27)

- ✅ **12.1 Einstieg Startseite** – Galerie oben (beginnt mit dem Wohnbereich, mobil quadratisch),
  H1 „Ferienwohnung in Norddeich für bis zu 4 Personen“, Faktenliste, Buttons „Freie Termine
  prüfen“ / „Preise ab 54 € / Nacht“. Titel: „Ferienwohnung Norddeich für 4 Personen nahe
  Seehundstation | Heuler“.
- ✅ **12.2 Live-Preis im Formular** (`PriceQuote.tsx`, `quoteStay()` in `pricing.ts`) –
  Gesamtpreis inkl. Endreinigung/Servicegebühr (PAngV), Anzahlung, Gästebeitrag-Obergrenze.
- ✅ **12.3 Gesamtpreis-Beispiele** unter der Preistabelle.
- ✅ **12.4 Kalender-Legende** – „Nur Abreise möglich“ als eigener Zustand.
- **12.5 Offen, braucht Sabbi** – Stornobedingungen, Anzahlungsfrist, Zweck der Servicegebühr,
  Antwortzeit-Zusage, Foto/Text, Parken, Schlüsselübergabe.

## 13. Bedienung mobil (2026-09-27)

- ✅ **13.1 Kontrast** – `schlick-2` zinc-600, `schlick-3` zinc-500 (beide ≥ 4,5:1).
- ✅ **13.2 Datumsfeld** – 52px hoch, mobil ein Monat und 40px-Tage.
- ✅ **13.3 Belegungskalender** – Pfeile 44px, kein Zurückblättern vor den aktuellen Monat,
  Tageszustand für Screenreader, belegte Tage durchgestrichen.
- ✅ **13.4 Formularfehler** – am betroffenen Feld (auch Serverfehler, `field` in der Antwort),
  mit Sprung und Fokus; Netzwerkfehler abgefangen; Erfolgsmeldung mit Zeitraum und E-Mail.
- ✅ **13.5 Admin mobil** – offene Anfragen zuerst, E-Mail/Telefon antippbar, Knöpfe 44px,
  Kopfzeile zweizeilig. Admin-Link aus dem öffentlichen Footer entfernt (Zugang über
  Lesezeichen bzw. installierte App).
- ✅ **13.6 Kleinere Punkte** (2026-09-27) – Belegungskalender direkt anklickbar (Anreise →
  Abreise, gleiche Regeln wie der Picker, `lib/staySelection.ts`), geteilter Zeitraum mit dem
  Formular (`AvailabilityRequest.tsx`); Lightbox für Startseiten-Galerie und Ausstattungsbilder
  (`Lightbox.tsx`); Mobilmenü schließt per Escape und Klick außerhalb.

## 14. Konditionen & Vertrauen (2026-09-27)

Festgelegt (Rückmeldung Arne/Sabbi): gestaffelte Stornierung (42 / 14 Tage: kostenfrei / 50 % /
90 %), Anzahlung binnen 7 Tagen, Antwort binnen 48 Stunden, eigener Stellplatz am Haus
(kostenlos), WLAN kostenlos, Servicegebühr bleibt, kein Foto der Vermieterin.

- ✅ **14.1** Alle Konditionen zentral in `src/lib/terms.ts`; Website, Bestätigungs- und
  Eingangsmail sowie Rechnungs-PDF nutzen sie.
- ✅ **14.2** Stornobedingungen unter den Preisen (`#storno`), verlinkt am Formular.
- ✅ **14.3** Ablauf „Anfrage → Antwort → Anzahlung → Anreise“ über Kalender und Formular.
- ✅ **14.4** FAQ-Seite `/faq` (14 Fragen, FAQPage-JSON-LD), in Navigation, Footer, Sitemap.
- ✅ **14.5** Stellplatz und kostenloses WLAN in Fakten, Ausstattung, strukturierten Daten.
- **14.6 Offen** – Schlüsselübergabe (Ort/Treffpunkt) mit Sabbi klären; Stornobedingungen vor
  dem Go-live rechtlich prüfen lassen (Vertragsbestandteil!).
