import {
  GUEST_TAX_SEASON_NAMES,
  paymentSplit,
  type GuestTaxLine,
  type StayQuote,
} from "./pricing";

/**
 * Aufbereitung von Preis- und Personenangaben für die Oberfläche
 * (Preisvorschau, Formulare, Admin). Rechnet nichts neu: Beträge kommen aus
 * `quoteStay` bzw. `paymentSplit` in `pricing.ts`, hier werden sie nur nach
 * Zahlungsweg gruppiert und beschriftet.
 */

/** Was überwiesen und was bar vor Ort bezahlt wird. */
export type PaymentOverview = {
  /** Rechnung: Mietpreis und Kurtaxe, in Anzahlung und Rest geteilt. */
  transfer: { total: number; deposit: number; balance: number };
  /** Bar bei der Schlüsselübergabe: Endreinigung, Servicegebühr, Wäsche. */
  onSite: { lines: { label: string; amount: number }[]; total: number };
};

/**
 * Teilt eine Preisvorschau nach Zahlungsweg auf. Beide Summen ergeben
 * zusammen `quote.total`. Wäsche erscheint nur, wenn sie bestellt ist.
 */
export function paymentOverview(quote: StayQuote): PaymentOverview {
  const lines = [
    { label: "Endreinigung", amount: quote.cleaning },
    { label: "Servicegebühr", amount: quote.service },
    ...(quote.extras > 0 ? [{ label: "Bettwäsche & Handtücher", amount: quote.extras }] : []),
  ];
  return {
    transfer: paymentSplit(quote.rent, quote.guestTax),
    onSite: {
      lines,
      total: Math.round(lines.reduce((summe, l) => summe + l.amount, 0) * 100) / 100,
    },
  };
}

function plural(anzahl: number, einzahl: string, mehrzahl: string): string {
  return `${anzahl} ${anzahl === 1 ? einzahl : mehrzahl}`;
}

/**
 * Beschriftung eines Kurtaxe-Postens unter der Überschrift
 * „Kurtaxe“, z. B. „4 Nächte × 2 Personen ab 14 (Hauptsaison)“.
 */
export function guestTaxLineLabel(line: GuestTaxLine): string {
  return `${plural(line.nights, "Nacht", "Nächte")} × ${plural(line.persons, "Person", "Personen")} ab 14 (${GUEST_TAX_SEASON_NAMES[line.season]})`;
}

/** Zusatz zur Personenzahl, z. B. „davon 2 unter 14“; ohne Kinder `null`. */
export function guestsUnder14Note(guestsUnder14: number | null | undefined): string | null {
  return guestsUnder14 && guestsUnder14 > 0 ? `davon ${guestsUnder14} unter 14` : null;
}

/**
 * Das Feld „davon unter 14 Jahre“ ist erst ab zwei Personen bedienbar:
 * Mindestens eine Person ist 14 oder älter (wie Server und Datenbank).
 */
export function under14Selectable(guests: number): boolean {
  return guests > 1;
}

/** Hinweis unter dem Feld „davon unter 14 Jahre“, passend zum Zustand. */
export function under14Hint(guests: number): string {
  return under14Selectable(guests)
    ? "Kinder bis 13 Jahre zahlen keine Kurtaxe."
    : "Bei einer Person entfällt die Angabe: Mindestens eine Person muss 14 Jahre oder älter sein.";
}

/**
 * Wie der Admin-Dialog Mietpreis und Kurtaxe einer Buchung zeigt.
 *
 * Hat die Buchung eine Rechnung, ist deren Inhalt maßgeblich: Rechnungen von
 * vor BDS-006 enthalten nur die Miete und führen den Gästebeitrag (damalige
 * Bezeichnung der Kurtaxe) als Barposten bei der Schlüsselübergabe. Für sie
 * bleibt die Kurtaxe bar vor Ort – sonst vergäße die Betreiberin sie. Ohne
 * Rechnung oder mit neuer Rechnung steht sie auf der Rechnung.
 */
export type StayChargesView = {
  /** Kurtaxe-Posten im Rechnungsblock (leer bei alter Rechnung). */
  invoiceGuestTaxLines: GuestTaxLine[];
  /** Betrag, der überwiesen wird: Miete, ggf. plus Kurtaxe. */
  invoiceTotal: number;
  /** Kurtaxe bar vor Ort, nur bei Rechnung von vor der Umstellung. */
  guestTaxOnSite: { amount: number; invoiceNumber: string } | null;
  /** Rechnung vor der Umstellung (BDS-006) ausgestellt, ohne Kurtaxe. */
  invoiceBeforeSwitch: boolean;
};

export function stayChargesView(
  charges: { rent: number; guestTax: number; guestTaxLines: GuestTaxLine[]; total: number },
  invoice: { number: string; includesGuestTax: boolean } | undefined,
): StayChargesView {
  if (invoice && !invoice.includesGuestTax) {
    return {
      invoiceGuestTaxLines: [],
      invoiceTotal: charges.rent,
      guestTaxOnSite:
        charges.guestTax > 0 ? { amount: charges.guestTax, invoiceNumber: invoice.number } : null,
      invoiceBeforeSwitch: true,
    };
  }
  return {
    invoiceGuestTaxLines: charges.guestTaxLines,
    invoiceTotal: charges.total,
    guestTaxOnSite: null,
    invoiceBeforeSwitch: false,
  };
}
