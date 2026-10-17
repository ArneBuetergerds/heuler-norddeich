/**
 * Der Monat der Admin-Belegungsübersicht steht in der Adresse
 * (`/admin?monat=JJJJ-MM`), damit Blättern ohne Client-State auskommt und der
 * Server nur die Aufenthalte dieses Monats lädt.
 *
 * Ein Monat ist hier immer der Erste des Monats als UTC-Mitternacht – dieselbe
 * Zeitbasis wie `MonthCalendar` und die `date`-Spalten (siehe lib/calendar.ts).
 */

/**
 * So viele Monate darf `?monat=` vom aktuellen Monat abweichen, in beide
 * Richtungen. Weiter zurück liegt nach der Löschfrist nichts mehr, weiter
 * voraus wird nicht gebucht; die Grenze hält nur unsinnige Adressen fern.
 */
export const MONTH_PARAM_RANGE = 120;

const MONTH_PARAM = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Erster des Monats von `date`, UTC-Mitternacht. */
export function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** Erster des Monats `amount` Monate nach (negativ: vor) `month`. */
export function addMonths(month: Date, amount: number): Date {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + amount, 1));
}

function monthIndex(month: Date): number {
  return month.getUTCFullYear() * 12 + month.getUTCMonth();
}

/** Liegt `month` höchstens `MONTH_PARAM_RANGE` Monate vom Monat von `today` entfernt? */
export function isMonthInRange(month: Date, today: Date): boolean {
  return Math.abs(monthIndex(month) - monthIndex(startOfUtcMonth(today))) <= MONTH_PARAM_RANGE;
}

/** `JJJJ-MM` für die Adresse. */
export function formatMonthParam(month: Date): string {
  const year = String(month.getUTCFullYear()).padStart(4, "0");
  const number = String(month.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${number}`;
}

/**
 * Liest `?monat=JJJJ-MM`. `null` heißt: fehlt, mehrfach angegeben, falsch
 * geschrieben oder außerhalb von `MONTH_PARAM_RANGE`.
 */
export function parseMonthParam(
  value: string | string[] | undefined,
  today: Date,
): Date | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = MONTH_PARAM.exec(value);
  if (!match) {
    return null;
  }
  const month = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return isMonthInRange(month, today) ? month : null;
}

/** Der anzuzeigende Monat: aus `?monat=`, sonst der aktuelle (UTC). */
export function resolveMonth(value: string | string[] | undefined, today: Date): Date {
  return parseMonthParam(value, today) ?? startOfUtcMonth(today);
}

/**
 * Zeitraum, dessen Belegung der Monat braucht, halboffen wie `overlapsRange`.
 *
 * Er beginnt einen Tag vor dem Ersten: So kommen der Gast, der am Ersten
 * abreist (Abreisetag = Erster), und ein Sperrzeitraum, der am Vortag endet,
 * mit. Den ersten braucht Kalender und Liste, den zweiten der Kalender, der
 * eine Anreise am Ersten nach einem Sperr-Vortag anders einfärbt
 * (`dayOccupancy`). Er endet exklusiv am Ersten des Folgemonats: Wer dann
 * anreist, gehört nicht mehr dazu.
 */
export function monthWindow(month: Date): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 0)),
    end: addMonths(month, 1),
  };
}

/** „Oktober 2026“ */
export function formatMonthLabel(month: Date): string {
  return month.toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Adresse der Admin-Übersicht für `month`. Der aktuelle Monat braucht kein
 * `monat`, die ganze Historie (`historie=alle`) bleibt beim Blättern erhalten.
 */
export function adminOverviewHref({
  month,
  today,
  showAllHistory,
}: {
  month: Date;
  today: Date;
  showAllHistory: boolean;
}): string {
  const params = new URLSearchParams();
  if (monthIndex(month) !== monthIndex(startOfUtcMonth(today))) {
    params.set("monat", formatMonthParam(month));
  }
  if (showAllHistory) {
    params.set("historie", "alle");
  }
  const query = params.toString();
  return query === "" ? "/admin" : `/admin?${query}`;
}

/**
 * Monat und Blätter-Links für einen Kalender, dessen Monat in der Adresse
 * steht. `null` heißt: kein Link (Grenze erreicht bzw. schon der aktuelle Monat).
 */
export type MonthLinks = {
  /** Angezeigter Monat, Erster als UTC-Mitternacht. */
  month: Date;
  previousHref: string | null;
  nextHref: string | null;
  currentHref: string | null;
};

export function adminMonthLinks(
  month: Date,
  today: Date,
  showAllHistory: boolean,
): MonthLinks {
  const hrefFor = (target: Date) =>
    isMonthInRange(target, today)
      ? adminOverviewHref({ month: target, today, showAllHistory })
      : null;
  const isCurrent = monthIndex(month) === monthIndex(startOfUtcMonth(today));

  return {
    month,
    previousHref: hrefFor(addMonths(month, -1)),
    nextHref: hrefFor(addMonths(month, 1)),
    currentHref: isCurrent ? null : hrefFor(startOfUtcMonth(today)),
  };
}
