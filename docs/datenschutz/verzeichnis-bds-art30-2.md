# Verzeichnis aller Kategorien von Verarbeitungen im Auftrag

## des Auftragsverarbeiters nach Art. 30 Abs. 2 DSGVO

**ENTWURF, Stand 2026-09-20.** Vor Verwendung prüfen und die mit `[…]`
markierten Stellen ausfüllen.

> Dieses Verzeichnis ist getrennt von dem der Verantwortlichen zu führen. Es
> beschreibt nicht einzelne Verarbeitungstätigkeiten, sondern **Kategorien** von
> Verarbeitungen, und zwar je Auftraggeber. Kommen weitere Kunden hinzu, wird
> hier ein weiterer Abschnitt ergänzt — nicht ein neues Dokument angelegt.

## 1. Auftragsverarbeiter

| | |
|---|---|
| Name | Bütergerds Digital Solutions, Inhaber Arne Bütergerds |
| Anschrift | Schulstr. 6, 48465 Ohne |
| Kontakt | `[E-Mail-Adresse für Datenschutzangelegenheiten]` |
| Vertreter i. S. v. Art. 27 DSGVO | entfällt (Niederlassung in der EU) |
| Datenschutzbeauftragte(r) | nicht benannt; keine Benennungspflicht nach § 38 BDSG |
| Zuständige Aufsichtsbehörde | Die Landesbeauftragte für den Datenschutz Niedersachsen, Prinzenstraße 5, 30159 Hannover |

## 2. Auftraggeber

| Auftraggeber | Anschrift | Kontakt | AV-Vertrag seit |
|---|---|---|---|
| Sabrina Rönne (Ferienwohnung „Heuler", Norddeich) | Am Tannenkamp 1, 48465 Schüttorf | kontakt@norddeich-heuler.de | `[Datum der Unterzeichnung]` |

## 3. Kategorien von Verarbeitungen für Sabrina Rönne

### 3.1 Betrieb der Website und Verwaltung von Buchungsanfragen

| | |
|---|---|
| **Beschreibung** | Bereitstellung der Webanwendung `norddeich-heuler.de`, Speicherung der über das Anfrageformular übermittelten Daten in einer MySQL-Datenbank, Verwaltung von Belegungen und Sperrzeiträumen über einen geschützten Administrationsbereich |
| **Betroffene Personen** | Anfragende und Gäste; Besucherinnen und Besucher der Website |
| **Datenkategorien** | Name, E-Mail-Adresse, Telefonnummer, An- und Abreisedatum, Freitextnachricht, Bearbeitungsstatus, Begründungstexte, Gastnamen bei manuell eingetragenen Aufenthalten, Serverprotokolldaten |
| **Verarbeitungsschritte** | Erheben, Speichern, Auslesen, Verändern, Löschen |

### 3.2 Automatisierter E-Mail-Versand

| | |
|---|---|
| **Beschreibung** | Versand der Eingangsbestätigung, der Benachrichtigung an die Auftraggeberin sowie der Zu- und Absagen |
| **Betroffene Personen** | Anfragende und Gäste; die Auftraggeberin selbst als Empfängerin |
| **Datenkategorien** | Name, E-Mail-Adresse, Telefonnummer, Zeitraum, Nachricht, Begründungstext |
| **Verarbeitungsschritte** | Auslesen, Übermitteln |

### 3.3 Administration und Wartung

| | |
|---|---|
| **Beschreibung** | Fehleranalyse, Aufspielen von Aktualisierungen, Anwendung von Datenbankmigrationen, Zugriff auf Protokolldaten im Störungsfall |
| **Betroffene Personen** | alle vorgenannten |
| **Datenkategorien** | alle vorgenannten, soweit im Einzelfall erforderlich |
| **Verarbeitungsschritte** | Auslesen; Verändern nur auf Weisung |

> **Noch nicht in Betrieb, aber geplant** (Backlog Abschnitt 8): Push-Benachrichtigungen
> für den Administrationsbereich. Sobald umgesetzt, kommt hier eine Kategorie mit der
> Datenkategorie „Push-Endpunkt und kryptografische Schlüssel des Endgeräts" hinzu,
> und die Datenschutzerklärung ist zu ergänzen.

## 4. Unterauftragsverarbeiter

| Unternehmen | Anschrift | Leistung | Ort | AV-Vertrag |
|---|---|---|---|---|
| netcup GmbH | Daimlerstraße 25, 76185 Karlsruhe | virtueller Server für Anwendung und Datenbank | Deutschland | abgeschlossen |
| IONOS SE | Elgendorfer Straße 57, 56410 Montabaur | E-Mail-Versand und -Empfang | Deutschland | abgeschlossen `[Datum eintragen]` |

## 5. Übermittlungen in Drittländer

Keine. Die Verarbeitung findet ausschließlich in der Bundesrepublik Deutschland
statt.

Die Einbindung von Google Maps auf der Seite „Lage" erfolgt nicht durch den
Auftragsverarbeiter, sondern durch direkte Verbindung des Endgeräts der
betroffenen Person zu Google nach deren Einwilligung. Sie ist im Verzeichnis
der Verantwortlichen geführt.

## 6. Technische und organisatorische Maßnahmen

Allgemeine Beschreibung nach Art. 32 Abs. 1 DSGVO: siehe **Anlage 1 des
AV-Vertrags** (`av-vertrag-roenne-bds.md`). Die dort benannten offenen Punkte —
fehlende Datensicherung, Container mit Root-Rechten, fehlende Protokollierung
administrativer Aktionen — sind auch hier als bekannt zu führen, bis sie
behoben sind.
