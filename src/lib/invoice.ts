import type { BookingRequest } from "@/db/schema";
import {
  CLEANING_FEE,
  EXTRAS,
  GUEST_TAX_SEASON_NAMES,
  SERVICE_FEE,
  bookingCharges,
  extrasTotal,
} from "./pricing";
import { berlinIsoDate } from "./format";

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
  /**
   * Ohne Steuernummer (seit BDS-004): Für Kleinunternehmer nicht nötig.
   * Snapshots von davor können noch ein Feld `taxNumber` tragen; es wird
   * beim Rendern nicht mehr gelesen.
   */
  seller: { name: string; address: string[] };
  recipient: { name: string; address: string[] };
  /** Leistungszeitraum, ISO "YYYY-MM-DD", Ende = Abreisetag. */
  serviceStart: string;
  serviceEnd: string;
  guests: number;
  /**
   * Davon unter 14 Jahren (seit BDS-006). Fehlt bei Snapshots von davor; dann
   * nennt der Kopf nur die Personenzahl.
   */
  guestsUnder14?: number;
  /**
   * Übernachtungen je Mietsaison, seit BDS-006 dazu der Gästebeitrag je Saison
   * des Gästebeitrags. `quantity` ist bei Übernachtungen die Zahl der Nächte,
   * beim Gästebeitrag zahlende Personen × Nächte.
   */
  lines: InvoiceLine[];
  /** Summe aller Posten: Miete, seit BDS-006 plus Gästebeitrag. */
  total: number;
  deposit: number;
  balance: number;
  /**
   * Posten, die nicht auf der Rechnung stehen, sondern bar vor Ort anfallen.
   * Snapshots von vor BDS-006 nennen hier noch den Gästebeitrag; sie werden
   * unverändert so gerendert.
   */
  cashOnSite: string[];
  /**
   * Hinweis zur Weiterleitung des Gästebeitrags (seit BDS-006), nur wenn ein
   * Gästebeitrag-Posten auf der Rechnung steht.
   */
  guestTaxNote?: string;
  bankDetails: string[] | null;
};

/** Beschreibung des Rechnungspostens Gästebeitrag, z. B. „… (Hauptsaison)“. */
export const GUEST_TAX_LINE_PREFIX = "Gästebeitrag Stadt Norden";

/** Hinweis unter dem Rechnungsbetrag, wenn ein Gästebeitrag berechnet ist. */
export const GUEST_TAX_INVOICE_NOTE =
  "Der Gästebeitrag wird nach der Satzung der Stadt Norden je Person ab 14 Jahren und Nacht erhoben und von der Vermieterin an die Stadt Norden weitergeleitet. Kinder bis einschließlich 13 Jahre zahlen keinen Gästebeitrag.";

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

/**
 * Höchstlängen der Rechnungsanschrift, gleich den Spaltenlängen in
 * `booking_request` (src/db/schema.ts). Die PLZ ist großzügig für
 * ausländische Formate („SW1A 1AA“, „1010“, „00-001“). Hier statt in
 * validation.ts, damit die Formulare sie ohne zod ins Bundle nehmen.
 */
export const ADDRESS_LIMITS = { street: 150, postalCode: 12, city: 100, country: 60 } as const;

/** Die Anschriftsspalten einer Anfrage (`booking_request`). */
export type PostalAddress = {
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
};

/** Schreibweisen für Deutschland, bei denen das Land nicht auf die Rechnung gehört. */
const HOME_COUNTRY = new Set(["deutschland", "germany", "de", "d", "brd"]);

function filled(value: string | null): string {
  return value?.trim() ?? "";
}

/** Hat die Anfrage eine Anschrift, die für eine Rechnung reicht (Straße, PLZ, Ort)? */
export function hasPostalAddress(address: PostalAddress): boolean {
  return (
    filled(address.street) !== "" && filled(address.postalCode) !== "" && filled(address.city) !== ""
  );
}

/**
 * Anschrift einer Anfrage als Zeilen für `recipientAddress`: Straße, dann
 * PLZ und Ort, dann das Land – Letzteres nur, wenn es angegeben und nicht
 * Deutschland ist. Fehlende Teile fallen weg.
 */
export function postalAddressLines(address: PostalAddress): string[] {
  const country = filled(address.country);
  return [
    filled(address.street),
    [filled(address.postalCode), filled(address.city)].filter(Boolean).join(" "),
    country !== "" && !HOME_COUNTRY.has(country.toLowerCase()) ? country : "",
  ].filter((line) => line !== "");
}

/**
 * Kennzeichen in der 400-Antwort von PATCH /api/admin/booking-request/[id],
 * wenn zum Bestätigen die Rechnungsanschrift fehlt. Der Admin öffnet dann den
 * Anschrifts-Dialog und bestätigt erneut, diesmal mit `address`.
 */
export const ADDRESS_REQUIRED_CODE = "address_required";

/**
 * Kennzeichen `warningCode` in der Antwort von PATCH
 * /api/admin/booking-request/[id] beim Bestätigen: was nach der (gespeicherten)
 * Bestätigung nicht geklappt hat. Die Oberfläche behauptet den Mailversand nur
 * ohne Warnung oder bei `invoice_failed`/`attachment_failed`/
 * `terms_attachment_failed`.
 */
export const CONFIRM_WARNING = {
  /** Keine Rechnung erstellt, Bestätigungsmail ohne Rechnung verschickt. */
  invoiceFailed: "invoice_failed",
  /** Rechnung erstellt, aber nicht angehängt; Mail ohne Anhang verschickt. */
  attachmentFailed: "attachment_failed",
  /** Rechnung erstellt, Bestätigungsmail nicht verschickt. */
  mailFailed: "mail_failed",
  /** Weder Rechnung erstellt noch Bestätigungsmail verschickt. */
  invoiceAndMailFailed: "invoice_and_mail_failed",
  /**
   * Rechnung angehängt und Mail verschickt, nur das Mietbedingungen-PDF fehlt
   * im Anhang. Scheitert außerdem die Rechnung oder ihr PDF, bleibt deren
   * Code, und die Antwort trägt zusätzlich `rentalTermsMissing: true`.
   */
  termsAttachmentFailed: "terms_attachment_failed",
} as const;

export type ConfirmWarningCode = (typeof CONFIRM_WARNING)[keyof typeof CONFIRM_WARNING];

/** Dateiname des Rechnungs-PDFs, für Download und Mailanhang. */
export function invoiceFileName(number: string): string {
  return `Rechnung-${number}.pdf`;
}

export function buildInvoiceSnapshot(input: {
  request: BookingRequest;
  number: string;
  issuedAt: Date;
  recipientName: string;
  recipientAddress: string[];
  bankDetails: string[] | null;
}): InvoiceSnapshot {
  const { request } = input;
  const charges = bookingCharges(request);

  const lines: InvoiceLine[] = [
    ...charges.breakdown.map((posten) => ({
      // Kurz genug, dass der Datumsbereich nicht mitten im Bereich umbricht;
      // das Objekt selbst steht einmal im Kopf der Rechnung.
      description: `Übernachtung ${posten.season.name} (${posten.season.label})`,
      quantity: posten.nights,
      unitPrice: posten.pricePerNight,
      total: posten.total,
    })),
    // Eigener Posten je Saison des Gästebeitrags: Menge = zahlende Personen
    // (ab 14 Jahren) × Nächte, Einzelpreis = Satz je Person und Nacht.
    ...charges.guestTaxLines.map((posten) => ({
      description: `${GUEST_TAX_LINE_PREFIX} (${GUEST_TAX_SEASON_NAMES[posten.season]})`,
      quantity: posten.persons * posten.nights,
      unitPrice: posten.rate,
      total: posten.total,
    })),
  ];

  // Bewusst nicht auf der Rechnung: Diese Posten kassiert die Vermieterin bar
  // bei der Schlüsselübergabe. Der Gästebeitrag steht seit BDS-006 oben als
  // eigener Posten.
  const cashOnSite = [
    `Endreinigung ${CLEANING_FEE},00 €`,
    `Servicegebühr ${SERVICE_FEE},00 €`,
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
    // Ausstellungszeitpunkt nach deutscher Zeit, passend zum Nummernkreis
    // (`berlinYear` in createInvoice). Die Leistungsdaten darunter sind
    // UTC-Mitternacht aus `date`-Spalten und bleiben in UTC.
    issuedAt: berlinIsoDate(input.issuedAt),
    seller: { name: SELLER.name, address: [...SELLER.address] },
    recipient: { name: input.recipientName, address: input.recipientAddress },
    serviceStart: isoDate(request.startDate),
    serviceEnd: isoDate(request.endDate),
    guests: request.guests,
    guestsUnder14: request.guestsUnder14,
    lines,
    total: charges.total,
    deposit: charges.deposit,
    balance: charges.balance,
    cashOnSite,
    ...(charges.guestTaxLines.length > 0 ? { guestTaxNote: GUEST_TAX_INVOICE_NOTE } : {}),
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
