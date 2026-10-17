# Automatische Löschung (Löschlauf)

Die Website löscht Daten von Gästen, sobald sie nicht mehr gebraucht werden. Das
erledigt ein automatischer Löschlauf. Diese Seite beschreibt, was er tut, wann er
läuft und wo man sieht, ob er läuft. Sie richtet sich an die Betreiberin und an
Entwickler; die Abschnitte „Für Entwickler“ kann die Betreiberin überspringen.

Im Admin zeigt die Seite **Löschfristen** (`/admin/loeschfristen`) dieselben
Fristen, die Löschungen der nächsten 90 Tage und den letzten Lauf.

## Wann der Lauf läuft

- Einmal **60 Sekunden nach jedem Start** der Website (z. B. nach einem Update),
- danach **alle 24 Stunden**, gerechnet ab diesem ersten Lauf.

Es gibt **keine feste Uhrzeit**: Nach jedem Neustart verschiebt sich der Takt.
Fällt ein Lauf aus (z. B. weil die Datenbank kurz nicht erreichbar war), holt der
nächste alles nach – fällig ist fällig, egal an welchem Tag gelöscht wird.

Stichtag ist der Kalendertag nach deutscher Zeit.

## Fristen

Quelle der Fristen sind die Konstanten in `src/lib/retention.ts`. Die Tabelle hier
ist von dort abgeschrieben; ändert sich eine Frist, gilt der Code. Die Admin-Seite
„Löschfristen“ und die Datenschutzerklärung (Abschnitt „Speicherdauer“) werden aus
denselben Konstanten erzeugt und ändern sich automatisch mit.

| Datenart | Frist | Ab wann | Wirkung | Konstante |
|---|---|---|---|---|
| Anfragen ohne Reaktion (offen) | 6 Monate | ab Eingang | löschen | `PENDING_RETENTION_MONTHS` |
| Abgelehnte oder stornierte Anfragen | 6 Monate | ab Absage bzw. Stornierung; ältere Anfragen ohne erfasstes Absagedatum ab Eingang | löschen | `DECLINED_RETENTION_MONTHS` |
| Buchungen (online und telefonisch eingetragen) ohne Rechnung | 3 Kalenderjahre | ab Ende des Jahres der Abreise | löschen | `BOOKING_RETENTION_YEARS` |
| Buchungen mit Rechnung | 3 Kalenderjahre | ab Ende des Jahres der Abreise | anonymisieren | `BOOKING_RETENTION_YEARS` |
| Rechnungen | 10 Jahre | ab Ende des Jahres der Ausstellung | löschen, zusammen mit der Anfrage | `INVOICE_RETENTION_YEARS` |
| Interne Belegungen | 6 Monate | ab Abreisetag | löschen | `INTERNAL_RETENTION_MONTHS` |
| Altbestand: früher eingetragene Aufenthalte nur mit Gastname | 3 Kalenderjahre | ab Ende des Jahres der Abreise | löschen | `BOOKING_RETENTION_YEARS` |
| Protokoll administrativer Aktionen | 3 Jahre | ab Eintrag | löschen | `ACTION_LOG_RETENTION_YEARS` |
| Sperrzeiträume ohne Personenbezug (z. B. Wartung) | – | – | bleiben | – |

Beispiele:

- Eine offene Anfrage vom 31.8.2026 wird am 28.2.2027 gelöscht (gibt es den Tag im
  Zielmonat nicht, gilt der letzte Tag des Monats).
- Eine Buchung mit Abreise im Jahr 2027 wird bis zum 31.12.2030 aufbewahrt und am
  1.1.2031 gelöscht bzw. anonymisiert.
- Eine Rechnung von 2027 wird bis zum 31.12.2037 aufbewahrt und am 1.1.2038
  gelöscht.
- Eine interne Belegung mit Abreise am 1.9.2026 wird am 1.3.2027 gelöscht.

Die Abstimmung der Fristen mit der Steuerberatung steht noch aus (siehe
`docs/datenschutz/verzeichnis-roenne-art30-1.md`, Abschnitt 6).

## Löschen oder anonymisieren

- **Löschen** entfernt die Anfrage vollständig, samt ihrem Eintrag im
  Belegungskalender.
- **Anonymisieren** gibt es nur, wenn zu einer Buchung eine Rechnung gehört, die
  noch aufbewahrt werden muss. Dann werden Name und E-Mail-Adresse durch „gelöscht“
  ersetzt und Telefonnummer, Anschrift (Straße, PLZ, Ort, Land), Nachricht und die
  Begründung an den Gast entfernt.
  Zeitraum, Personenzahl und Status bleiben, weil sich die Rechnung darauf bezieht;
  der Kalendereintrag bleibt ebenfalls. Die Rechnung selbst (mit Name und Anschrift
  des Rechnungsempfängers) bleibt bis zum Ende ihrer Frist unverändert.
- Ist die Rechnungsfrist abgelaufen, werden **Rechnung und Anfrage gelöscht**.
  Endet die Rechnungsfrist vor der Frist der Anfrage, wird nicht erst anonymisiert,
  sondern gleich beides gelöscht.

Im Admin lässt sich eine Anfrage außerdem jederzeit von Hand löschen
(„Löschen“ an der Anfrage); mit Rechnung wird sie dabei anonymisiert. Eine
bestätigte Buchung, deren Abreise noch bevorsteht, muss vorher storniert werden.

## Telefonische Buchungen, interne Belegungen, Sperrzeiträume

Im Admin gibt es drei Arten, einen Zeitraum zu belegen. Für die Löschung
unterscheiden sie sich so:

- **Telefonische (manuelle) Buchung:** eine vollständige Buchung mit Gastdaten,
  die die Betreiberin selbst einträgt. Sie ist sofort bestätigt, bekommt keine
  automatischen Mails und kann eine Rechnung bekommen. Für die Löschung ist sie
  eine Buchung wie jede Online-Buchung (3 Kalenderjahre, mit Rechnung
  anonymisieren).
- **Interne Belegung:** Eigennutzung, Familie, Freunde. Nur Zeitraum und eine
  Notiz, keine Gastdaten, keine Rechnung. Weil die Notiz Personen nennen kann,
  wird sie 6 Monate nach dem Abreisetag gelöscht.
- **Sperrzeitraum:** z. B. Wartung, ohne Personenbezug. Wird nie automatisch
  gelöscht.

**Altbestand:** Früher wurden Aufenthalte nur mit einem Gastnamen eingetragen,
ohne Anfrage. Solche Einträge werden nicht mehr neu angelegt. Sie bleiben sichtbar
und werden wie eine Buchung gelöscht (3 Kalenderjahre ab Ende des Jahres der
Abreise), bis sie als telefonische Buchung oder interne Belegung neu eingetragen
sind.

## Was protokolliert wird

Jeder Lauf schreibt einen Eintrag ins Protokoll administrativer Aktionen
(Tabelle `admin_action_log`, Aktion `purge`, Akteur `system`) – **auch wenn nichts
fällig war**. So ist nachweisbar, dass die Löschung läuft. Der Eintrag enthält nur
Anzahlen, keine Namen oder sonstigen Gastdaten:

- gelöschte Anfragen, anonymisierte Anfragen, gelöschte Rechnungen,
- gelöschte Altbestand-Aufenthalte, gelöschte interne Belegungen,
- gelöschte Protokolleinträge.

Dieselben Anzahlen stehen zusätzlich als eine Zeile im Server-Log
(„Automatische Löschung: …“). Schlägt ein Lauf fehl, steht dort
„Automatische Löschung fehlgeschlagen: …“; die Website läuft weiter, und der
nächste Lauf holt nach.

## Wo man den letzten Lauf sieht

Auf der Admin-Seite **Löschfristen** unter „Letzter Löschlauf“: Zeitpunkt (deutsche
Zeit) und Anzahlen. Gibt es noch keinen Eintrag oder liegt der letzte Lauf mehr als
48 Stunden zurück, zeigt die Seite einen Hinweis, dass die Löschung nicht wie
erwartet läuft. Dann sollten die Server-Logs geprüft werden.

Die Liste „Nächste 90 Tage“ zeigt, was in dieser Zeit gelöscht oder anonymisiert
wird, mit Datum, Art, Bezug (Anfrage- bzw. Belegungsnummer), Gastname bzw. Notiz und
Zeitraum. Schon fällige Einträge (weil der nächste Lauf noch aussteht) stehen dort
mit „heute“.

## Für Entwickler

### Ablauf eines Laufs

Zeitplan: `src/lib/retentionSchedule.ts`, gestartet aus `src/instrumentation.ts`.
Der Lauf selbst ist `purgeExpiredData` in `src/db/retentionQueries.ts`, alles in
**einer Transaktion** – entweder ganz oder gar nicht.

1. **Kandidaten sperrend lesen** (`SELECT … FOR UPDATE`), ohne Gastdaten, in fester
   Reihenfolge: Anfragen (offen, abgelehnt, abgelehnt ohne `decided_at`,
   bestätigt), dann deren Rechnungen, dann interne Belegungen und Altbestand. Die
   Reihenfolge entspricht der der Admin-Aktionen (erst Anfrage, dann Rechnung),
   damit sich Lauf und Admin-Aktion nicht gegenseitig verklemmen.
2. **Entscheiden:** Die reine Funktion `planRetention` (`src/lib/retention.ts`)
   legt fest, was zu löschen und was zu anonymisieren ist.
3. **Ausführen**, in dieser Reihenfolge: Rechnungen löschen (ihr Fremdschlüssel
   verhindert sonst das Löschen der Anfrage), Anfragen samt Kalendereintrag löschen,
   Anfragen anonymisieren, Altbestand löschen, interne Belegungen löschen,
   abgelaufene Protokolleinträge löschen.
4. **Protokollieren:** Eintrag `purge` mit den Anzahlen.

### Vorfilter

Gelesen und gesperrt werden nur Zeilen, die am Stichtag fällig sein können
(`retentionPrefilter` in `src/lib/retention.ts`). Bei Fristen in Monaten ist die
Grenze großzügig (`PREFILTER_MARGIN_DAYS`), weil die Kappung auf das Monatsende,
die deutsche Tagesgrenze und die Zeitzone der Datenbankverbindung sie verschieben;
die genaue Entscheidung trifft `planRetention`. Bei Buchungen ist die Grenze genau
(Jahreswechsel). Rechnungen werden nur zu den gelesenen Anfragen geladen.

Der Lauf läuft unter `READ COMMITTED`: Unter MySQLs Voreinstellung
`REPEATABLE READ` sperrte `FOR UPDATE` ohne passenden Index jede durchsuchte Zeile.

### Vorschau und letzter Lauf

- `previewRetention` (`src/lib/retention.ts`) berechnet aus denselben
  Fristfunktionen, was bis `heute + 90 Tage` ansteht; `getRetentionPreview`
  (`src/db/retentionQueries.ts`) lädt die Kandidaten dafür ohne Sperre mit den
  gleichen Vorfiltern, Stichtag `heute + 90`.
- `getLastPurgeRun` liest den jüngsten `purge`-Eintrag; Anzahlen, die ältere
  Einträge noch nicht kennen, zählen als 0.
- `purgeRunOverdue` (`src/lib/retentionSchedule.ts`) entscheidet über den Hinweis
  „läuft nicht wie erwartet“ (kein Eintrag oder älter als 48 Stunden).
