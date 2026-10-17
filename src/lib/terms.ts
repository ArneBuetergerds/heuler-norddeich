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
