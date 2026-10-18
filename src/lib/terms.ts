/**
 * Mietbedingungen der Vermieterin – eine Quelle für Website, Mails und
 * Rechnung. Festgelegt mit Sabrina Rönne (Stand 2026-09-27).
 *
 * Geldbeträge und Anteile stehen in `pricing.ts`; hier nur Fristen und Texte.
 */

/** Zusage für die Antwort auf eine Anfrage. */
export const RESPONSE_HOURS = 48;

/** Frist für die Anzahlung ab der Buchungsbestätigung. */
export const DEPOSIT_DUE_DAYS = 7;

/**
 * Gestaffelte Stornokosten, bezogen auf den Mietpreis. `fromDays` ist die
 * Untergrenze in Tagen vor Anreise, ab der eine Stufe gilt – absteigend
 * sortiert, die letzte Stufe gilt bis zur Anreise.
 */
export const CANCELLATION_TIERS = [
  { fromDays: 42, label: "bis 42 Tage vor Anreise", cost: "kostenfrei – die Anzahlung wird erstattet" },
  { fromDays: 14, label: "41 bis 14 Tage vor Anreise", cost: "50 % des Mietpreises" },
  { fromDays: 0, label: "ab 13 Tage vor Anreise oder bei Nichtanreise", cost: "90 % des Mietpreises" },
] as const;

export const CANCELLATION_NOTES = [
  "Der Gästebeitrag der Stadt Norden wird bei einer Stornierung vollständig erstattet; die Stornokosten beziehen sich nur auf den Mietpreis.",
  "Die Stornierung bitte per E-Mail an kontakt@norddeich-heuler.de.",
  "Gelingt es, die Wohnung für den Zeitraum anderweitig zu vermieten, erstatten wir die Stornokosten.",
  "Wir empfehlen den Abschluss einer Reiserücktrittsversicherung.",
] as const;

/** Stornobedingungen als Textzeilen, z. B. für die Bestätigungsmail. */
export function cancellationLines(): string[] {
  return [
    "Stornobedingungen:",
    ...CANCELLATION_TIERS.map((tier) => `  ${tier.label}: ${tier.cost}`),
    ...CANCELLATION_NOTES.map((note) => `  ${note}`),
  ];
}

export const PARKING = "Eigener Stellplatz direkt am Haus, kostenlos";

/**
 * Anreise- und Abreisezeit. Eine Quelle für Website (Mietbedingungen, FAQ,
 * Kalender), strukturierte Daten und Bestätigungsmail. Zwischen 10 und 14 Uhr
 * wird gereinigt – darauf beruht der Wechseltag im Kalender
 * (src/lib/calendar.ts).
 */
export const CHECK_IN_HOUR = 14;
export const CHECK_OUT_HOUR = 10;

/** Für Texte: „14 Uhr“. */
export const CHECK_IN_TIME = `${CHECK_IN_HOUR} Uhr`;
export const CHECK_OUT_TIME = `${CHECK_OUT_HOUR} Uhr`;

/** Für strukturierte Daten (schema.org): „14:00“. */
export function isoTime(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}
