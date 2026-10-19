import nodemailer from "nodemailer";
import type { BookingRequest } from "@/db/schema";
import {
  BALANCE_DUE_DAYS,
  CLEANING_FEE,
  DEPOSIT_SHARE,
  GUEST_TAX_SEASON_NAMES,
  SERVICE_FEE,
  EXTRAS,
  bookingCharges,
  extrasTotal,
} from "./pricing";
import { formatDate, formatEuro } from "./format";
import {
  CHECK_IN_TIME,
  CHECK_OUT_TIME,
  DEPOSIT_DUE_DAYS,
  PARKING,
  RESPONSE_HOURS,
  cancellationLines,
} from "./terms";
import { invoiceFileName } from "./invoice";
import { SITE_URL } from "./site";
import { RENTAL_TERMS_FILE_NAME, RENTAL_TERMS_PATH } from "./rentalTerms";

const FROM = "Ferienwohnung Heuler <noreply@norddeich-heuler.de>";

// Versendet wird über den noreply-Alias, Antworten sollen aber im gelesenen
// Postfach landen. Ohne explizites Reply-To zeigt der Mailclient des Gasts
// "noreply@" als Antwortziel - auf so einen Absender antwortet kaum jemand,
// obwohl die Gast-Mails ausdrücklich dazu auffordern.
const REPLY_TO = "kontakt@norddeich-heuler.de";

const transporter = nodemailer.createTransport({
  pool: true,
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * "bis" statt Gedankenstrich: In einem Fließtext liest sich das besser als die
 * Bereichsschreibweise der Oberfläche. Das Datumsformat selbst kommt aus
 * `lib/format`, damit Mail und Admin dieselbe Schreibweise zeigen – und damit
 * die dort dokumentierte Zeitzonenangabe nicht verloren geht.
 */
function formatRange(request: Pick<BookingRequest, "startDate" | "endDate">): string {
  return `${formatDate(request.startDate)} bis ${formatDate(request.endDate)}`;
}

/**
 * Bestellte Wäsche als Textzeilen. Leer, wenn nichts bestellt wurde – dann
 * soll in der Mail auch keine Überschrift dazu stehen.
 */
function extrasLines(request: BookingRequest): string[] {
  const posten = (["linens", "towels"] as const)
    .filter((key) => request[key] > 0)
    .map(
      (key) =>
        `  ${EXTRAS[key].label}: ${request[key]} × ${EXTRAS[key].pricePerSet} €`,
    );

  if (posten.length === 0) {
    return [];
  }
  return [
    "Zusätzlich bestellt (bar vor Ort):",
    ...posten,
    `  Summe: ${extrasTotal(request)} €`,
  ];
}

/**
 * Personenzahl mit Kindern unter 14 Jahren, z. B. „4 Personen, davon 2 unter
 * 14 Jahren“. Ohne Kinder nur die Personenzahl.
 */
function guestsText(request: Pick<BookingRequest, "guests" | "guestsUnder14">): string {
  const anzahl = `${request.guests} ${request.guests === 1 ? "Person" : "Personen"}`;
  return request.guestsUnder14 > 0 ? `${anzahl}, davon ${request.guestsUnder14} unter 14 Jahren` : anzahl;
}

/**
 * Mietpreis und Kurtaxe als Textblock, nach Saison aufgeschlüsselt. Ein
 * Aufenthalt über einen Saisonwechsel hinweg ergibt zwei Zeilen – mit nur
 * einer wäre der Betrag für den Gast nicht nachvollziehbar. Beides steht so
 * auch auf der Rechnung (`bookingCharges`, wie `buildInvoiceSnapshot`).
 */
function priceLines(request: BookingRequest): string[] {
  const charges = bookingCharges(request);

  const miete = charges.breakdown.map(
    (p) =>
      `  ${p.nights} ${p.nights === 1 ? "Nacht" : "Nächte"} × ${p.pricePerNight} € (${p.season.name}): ${formatEuro(p.total)}`,
  );
  const zeilen = ["Mietpreis:", ...miete, `  Summe Mietpreis: ${formatEuro(charges.rent)}`];

  if (charges.guestTaxLines.length > 0) {
    const personen = charges.guestTaxLines[0]!.persons;
    zeilen.push(
      `Kurtaxe der Stadt Norden (${personen} ${personen === 1 ? "Person" : "Personen"} ab 14 Jahren):`,
      ...charges.guestTaxLines.map(
        (p) =>
          `  ${p.nights} ${p.nights === 1 ? "Nacht" : "Nächte"} × ${formatEuro(p.rate)} × ${p.persons} (${GUEST_TAX_SEASON_NAMES[p.season]}): ${formatEuro(p.total)}`,
      ),
      `  Summe Kurtaxe: ${formatEuro(charges.guestTax)}`,
      `Gesamt Mietpreis und Kurtaxe: ${formatEuro(charges.total)}`,
    );
  }

  return zeilen;
}

/**
 * Anzahlung, Restbetrag und – falls hinterlegt – die Bankverbindung. Beide
 * Beträge auf Mietpreis plus Kurtaxe, wie auf der Rechnung.
 */
function paymentLines(request: BookingRequest): string[] {
  const { deposit: anzahlung, balance: rest } = bookingCharges(request);
  // Nicht erfunden, sondern konfiguriert: Ohne hinterlegte Bankverbindung
  // nennt die Mail die Beträge und kündigt die Kontodaten an, statt eine
  // falsche IBAN zu behaupten.
  const bank = process.env.BANK_TRANSFER_DETAILS?.trim();

  return [
    "Zahlung (Mietpreis und Kurtaxe):",
    `  Anzahlung ${Math.round(DEPOSIT_SHARE * 100)} %: ${formatEuro(anzahlung)} – bitte innerhalb von ${DEPOSIT_DUE_DAYS} Tagen überweisen`,
    `  Restbetrag: ${formatEuro(rest)} – spätestens ${BALANCE_DUE_DAYS} Tage vor Anreise`,
    "",
    ...(bank
      ? ["Bankverbindung:", ...bank.split("\n").map((zeile) => `  ${zeile}`)]
      : ["Die Bankverbindung für die Anzahlung senden wir Ihnen gesondert zu."]),
  ];
}

/** Dateianhang, wie ihn nodemailer erwartet. */
export type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

export type Mail = {
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  attachments?: MailAttachment[];
};

/** Die Rechnung, die mit der Bestätigung an den Gast geht. */
export type InvoiceForMail = {
  number: string;
  pdf: Uint8Array;
};

/** Rechnungs-PDF als Mailanhang, Dateiname wie beim Download im Admin. */
export function invoiceAttachment(invoice: InvoiceForMail): MailAttachment {
  return {
    filename: invoiceFileName(invoice.number),
    content: Buffer.from(invoice.pdf),
    contentType: "application/pdf",
  };
}

/** Mietbedingungen-PDF als Mailanhang, Dateiname wie beim Download der Website. */
export function rentalTermsAttachment(pdf: Uint8Array): MailAttachment {
  return {
    filename: RENTAL_TERMS_FILE_NAME,
    content: Buffer.from(pdf),
    contentType: "application/pdf",
  };
}

/**
 * Was die Bestätigung über ihre Anhänge sagt. Fehlt ein PDF, nennt der Text
 * den Ersatz: die Rechnung kommt gesondert, die Mietbedingungen stehen
 * unter dem Link.
 */
function attachmentLines(invoice: InvoiceForMail | undefined, rentalTerms: boolean): string[] {
  const link = `${SITE_URL}${RENTAL_TERMS_PATH}`;
  const zeilen: string[] = [];
  if (invoice && rentalTerms) {
    zeilen.push(
      `Im Anhang dieser E-Mail finden Sie die Rechnung ${invoice.number} und unsere`,
      `Mietbedingungen (${RENTAL_TERMS_FILE_NAME}).`,
    );
  } else if (invoice) {
    zeilen.push(`Die Rechnung ${invoice.number} finden Sie im Anhang dieser E-Mail.`);
  } else {
    zeilen.push("Die Rechnung senden wir Ihnen gesondert zu.");
    if (rentalTerms) {
      zeilen.push(`Unsere Mietbedingungen (${RENTAL_TERMS_FILE_NAME}) finden Sie im Anhang.`);
    }
  }
  zeilen.push(
    `Die Mietbedingungen stehen auch unter ${link}`,
    "Ein Widerrufsrecht besteht für die Buchung nicht; es gelten die Stornobedingungen.",
  );
  return zeilen;
}

/** Absender und Antwortziel, wie sie beim Versand gesetzt werden. */
export const MAIL_ABSENDER = { from: FROM, replyTo: REPLY_TO } as const;

/**
 * Versendet eine fertige Mail über den konfigurierten SMTP-Zugang. Exportiert
 * für `scripts/send-test-mails.ts`, das die echten Texte an eine Testadresse
 * schickt; im Betrieb laufen alle Mails über die `send…`-Funktionen unten.
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error("SMTP-Zugangsdaten sind nicht konfiguriert");
  }

  await transporter.sendMail({ from: FROM, ...mail });
}

/** Schließt die SMTP-Verbindungen, damit ein Skript danach endet. */
export function closeMailTransport(): void {
  transporter.close();
}

/**
 * Alle Texte entstehen in reinen `build`-Funktionen, getrennt vom Versand.
 * Dadurch lassen sie sich ohne SMTP rendern – siehe
 * `scripts/preview-mails.ts`, das sie zur Abstimmung ausgibt.
 */
export function buildBookingRequestNotification(
  request: BookingRequest,
  ownerEmail: string,
): Mail {
  return {
    to: ownerEmail,
    replyTo: request.email,
    subject: `Neue Buchungsanfrage von ${request.name}`,
    text: [
      `Name: ${request.name}`,
      `E-Mail: ${request.email}`,
      `Telefon: ${request.phone ?? "-"}`,
      `Zeitraum: ${formatRange(request)}`,
      `Personen: ${request.guests}`,
      `Davon unter 14 Jahren: ${request.guestsUnder14}`,
      ...extrasLines(request),
      `Nachricht: ${request.message ?? "-"}`,
      "",
      ...priceLines(request),
    ].join("\n"),
  };
}

/** Benachrichtigt den Betreiber über eine neu eingegangene Anfrage. */
export async function sendBookingRequestNotification(
  request: BookingRequest,
): Promise<void> {
  const ownerEmail = process.env.OWNER_NOTIFICATION_EMAIL;
  if (!ownerEmail) {
    throw new Error("OWNER_NOTIFICATION_EMAIL ist nicht konfiguriert");
  }

  await sendMail(buildBookingRequestNotification(request, ownerEmail));
}

/**
 * Sammelmeldung über dem Gesamtlimit: nur die Anzahl, keine Gastdaten. Die
 * Anfragen selbst stehen im Admin – die Mail soll dorthin führen, nicht den
 * Inhalt von möglicherweise automatisch erzeugten Anfragen weitertragen.
 */
export function buildOperatorDigest(
  count: number,
  ownerEmail: string,
  { limit, windowHours }: { limit: number; windowHours: number },
): Mail {
  const eingang =
    count === 1
      ? "ist eine weitere Buchungsanfrage"
      : `sind ${count} weitere Buchungsanfragen`;
  return {
    to: ownerEmail,
    subject: `Ungewöhnlich viele Buchungsanfragen: ${count} weitere eingegangen`,
    text: [
      `In der letzten Stunde ${eingang} eingegangen.`,
      "",
      `Weil mehr als ${limit} Anfragen in ${windowHours} Stunden eingegangen sind, kommen`,
      "vorübergehend keine einzelnen Mails und Push-Nachrichten mehr, sondern höchstens",
      "eine solche Sammelmeldung je Stunde. Die Absender bekommen in dieser Zeit keine",
      "Eingangsbestätigung. Das kann ein Bot sein – oder einfach ein sehr gefragter Termin.",
      "",
      "Alle Anfragen sind gespeichert und im Admin zu sehen:",
      `${SITE_URL}/admin`,
    ].join("\n"),
  };
}

/** Schickt die Sammelmeldung an die Betreiberin. */
export async function sendOperatorDigest(
  count: number,
  threshold: { limit: number; windowHours: number },
): Promise<void> {
  const ownerEmail = process.env.OWNER_NOTIFICATION_EMAIL;
  if (!ownerEmail) {
    throw new Error("OWNER_NOTIFICATION_EMAIL ist nicht konfiguriert");
  }

  await sendMail(buildOperatorDigest(count, ownerEmail, threshold));
}

export function buildGuestRequestReceived(request: BookingRequest): Mail {
  return {
    to: request.email,
    replyTo: REPLY_TO,
    subject: "Ihre Anfrage für die Ferienwohnung Heuler",
    text: [
      `Hallo ${request.name},`,
      "",
      `vielen Dank für Ihre Anfrage für den Zeitraum ${formatRange(request)}`,
      `für ${guestsText(request)}.`,
      `Wir haben sie erhalten und melden uns innerhalb von ${RESPONSE_HOURS} Stunden bei Ihnen.`,
      "",
      ...priceLines(request),
      ...(extrasLines(request).length > 0 ? ["", ...extrasLines(request)] : []),
      "",
      "Diese E-Mail ist noch keine Buchungsbestätigung – der Preis ist eine",
      "unverbindliche Vorschau auf Basis Ihres Wunschzeitraums.",
      "",
      "Viele Grüße",
      "Ferienwohnung Heuler, Norddeich",
    ].join("\n"),
  };
}

/** Bestätigt dem Gast den Eingang seiner Anfrage. */
export async function sendGuestRequestReceived(request: BookingRequest): Promise<void> {
  await sendMail(buildGuestRequestReceived(request));
}

/**
 * Zusage an den Gast. Mit `invoice` hängt die Rechnung als PDF an; ohne
 * (Rechnung konnte nicht erstellt werden) kündigt die Mail sie an – die
 * Betreiberin schickt sie dann aus dem Admin nach. Mit `rentalTerms` hängen
 * die Mietbedingungen als zweites PDF an; ohne verweist die Mail auf die
 * Seite.
 */
export function buildGuestConfirmation(
  request: BookingRequest,
  invoice?: InvoiceForMail,
  rentalTerms?: Uint8Array,
): Mail {
  const attachments = [
    ...(invoice ? [invoiceAttachment(invoice)] : []),
    ...(rentalTerms ? [rentalTermsAttachment(rentalTerms)] : []),
  ];
  return {
    to: request.email,
    replyTo: REPLY_TO,
    subject: "Ihre Buchung für die Ferienwohnung Heuler ist bestätigt",
    text: [
      `Hallo ${request.name},`,
      "",
      `Ihre Buchung für den Zeitraum ${formatRange(request)} ist bestätigt.`,
      "Wir freuen uns auf Ihren Besuch in Norddeich.",
      "",
      ...priceLines(request),
      "",
      ...paymentLines(request),
      "",
      ...attachmentLines(invoice, rentalTerms !== undefined),
      "",
      `Vor Ort in bar: Endreinigung ${CLEANING_FEE} €, Servicegebühr ${SERVICE_FEE} €.`,
      "Die Kurtaxe bezahlen Sie mit der Rechnung; wir leiten sie an die Stadt Norden weiter.",
      ...(extrasLines(request).length > 0 ? ["", ...extrasLines(request)] : []),
      "",
      `Anreise ab ca. ${CHECK_IN_TIME}, Abreise bis ${CHECK_OUT_TIME}.`,
      `Parken: ${PARKING}.`,
      "",
      ...cancellationLines(),
      "",
      "Bei Fragen antworten Sie einfach auf diese E-Mail.",
      "",
      "Viele Grüße",
      "Ferienwohnung Heuler, Norddeich",
    ].join("\n"),
    ...(attachments.length > 0 ? { attachments } : {}),
  };
}

/**
 * Sagt dem Gast den Aufenthalt verbindlich zu, mit Rechnung und
 * Mietbedingungen im Anhang, soweit vorhanden.
 */
export async function sendGuestConfirmation(
  request: BookingRequest,
  invoice?: InvoiceForMail,
  rentalTerms?: Uint8Array,
): Promise<void> {
  await sendMail(buildGuestConfirmation(request, invoice, rentalTerms));
}

/**
 * Informiert den Gast über eine Ablehnung oder eine Stornierung. Beide Fälle
 * teilen denselben Text – aus Sicht des Gasts ist das Ergebnis dasselbe: der
 * Zeitraum kommt nicht zustande.
 */
export function buildGuestDecline(
  request: BookingRequest,
  reason?: string | null,
): Mail {
  const reasonLines = reason?.trim() ? [`Grund: ${reason.trim()}`, ""] : [];

  return {
    to: request.email,
    replyTo: REPLY_TO,
    subject: "Ihre Anfrage für die Ferienwohnung Heuler",
    text: [
      `Hallo ${request.name},`,
      "",
      `leider können wir Ihnen den Zeitraum ${formatRange(request)} nicht anbieten.`,
      "",
      ...reasonLines,
      "Gerne prüfen wir einen anderen Termin – antworten Sie dazu einfach auf diese E-Mail.",
      "",
      "Viele Grüße",
      "Ferienwohnung Heuler, Norddeich",
    ].join("\n"),
  };
}

export async function sendGuestDecline(
  request: BookingRequest,
  reason?: string | null,
): Promise<void> {
  await sendMail(buildGuestDecline(request, reason));
}
