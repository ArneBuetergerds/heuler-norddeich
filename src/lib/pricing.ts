export type Season = {
  /** Sprechender Name für die Preistabelle, z. B. "Hauptsaison". */
  name: string;
  /** Zeitraum als Text, zugleich der eindeutige Schlüssel einer Saison. */
  label: string;
  startMonthDay: readonly [month: number, day: number];
  endMonthDay: readonly [month: number, day: number];
  pricePerNight: number;
  minNights: number;
};

// Quelle: Preistabelle der alten Website. Zwei Lücken dort (31.08. und
// 06.–08.01., je ein Tag zwischen zwei Saisons ohne eigenen Eintrag) werden
// hier der jeweiligen Nachbarsaison zugeschlagen, damit jedes Kalenderdatum
// eindeutig einer Saison zugeordnet werden kann.
export const SEASONS: readonly Season[] = [
  { name: "Nebensaison", label: "09.01. – 31.03.", startMonthDay: [1, 9], endMonthDay: [3, 31], pricePerNight: 54, minNights: 3 },
  { name: "Zwischensaison", label: "01.04. – 30.06.", startMonthDay: [4, 1], endMonthDay: [6, 30], pricePerNight: 74, minNights: 4 },
  { name: "Hauptsaison", label: "01.07. – 31.08.", startMonthDay: [7, 1], endMonthDay: [8, 31], pricePerNight: 94, minNights: 7 },
  { name: "Zwischensaison", label: "01.09. – 04.11.", startMonthDay: [9, 1], endMonthDay: [11, 4], pricePerNight: 74, minNights: 3 },
  { name: "Nebensaison", label: "05.11. – 22.12.", startMonthDay: [11, 5], endMonthDay: [12, 22], pricePerNight: 54, minNights: 3 },
  { name: "Weihnachten & Neujahr", label: "23.12. – 08.01.", startMonthDay: [12, 23], endMonthDay: [1, 8], pricePerNight: 74, minNights: 3 },
];

function monthDayValue(month: number, day: number): number {
  return month * 100 + day;
}

/**
 * Saison eines Datums, jahresunabhängig anhand von Monat/Tag ermittelt (die
 * Saisons wiederholen sich jedes Jahr identisch). Die Wintersaison läuft
 * über den Jahreswechsel – dort liegt `startMonthDay` zahlenmäßig hinter
 * `endMonthDay`, weshalb der Vergleich zwei Fälle unterscheidet.
 */
export function seasonForDate(date: Date): Season {
  const value = monthDayValue(date.getUTCMonth() + 1, date.getUTCDate());

  const season = SEASONS.find(({ startMonthDay: [sm, sd], endMonthDay: [em, ed] }) => {
    const start = monthDayValue(sm, sd);
    const end = monthDayValue(em, ed);
    return start <= end ? value >= start && value <= end : value >= start || value <= end;
  });

  if (!season) {
    throw new Error(`Keine Saison für Datum gefunden: ${date.toISOString()}`);
  }
  return season;
}

export function nightsBetween(startDate: Date, endDate: Date): number {
  const msPerNight = 1000 * 60 * 60 * 24;
  return Math.round((endDate.getTime() - startDate.getTime()) / msPerNight);
}

/**
 * Prüft den Mindestaufenthalt der Anreisesaison und liefert die Meldung für
 * den Gast – oder `null`, wenn alles passt.
 *
 * Bewusst an einer Stelle formuliert: Das Formular blockiert damit schon vor
 * dem Absenden, die serverseitige Validierung lehnt mit demselben Wortlaut ab.
 * Maßgeblich ist die Saison des Anreisetags, auch wenn der Aufenthalt in eine
 * andere hineinreicht.
 */
export function minNightsMessage(startDate: Date, endDate: Date): string | null {
  const season = seasonForDate(startDate);
  const nights = nightsBetween(startDate, endDate);

  if (nights >= season.minNights) {
    return null;
  }
  return `Für Anreisen in diesem Zeitraum (${season.label}) sind mindestens ${season.minNights} Nächte erforderlich`;
}

/** Die Wohnung ist für bis zu vier Gäste eingerichtet. */
export const MAX_GUESTS = 4;

/**
 * Zusatzleistungen, die der Gast bei der Anfrage mitbestellen kann. Abgerechnet
 * wird je Satz und Aufenthalt, bar vor Ort – nicht pro Nacht und nicht pro
 * Woche.
 */
export const EXTRAS = {
  linens: { label: "Bettwäsche", pricePerSet: 10 },
  towels: { label: "Handtücher", pricePerSet: 5 },
} as const;

export type ExtraKey = keyof typeof EXTRAS;

/** Vorlauf, den die Wäsche braucht: eine Woche vor Anreise. */
export const EXTRAS_LEAD_DAYS = 7;

/**
 * Wäsche muss eine Woche vorher angemeldet sein. Gemessen wird ab der
 * **Anreise**, nicht ab dem Zeitpunkt der Anfrage – eine im Januar gestellte
 * Anfrage für Juli ist unkritisch, eine übermorgen beginnende dagegen zu spät.
 */
export function extrasBookable(startDate: Date, today: Date): boolean {
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysAhead = Math.round((startDate.getTime() - today.getTime()) / msPerDay);
  return daysAhead >= EXTRAS_LEAD_DAYS;
}

/** Summe der Zusatzleistungen in Euro. */
export function extrasTotal(extras: { linens: number; towels: number }): number {
  return (
    extras.linens * EXTRAS.linens.pricePerSet +
    extras.towels * EXTRAS.towels.pricePerSet
  );
}

export type NightPrice = {
  /** Die Nacht, die auf diesen Tag folgt. */
  date: Date;
  season: Season;
  price: number;
};

/**
 * Bepreist jede Nacht einzeln.
 *
 * `seasonForDate` allein reicht dafür nicht: Es liefert die Saison *eines*
 * Tages, und die bisherige Anzeige wandte es nur auf den Anreisetag an. Eine
 * Woche über den 31.08. hinweg wäre damit komplett zum Hochsommerpreis
 * berechnet worden, obwohl die letzten Nächte schon in die günstigere Saison
 * fallen.
 *
 * Gezählt werden die Nächte, nicht die Tage: Der Abreisetag zählt nicht mit,
 * die Nacht vom Vortag auf den Abreisetag dagegen schon.
 */
export function nightlyPrices(startDate: Date, endDate: Date): NightPrice[] {
  const naechte: NightPrice[] = [];

  for (
    let tag = new Date(startDate.getTime());
    tag < endDate;
    tag = new Date(
      Date.UTC(tag.getUTCFullYear(), tag.getUTCMonth(), tag.getUTCDate() + 1),
    )
  ) {
    const season = seasonForDate(tag);
    naechte.push({ date: new Date(tag.getTime()), season, price: season.pricePerNight });
  }

  return naechte;
}

/** Gesamtpreis des Aufenthalts in Euro, ohne Nebenkosten und Kurtaxe. */
export function stayTotal(startDate: Date, endDate: Date): number {
  return nightlyPrices(startDate, endDate).reduce((summe, nacht) => summe + nacht.price, 0);
}

/**
 * Fasst gleich bepreiste Nächte zu Rechnungsposten zusammen – ein Aufenthalt
 * über einen Saisonwechsel ergibt so zwei Zeilen statt vierzehn.
 */
export function priceBreakdown(
  startDate: Date,
  endDate: Date,
): { season: Season; nights: number; pricePerNight: number; total: number }[] {
  const posten: { season: Season; nights: number; pricePerNight: number; total: number }[] = [];

  for (const nacht of nightlyPrices(startDate, endDate)) {
    const letzter = posten.at(-1);
    if (letzter && letzter.season.label === nacht.season.label) {
      letzter.nights += 1;
      letzter.total += nacht.price;
      continue;
    }
    posten.push({
      season: nacht.season,
      nights: 1,
      pricePerNight: nacht.price,
      total: nacht.price,
    });
  }

  return posten;
}

/**
 * Anteil von Mietpreis plus Kurtaxe, der bei Buchung als Anzahlung fällig
 * wird (BDS-006: die Kurtaxe steht seitdem auf der Rechnung und zählt
 * mit, siehe `paymentSplit`).
 */
export const DEPOSIT_SHARE = 0.3;

/** Der Restbetrag ist spätestens so viele Tage vor Anreise fällig. */
export const BALANCE_DUE_DAYS = 14;

/** Auf volle Cent runden. */
function cents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Anzahlung auf volle Cent gerundet. Der Restbetrag wird bewusst als
 * Differenz zur Summe berechnet und nicht separat gerundet – sonst ergäben
 * Anzahlung und Rest bei ungeraden Beträgen zusammen einen Cent zu viel oder
 * zu wenig.
 */
export function depositAmount(total: number): number {
  return cents(total * DEPOSIT_SHARE);
}

export function balanceAmount(total: number): number {
  return cents(total - depositAmount(total));
}

/** Einmalige Nebenkosten je Aufenthalt, bar bei der Schlüsselübergabe. */
export const CLEANING_FEE = 55;
export const SERVICE_FEE = 30;

/**
 * Kurtaxe der Stadt Norden je Person ab 14 Jahren und Nacht (in der Satzung
 * „Gästebeitrag“). Sie ist eine kommunale Abgabe: Seit BDS-006 steht sie als
 * eigener Posten auf der Rechnung, zählt zur Anzahlung (`paymentSplit`) und
 * wird von der Vermieterin an die Stadt weitergeleitet – nicht mehr bar vor
 * Ort. Kinder bis einschließlich 13 Jahre zahlen keine Kurtaxe
 * (`booking_request.guests_under_14`).
 */
export const GUEST_TAX = { main: 3.5, off: 1.8 } as const;

export type GuestTaxSeason = keyof typeof GUEST_TAX;

/** Saisonnamen der Kurtaxe, z. B. für den Rechnungsposten. */
export const GUEST_TAX_SEASON_NAMES: Record<GuestTaxSeason, string> = {
  main: "Hauptsaison",
  off: "Nebensaison",
};

/** Zeiträume der Kurtaxe als Text, passend zu `guestTaxSeason`. */
export const GUEST_TAX_SEASON_LABELS: Record<GuestTaxSeason, string> = {
  main: "15.03. – 31.10.",
  off: "01.11. – 14.03.",
};

/** Hauptsaison der Kurtaxe: 15.03. bis 31.10. (Nacht zum Folgetag). */
export function guestTaxSeason(date: Date): GuestTaxSeason {
  const value = monthDayValue(date.getUTCMonth() + 1, date.getUTCDate());
  return value >= monthDayValue(3, 15) && value <= monthDayValue(10, 31) ? "main" : "off";
}

export function guestTaxPerNight(date: Date): number {
  return GUEST_TAX[guestTaxSeason(date)];
}

/**
 * Personenangaben einer Buchung. `guestsUnder14` fehlt bei Daten von vor
 * BDS-006 und zählt dann als 0 (alle Gäste zahlen).
 */
export type GuestCount = { guests: number; guestsUnder14?: number | null };

/** Personen, die Kurtaxe zahlen: alle ab 14 Jahren. */
export function payingGuests({ guests, guestsUnder14 }: GuestCount): number {
  return Math.max(0, guests - (guestsUnder14 ?? 0));
}

export type GuestTaxLine = {
  season: GuestTaxSeason;
  /** Nächte in dieser Saison der Kurtaxe. */
  nights: number;
  /** Zahlende Personen (ab 14 Jahren). */
  persons: number;
  /** Satz je Person und Nacht. */
  rate: number;
  /** persons × nights × rate, auf Cent gerundet. */
  total: number;
};

/**
 * Kurtaxe eines Aufenthalts, je Saison der Kurtaxe ein Posten
 * (Haupt- und Nebensaison, nicht die Mietsaisons). Jede Nacht kostet den Satz
 * des Tages, auf den sie folgt – wie beim Mietpreis zählt der Abreisetag
 * nicht. Ohne zahlende Personen gibt es keine Posten.
 */
export function guestTaxBreakdown(
  startDate: Date,
  endDate: Date,
  count: GuestCount,
): GuestTaxLine[] {
  const persons = payingGuests(count);
  if (persons === 0) {
    return [];
  }

  const posten: GuestTaxLine[] = [];
  for (const nacht of nightlyPrices(startDate, endDate)) {
    const season = guestTaxSeason(nacht.date);
    const eintrag = posten.find((p) => p.season === season);
    if (eintrag) {
      eintrag.nights += 1;
    } else {
      posten.push({ season, nights: 1, persons, rate: GUEST_TAX[season], total: 0 });
    }
  }
  for (const eintrag of posten) {
    eintrag.total = cents(eintrag.persons * eintrag.nights * eintrag.rate);
  }
  return posten;
}

/** Kurtaxe eines Aufenthalts in Euro, auf Cent gerundet. */
export function guestTaxTotal(startDate: Date, endDate: Date, count: GuestCount): number {
  return cents(
    guestTaxBreakdown(startDate, endDate, count).reduce((summe, p) => summe + p.total, 0),
  );
}

/**
 * Rechnungsbetrag, Anzahlung und Rest aus Mietpreis und Kurtaxe – die
 * einzige Stelle dafür (Rechnung, Mails, Preisvorschau). Endreinigung,
 * Servicegebühr und Wäsche zählen nicht mit, sie werden bar vor Ort bezahlt.
 */
export function paymentSplit(
  rent: number,
  guestTax: number,
): { total: number; deposit: number; balance: number } {
  const total = cents(rent + guestTax);
  return { total, deposit: depositAmount(total), balance: balanceAmount(total) };
}

/**
 * Was eine Buchung über die Rechnung kostet: Mietpreis je Saison, Kurtaxe
 * je Saison der Kurtaxe und die Zahlungsaufteilung. Rechnung, Mails,
 * Admin und Preisvorschau rechnen alle hiermit.
 */
export function bookingCharges(
  stay: { startDate: Date; endDate: Date } & GuestCount,
): {
  breakdown: ReturnType<typeof priceBreakdown>;
  rent: number;
  guestTaxLines: GuestTaxLine[];
  guestTax: number;
  total: number;
  deposit: number;
  balance: number;
} {
  const breakdown = priceBreakdown(stay.startDate, stay.endDate);
  const rent = breakdown.reduce((summe, p) => summe + p.total, 0);
  const guestTaxLines = guestTaxBreakdown(stay.startDate, stay.endDate, stay);
  const guestTax = cents(guestTaxLines.reduce((summe, p) => summe + p.total, 0));
  return { breakdown, rent, guestTaxLines, guestTax, ...paymentSplit(rent, guestTax) };
}

export type StayQuote = {
  nights: number;
  breakdown: ReturnType<typeof priceBreakdown>;
  rent: number;
  /** Kurtaxe je Saison, für die zahlenden Personen (ab 14 Jahren). */
  guestTaxLines: GuestTaxLine[];
  guestTax: number;
  cleaning: number;
  service: number;
  extras: number;
  /** Miete + Kurtaxe + Pflicht-Nebenkosten + bestellte Wäsche. */
  total: number;
  /** Anzahlung auf Miete + Kurtaxe (`paymentSplit`). */
  deposit: number;
};

/**
 * Unverbindliche Preisvorschau für das Anfrageformular. Endreinigung und
 * Servicegebühr sind Pflicht und gehören deshalb in den angezeigten
 * Gesamtpreis (Preisangabenverordnung) – auch wenn sie vor Ort gezahlt werden.
 * Die Kurtaxe ist mit der Personenzahl ab 14 Jahren genau bekannt und
 * steht seit BDS-006 auf der Rechnung, sie zählt deshalb ebenfalls mit.
 */
export function quoteStay(
  startDate: Date,
  endDate: Date,
  {
    guests,
    guestsUnder14 = 0,
    linens,
    towels,
  }: { guests: number; guestsUnder14?: number; linens: number; towels: number },
): StayQuote {
  const charges = bookingCharges({ startDate, endDate, guests, guestsUnder14 });
  const extras = extrasTotal({ linens, towels });

  return {
    nights: charges.breakdown.reduce((summe, p) => summe + p.nights, 0),
    breakdown: charges.breakdown,
    rent: charges.rent,
    guestTaxLines: charges.guestTaxLines,
    guestTax: charges.guestTax,
    cleaning: CLEANING_FEE,
    service: SERVICE_FEE,
    extras,
    total: cents(charges.total + CLEANING_FEE + SERVICE_FEE + extras),
    deposit: charges.deposit,
  };
}
