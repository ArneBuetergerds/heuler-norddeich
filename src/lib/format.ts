/**
 * Datumsanzeige für die Oberfläche.
 *
 * `timeZone: "UTC"` ist zwingend: Die Daten kommen aus Drizzle-`date`-Spalten
 * und sind UTC-Mitternacht. Ohne die Angabe würde ein Browser östlich von UTC
 * den 1.8. als 31.7. anzeigen.
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateRange(start: Date, end: Date): string {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

/** Geldbetrag in deutscher Schreibweise, z. B. "1.234,50 €". */
export function formatEuro(amount: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

/** Zeitzone der Vermietung: Rechnungsdatum und Nummernkreis richten sich danach. */
export const BUSINESS_TIME_ZONE = "Europe/Berlin";

const berlinDateParts = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Kalenderdatum eines Zeitpunkts nach deutscher Zeit, ISO "YYYY-MM-DD".
 *
 * Anders als die `date`-Spalten (UTC-Mitternacht, siehe `formatDate`) ist ein
 * Ausstellungszeitpunkt ein echter Zeitpunkt: Eine Rechnung, die am 1.1. um
 * 0:30 Uhr deutscher Zeit entsteht, ist in UTC noch am 31.12. – sie gehört
 * aber ins neue Jahr.
 */
export function berlinIsoDate(date: Date): string {
  const parts = Object.fromEntries(
    berlinDateParts.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Kalenderjahr eines Zeitpunkts nach deutscher Zeit. */
export function berlinYear(date: Date): number {
  return Number(berlinIsoDate(date).slice(0, 4));
}

/**
 * Zeitpunkt nach deutscher Zeit, z. B. "01.03.2027, 10:01 Uhr" – für echte
 * Zeitpunkte (`timestamp`-Spalten), nicht für Kalendertage (`formatDate`).
 */
export function formatBerlinDateTime(instant: Date): string {
  const text = instant.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BUSINESS_TIME_ZONE,
  });
  return `${text} Uhr`;
}
