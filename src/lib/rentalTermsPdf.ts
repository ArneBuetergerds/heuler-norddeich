import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { darstellbar, umbrechen } from "./pdfText";
import { SELLER } from "./invoice";
import {
  RENTAL_TERMS_VERSION,
  formatTermsVersion,
  rentalTermsSections,
  type RentalTermsSection,
} from "./rentalTerms";

// DIN A4 in PostScript-Punkten, Ränder wie auf der Rechnung.
const A4 = { width: 595.28, height: 841.89 } as const;
const RAND = 56;
/** Unterhalb davon wird nicht mehr geschrieben – dort steht die Seitenzahl. */
const UNTERER_RAND = RAND + 24;
const BREITE = A4.width - 2 * RAND;
const SCHWARZ = rgb(0.09, 0.09, 0.11);
const GRAU = rgb(0.45, 0.45, 0.48);

const TEXT = { size: 9.5, zeile: 13 } as const;
const UEBERSCHRIFT = { size: 11, zeile: 15 } as const;

/**
 * Schreibt von oben nach unten und beginnt eine neue Seite, sobald der
 * nächste Block den unteren Rand unterschreiten würde. Anders als die
 * Rechnung (eine Seite) sind die Mietbedingungen mehrseitig.
 */
class Seitenschreiber {
  private page: PDFPage;
  private y = 0;

  constructor(
    private pdf: PDFDocument,
    private regular: PDFFont,
    private bold: PDFFont,
  ) {
    this.page = this.neueSeite();
  }

  private neueSeite(): PDFPage {
    this.page = this.pdf.addPage([A4.width, A4.height]);
    this.y = A4.height - RAND;
    return this.page;
  }

  /** Sorgt dafür, dass `hoehe` Punkte auf der aktuellen Seite Platz haben. */
  private platz(hoehe: number): void {
    if (this.y - hoehe < UNTERER_RAND) {
      this.neueSeite();
    }
  }

  private zeile(
    text: string,
    { x = RAND, size, bold = false, color = SCHWARZ }: { x?: number; size: number; bold?: boolean; color?: typeof SCHWARZ },
  ): void {
    this.page.drawText(text, { x, y: this.y, size, font: bold ? this.bold : this.regular, color });
  }

  /** Umgebrochener Text; jede Zeile prüft den Platz einzeln. */
  text(
    text: string,
    options: { size?: number; zeile?: number; bold?: boolean; color?: typeof SCHWARZ; einzug?: number; marke?: string } = {},
  ): void {
    const size = options.size ?? TEXT.size;
    const zeilenhoehe = options.zeile ?? TEXT.zeile;
    const font = options.bold ? this.bold : this.regular;
    const einzug = options.einzug ?? 0;
    const zeilen = umbrechen(darstellbar(text, font), font, size, BREITE - einzug);

    zeilen.forEach((teil, i) => {
      this.platz(zeilenhoehe);
      if (i === 0 && options.marke) {
        this.zeile(options.marke, { x: RAND + einzug - 10, size, color: options.color });
      }
      this.zeile(teil, { x: RAND + einzug, size, bold: options.bold, color: options.color });
      this.y -= zeilenhoehe;
    });
  }

  /** Überschrift nie allein am Seitenende: Platz für sie und zwei Textzeilen. */
  ueberschrift(text: string): void {
    this.platz(UEBERSCHRIFT.zeile + 2 * TEXT.zeile);
    this.text(text, { size: UEBERSCHRIFT.size, zeile: UEBERSCHRIFT.zeile, bold: true });
    this.y -= 2;
  }

  abstand(punkte: number): void {
    this.y -= punkte;
  }

  /** „Seite x von y“ unten auf jede Seite – erst am Ende, wenn y feststeht. */
  seitenzahlen(): void {
    const seiten = this.pdf.getPages();
    seiten.forEach((seite, i) => {
      const text = `Seite ${i + 1} von ${seiten.length}`;
      const size = 8;
      seite.drawText(text, {
        x: A4.width - RAND - this.regular.widthOfTextAtSize(text, size),
        y: RAND - 16,
        size,
        font: this.regular,
        color: GRAU,
      });
    });
  }
}

/**
 * Erzeugt das PDF der Mietbedingungen aus denselben Daten wie die Seite
 * /mietbedingungen (`rentalTermsSections`). `sections` nur für Tests.
 */
export async function renderRentalTermsPdf(
  sections: readonly RentalTermsSection[] = rentalTermsSections(),
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Mietbedingungen Ferienwohnung Heuler");
  pdf.setAuthor(SELLER.name);
  pdf.setCreator("Ferienwohnung Heuler");

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const s = new Seitenschreiber(pdf, regular, bold);

  s.text(`${SELLER.name} · ${SELLER.address.join(" · ")}`, { size: 7.5, color: GRAU });
  s.abstand(14);
  s.text("Mietbedingungen Ferienwohnung Heuler", { size: 16, zeile: 20, bold: true });
  s.text(`Stand: ${formatTermsVersion(RENTAL_TERMS_VERSION)}`, { size: 9.5, color: GRAU });
  s.abstand(12);

  sections.forEach((section, index) => {
    s.ueberschrift(`${index + 1}. ${section.heading}`);
    for (const block of section.blocks) {
      if (block.kind === "paragraph") {
        s.text(block.text);
      } else {
        for (const item of block.items) {
          s.text(item, { einzug: 12, marke: "–" });
        }
      }
      s.abstand(4);
    }
    s.abstand(8);
  });

  s.seitenzahlen();
  return pdf.save();
}
