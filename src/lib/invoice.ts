import type { BookingRequest } from "@/db/schema";
import {
  CLEANING_FEE,
  EXTRAS,
  SERVICE_FEE,
  balanceAmount,
  depositAmount,
  extrasTotal,
  priceBreakdown,
  stayTotal,
} from "./pricing";

/**
 * Rechnungsnummern der Form RE-2026-0001: Jahr plus laufende Nummer, die mit
 * jedem Jahr neu bei 1 beginnt. Das ist zulässig, solange die Nummer
 * einmalig ist – das Jahr im Präfix macht sie das auch über den
 * Jahreswechsel hinweg.
 */
export const INVOICE_PREFIX = "RE";

export function formatInvoiceNumber(year: number, sequence: number): string {
  return `${INVOICE_PREFIX}-${year}-${String(sequence).padStart(4, "0")}`;
}

/** Was vermietet wird und wo – der Leistungsort gehört auf die Rechnung. */
export const PROPERTY = "Ferienwohnung Heuler, Ankerweg 6, 26506 Norden-Norddeich";

/** Die Vermieterin als leistende Unternehmerin, so wie im Impressum. */
export const SELLER = {
  name: "Sabrina Rönne",
  address: ["Am Tannenkamp 1", "48465 Schüttorf"],
} as const;

export type InvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

/**
 * Alles, was auf der Rechnung steht, eingefroren zum Zeitpunkt der
 * Ausstellung.
 *
 * Eine Rechnung ist ein unveränderliches Dokument. Würde das PDF bei jedem
 * Abruf aus den aktuellen Preisen neu berechnet, zeigte eine Rechnung aus
 * diesem Jahr nach der nächsten Preisanpassung plötzlich andere Beträge.
 * Deshalb wird der komplette Inhalt einmal festgehalten und das PDF immer
 * nur daraus erzeugt.
 */
export type InvoiceSnapshot = {
  number: string;
  /** Ausstellungsdatum, ISO "YYYY-MM-DD". */
  issuedAt: string;
  seller: { name: string; address: string[]; taxNumber: string };
  recipient: { name: string; address: string[] };
  /** Leistungszeitraum, ISO "YYYY-MM-DD", Ende = Abreisetag. */
  serviceStart: string;
  serviceEnd: string;
  guests: number;
  lines: InvoiceLine[];
  total: number;
  deposit: number;
  balance: number;
  /** Posten, die nicht auf der Rechnung stehen, sondern bar vor Ort anfallen. */
  cashOnSite: string[];
  bankDetails: string[] | null;
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Anschrift aus einem mehrzeiligen Eingabefeld. Leerzeilen fallen weg, damit
 * ein versehentlicher Zeilenumbruch am Ende nicht als leere Zeile auf der
 * Rechnung landet.
 */
export function parseAddress(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function buildInvoiceSnapshot(input: {
  request: BookingRequest;
  number: string;
  issuedAt: Date;
  recipientName: string;
  recipientAddress: string[];
  taxNumber: string;
  bankDetails: string[] | null;
}): InvoiceSnapshot {
  const { request } = input;
  const total = stayTotal(request.startDate, request.endDate);

  const lines: InvoiceLine[] = priceBreakdown(request.startDate, request.endDate).map(
    (posten) => ({
      // Kurz genug, dass der Datumsbereich nicht mitten im Bereich umbricht;
      // das Objekt selbst steht einmal im Kopf der Rechnung.
      description: `Übernachtung ${posten.season.name} (${posten.season.label})`,
      quantity: posten.nights,
      unitPrice: posten.pricePerNight,
      total: posten.total,
    }),
  );

  // Bewusst nicht auf der Rechnung: Diese Posten kassiert die Vermieterin bar
  // bei der Schlüsselübergabe. Der Gästebeitrag ist zudem keine eigene
  // Leistung, sondern wird für die Stadt eingezogen.
  const cashOnSite = [
    `Endreinigung ${CLEANING_FEE},00 €`,
    `Servicegebühr ${SERVICE_FEE},00 €`,
    "Gästebeitrag nach Satzung der Stadt Norden (3,50 € bzw. 1,80 € je Person ab 14 Jahren und Nacht)",
  ];
  if (extrasTotal(request) > 0) {
    const waesche = (["linens", "towels"] as const)
      .filter((key) => request[key] > 0)
      .map((key) => `${EXTRAS[key].label} ${request[key]} × ${EXTRAS[key].pricePerSet},00 €`)
      .join(", ");
    cashOnSite.push(waesche);
  }

  return {
    number: input.number,
    issuedAt: isoDate(input.issuedAt),
    seller: { ...SELLER, address: [...SELLER.address], taxNumber: input.taxNumber },
    recipient: { name: input.recipientName, address: input.recipientAddress },
    serviceStart: isoDate(request.startDate),
    serviceEnd: isoDate(request.endDate),
    guests: request.guests,
    lines,
    total,
    deposit: depositAmount(total),
    balance: balanceAmount(total),
    cashOnSite,
    bankDetails: input.bankDetails,
  };
}

/**
 * Pflichthinweis nach § 19 UStG. Seit 2025 ist der Umsatz von
 * Kleinunternehmern steuerbefreit; ohne diesen Hinweis wäre die Rechnung
 * unvollständig.
 */
export const SMALL_BUSINESS_NOTE =
  "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).";
