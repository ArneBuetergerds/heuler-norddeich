import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { darstellbar, umbrechen } from "./pdfText";
import { BALANCE_DUE_DAYS, DEPOSIT_SHARE } from "./pricing";
import { DEPOSIT_DUE_DAYS } from "./terms";
import { PROPERTY, SMALL_BUSINESS_NOTE, type InvoiceSnapshot } from "./invoice";

// DIN A4 in PostScript-Punkten.
const A4 = { width: 595.28, height: 841.89 } as const;
const RAND = 56;
const SCHWARZ = rgb(0.09, 0.09, 0.11);
const GRAU = rgb(0.45, 0.45, 0.48);
const LINIE = rgb(0.85, 0.85, 0.87);

function euro(amount: number): string {
  // Intl setzt ein geschütztes Leerzeichen vor das €-Zeichen. Die
  // Standardschriften von pdf-lib (WinAnsi) können U+00A0 zwar darstellen,
  // ein normales Leerzeichen ist aber robuster gegen spätere Schriftwechsel.
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" })
    .format(amount)
    .replaceAll("\u00a0", " ");
}

function datum(iso: string): string {
  const [jahr, monat, tag] = iso.split("-");
  return `${tag}.${monat}.${jahr}`;
}

class Schreiber {
  y: number;

  constructor(
    private page: PDFPage,
    private regular: PDFFont,
    private bold: PDFFont,
  ) {
    this.y = A4.height - RAND;
  }

  text(
    text: string,
    options: { x?: number; size?: number; bold?: boolean; color?: typeof SCHWARZ } = {},
  ): void {
    const font = options.bold ? this.bold : this.regular;
    this.page.drawText(darstellbar(text, font), {
      x: options.x ?? RAND,
      y: this.y,
      size: options.size ?? 10,
      font,
      color: options.color ?? SCHWARZ,
    });
  }

  rechts(text: string, rechterRand: number, options: { size?: number; bold?: boolean } = {}): void {
    const size = options.size ?? 10;
    const font = options.bold ? this.bold : this.regular;
    const sicher = darstellbar(text, font);
    this.text(sicher, { ...options, x: rechterRand - font.widthOfTextAtSize(sicher, size) });
  }

  absatz(text: string, options: { size?: number; color?: typeof SCHWARZ } = {}): void {
    const size = options.size ?? 9;
    const sicher = darstellbar(text, this.regular);
    for (const zeile of umbrechen(sicher, this.regular, size, A4.width - 2 * RAND)) {
      this.text(zeile, { size, color: options.color });
      this.weiter(size + 3);
    }
  }

  weiter(abstand: number): void {
    this.y -= abstand;
  }

  linie(): void {
    this.page.drawLine({
      start: { x: RAND, y: this.y },
      end: { x: A4.width - RAND, y: this.y },
      thickness: 0.6,
      color: LINIE,
    });
  }
}

/**
 * Personen für den Kopf: „4 Personen, davon 2 unter 14 Jahren“. Snapshots von
 * vor BDS-006 haben kein `guestsUnder14` und zeigen nur die Personenzahl.
 */
function personen(snapshot: InvoiceSnapshot): string {
  const anzahl = `${snapshot.guests} ${snapshot.guests === 1 ? "Person" : "Personen"}`;
  const kinder = snapshot.guestsUnder14 ?? 0;
  return kinder > 0 ? `${anzahl}, davon ${kinder} unter 14 Jahren` : anzahl;
}

/**
 * Erzeugt das Rechnungs-PDF ausschließlich aus dem eingefrorenen Stand
 * (siehe `InvoiceSnapshot`) – nie aus aktuellen Preisen. Dieselbe Rechnung
 * ergibt so bei jedem Abruf dasselbe Dokument.
 */
export async function renderInvoicePdf(snapshot: InvoiceSnapshot): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Rechnung ${snapshot.number}`);
  pdf.setAuthor(snapshot.seller.name);
  pdf.setCreator("Ferienwohnung Heuler");

  const page = pdf.addPage([A4.width, A4.height]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const s = new Schreiber(page, regular, bold);
  const rechterRand = A4.width - RAND;

  // --- Absenderzeile und Empfänger ------------------------------------------
  s.text(
    `${snapshot.seller.name} · ${snapshot.seller.address.join(" · ")}`,
    { size: 7.5, color: GRAU },
  );
  s.weiter(22);

  s.text(snapshot.recipient.name, { size: 10.5 });
  for (const zeile of snapshot.recipient.address) {
    s.weiter(14);
    s.text(zeile, { size: 10.5 });
  }

  // --- Rechnungskopf rechts -------------------------------------------------
  const kopfY = A4.height - RAND - 22;
  const kopf: [string, string][] = [
    ["Rechnungsnummer", snapshot.number],
    ["Rechnungsdatum", datum(snapshot.issuedAt)],
  ];
  kopf.forEach(([label, wert], i) => {
    const y = kopfY - i * 14;
    const sicher = darstellbar(wert, bold);
    page.drawText(label, { x: rechterRand - 200, y, size: 8.5, font: regular, color: GRAU });
    page.drawText(sicher, {
      x: rechterRand - bold.widthOfTextAtSize(sicher, 9),
      y,
      size: 9,
      font: bold,
      color: SCHWARZ,
    });
  });

  s.y = Math.min(s.y, kopfY - kopf.length * 14) - 48;

  // --- Titel und Leistungszeitraum ------------------------------------------
  s.text(`Rechnung ${snapshot.number}`, { size: 16, bold: true });
  s.weiter(20);
  s.text(PROPERTY, { size: 10 });
  s.weiter(15);
  s.text(
    `Leistungszeitraum: ${datum(snapshot.serviceStart)} bis ${datum(snapshot.serviceEnd)} · ${personen(snapshot)}`,
    { size: 9.5, color: GRAU },
  );
  s.weiter(28);

  // --- Positionen -----------------------------------------------------------
  const spalten = { menge: rechterRand - 190, einzel: rechterRand - 90 };
  s.text("Leistung", { size: 8.5, bold: true, color: GRAU });
  // „Menge“ statt „Nächte“: Bei der Kurtaxe zählt die Spalte Personen ×
  // Nächte (seit BDS-006). Gilt auch für ältere Snapshots – dort steht nur
  // die Zahl der Nächte darin, was „Menge“ ebenso trifft.
  s.text("Menge", { x: spalten.menge, size: 8.5, bold: true, color: GRAU });
  s.rechts("Einzelpreis", spalten.einzel + 20, { size: 8.5, bold: true });
  s.rechts("Betrag", rechterRand, { size: 8.5, bold: true });
  s.weiter(8);
  s.linie();
  s.weiter(16);

  for (const zeile of snapshot.lines) {
    const beschreibung = umbrechen(
      darstellbar(zeile.description, regular),
      regular,
      9.5,
      spalten.menge - RAND - 12,
    );
    s.text(String(zeile.quantity), { x: spalten.menge, size: 9.5 });
    s.rechts(euro(zeile.unitPrice), spalten.einzel + 20, { size: 9.5 });
    s.rechts(euro(zeile.total), rechterRand, { size: 9.5 });
    beschreibung.forEach((teil, i) => {
      if (i > 0) {
        s.weiter(12);
      }
      s.text(teil, { size: 9.5 });
    });
    s.weiter(18);
  }

  s.linie();
  s.weiter(18);
  s.text("Rechnungsbetrag", { size: 11, bold: true });
  s.rechts(euro(snapshot.total), rechterRand, { size: 11, bold: true });
  s.weiter(16);
  s.absatz(SMALL_BUSINESS_NOTE, { size: 8.5, color: GRAU });
  if (snapshot.guestTaxNote) {
    s.absatz(snapshot.guestTaxNote, { size: 8.5, color: GRAU });
  }
  s.weiter(18);

  // --- Zahlung --------------------------------------------------------------
  s.text("Zahlungsbedingungen", { size: 10, bold: true });
  s.weiter(16);
  s.text(
    `Anzahlung ${Math.round(DEPOSIT_SHARE * 100)} %, fällig innerhalb von ${DEPOSIT_DUE_DAYS} Tagen nach Buchungsbestätigung`,
    { size: 9.5 },
  );
  s.rechts(euro(snapshot.deposit), rechterRand, { size: 9.5 });
  s.weiter(14);
  s.text(`Restbetrag, fällig spätestens ${BALANCE_DUE_DAYS} Tage vor Anreise`, { size: 9.5 });
  s.rechts(euro(snapshot.balance), rechterRand, { size: 9.5 });
  s.weiter(22);

  if (snapshot.bankDetails && snapshot.bankDetails.length > 0) {
    s.text("Bankverbindung", { size: 10, bold: true });
    s.weiter(14);
    for (const zeile of snapshot.bankDetails) {
      s.text(zeile, { size: 9.5 });
      s.weiter(13);
    }
    s.text(`Verwendungszweck: ${snapshot.number}`, { size: 9.5 });
    s.weiter(22);
  }

  // --- Vor Ort bar ----------------------------------------------------------
  s.text("Nicht in diesem Rechnungsbetrag enthalten – bar bei der Schlüsselübergabe:", {
    size: 9,
    bold: true,
  });
  s.weiter(14);
  for (const posten of snapshot.cashOnSite) {
    s.absatz(`– ${posten}`, { size: 9 });
  }

  return pdf.save();
}
