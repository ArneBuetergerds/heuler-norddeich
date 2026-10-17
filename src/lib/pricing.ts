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

/** Gesamtpreis des Aufenthalts in Euro, ohne Nebenkosten und Gästebeitrag. */
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

/** Anteil des Mietpreises, der bei Buchung als Anzahlung fällig wird. */
export const DEPOSIT_SHARE = 0.3;

/** Der Restbetrag ist spätestens so viele Tage vor Anreise fällig. */
export const BALANCE_DUE_DAYS = 14;

/**
 * Anzahlung auf volle Cent gerundet. Der Restbetrag wird bewusst als
 * Differenz zur Summe berechnet und nicht separat gerundet – sonst ergäben
 * Anzahlung und Rest bei ungeraden Beträgen zusammen einen Cent zu viel oder
 * zu wenig.
 */
export function depositAmount(total: number): number {
  return Math.round(total * DEPOSIT_SHARE * 100) / 100;
}

export function balanceAmount(total: number): number {
  return Math.round((total - depositAmount(total)) * 100) / 100;
}

/** Einmalige Nebenkosten je Aufenthalt, bar bei der Schlüsselübergabe. */
export const CLEANING_FEE = 55;
export const SERVICE_FEE = 30;

/**
 * Gästebeitrag der Stadt Norden je Person ab 14 Jahren und Nacht. Er ist eine
 * kommunale Abgabe, wird vor Ort bar eingezogen und steht deshalb nie im
 * Gesamtpreis der Vermietung.
 */
export const GUEST_TAX = { main: 3.5, off: 1.8 } as const;

/** Hauptsaison des Gästebeitrags: 15.03. bis 31.10. (Nacht zum Folgetag). */
export function guestTaxPerNight(date: Date): number {
  const value = monthDayValue(date.getUTCMonth() + 1, date.getUTCDate());
  return value >= monthDayValue(3, 15) && value <= monthDayValue(10, 31)
    ? GUEST_TAX.main
    : GUEST_TAX.off;
}

export type StayQuote = {
  nights: number;
  breakdown: ReturnType<typeof priceBreakdown>;
  rent: number;
  cleaning: number;
  service: number;
  extras: number;
  /** Miete + Pflicht-Nebenkosten + bestellte Wäsche – ohne Gästebeitrag. */
  total: number;
  deposit: number;
  /** Gästebeitrag, falls alle Gäste 14 oder älter sind (Obergrenze). */
  guestTaxMax: number;
};

/**
 * Unverbindliche Preisvorschau für das Anfrageformular. Endreinigung und
 * Servicegebühr sind Pflicht und gehören deshalb in den angezeigten
 * Gesamtpreis (Preisangabenverordnung) – auch wenn sie vor Ort gezahlt werden.
 */
export function quoteStay(
  startDate: Date,
  endDate: Date,
  { guests, linens, towels }: { guests: number; linens: number; towels: number },
): StayQuote {
  const naechte = nightlyPrices(startDate, endDate);
  const rent = naechte.reduce((summe, nacht) => summe + nacht.price, 0);
  const extras = extrasTotal({ linens, towels });
  const guestTaxMax =
    Math.round(naechte.reduce((summe, nacht) => summe + guestTaxPerNight(nacht.date), 0) * guests * 100) / 100;

  return {
    nights: naechte.length,
    breakdown: priceBreakdown(startDate, endDate),
    rent,
    cleaning: CLEANING_FEE,
    service: SERVICE_FEE,
    extras,
    total: rent + CLEANING_FEE + SERVICE_FEE + extras,
    deposit: depositAmount(rent),
    guestTaxMax,
  };
}
