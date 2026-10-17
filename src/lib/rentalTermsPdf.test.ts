import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderRentalTermsPdf } from "./rentalTermsPdf";
import { rentalTermsSections, type RentalTermsSection } from "./rentalTerms";

/**
 * Prüft, ob ein Text im PDF gezeichnet wird – wie in invoice.test.ts: pdf-lib
 * komprimiert die Seiteninhalte und schreibt Text als Hex-String.
 */
function pdfDrawsText(bytes: Uint8Array, text: string): boolean {
  const buffer = Buffer.from(bytes);
  const raw = buffer.toString("latin1");
  const hex = Buffer.from(text, "latin1").toString("hex").toUpperCase();
  const streamStart = /stream\r?\n/g;
  for (let match = streamStart.exec(raw); match; match = streamStart.exec(raw)) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    try {
      if (inflateSync(buffer.subarray(start, end)).toString("latin1").includes(hex)) {
        return true;
      }
    } catch {
      // Kein Flate-Stream – überspringen.
    }
  }
  return false;
}

/** Ein langer Abschnitt, der allein mehr als eine Seite füllt. */
function langerAbschnitt(id: string): RentalTermsSection {
  const satz =
    "Dieser Satz steht nur im Test und füllt eine Zeile nach der anderen, damit der Seitenumbruch greifen muss.";
  return {
    id,
    heading: `Langer Abschnitt ${id}`,
    blocks: [
      { kind: "paragraph", text: Array.from({ length: 60 }, () => satz).join(" ") },
      { kind: "list", items: Array.from({ length: 40 }, (_, i) => `Punkt ${i + 1}: ${satz}`) },
    ],
  };
}

describe("renderRentalTermsPdf", () => {
  it("erzeugt ein gültiges PDF mit Titel, Stand und Widerrufshinweis", async () => {
    const bytes = await renderRentalTermsPdf();
    const pdf = await PDFDocument.load(bytes);

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(pdf.getTitle()).toBe("Mietbedingungen Ferienwohnung Heuler");
    expect(pdfDrawsText(bytes, "Mietbedingungen Ferienwohnung Heuler")).toBe(true);
    expect(pdfDrawsText(bytes, "Stand: ")).toBe(true);
    expect(pdfDrawsText(bytes, "10. Kein Widerrufsrecht")).toBe(true);
    expect(pdfDrawsText(bytes, "Seite 1 von ")).toBe(true);
  });

  it("enthält jede Abschnittsüberschrift mit Nummer", async () => {
    const bytes = await renderRentalTermsPdf();
    rentalTermsSections().forEach((section, i) => {
      expect(pdfDrawsText(bytes, `${i + 1}. ${section.heading}`)).toBe(true);
    });
  });

  it("bricht langen Text auf weitere Seiten um und nummeriert sie", async () => {
    const bytes = await renderRentalTermsPdf([langerAbschnitt("a"), langerAbschnitt("b")]);
    const pdf = await PDFDocument.load(bytes);
    const seiten = pdf.getPageCount();

    expect(seiten).toBeGreaterThanOrEqual(3);
    expect(pdfDrawsText(bytes, `Seite 1 von ${seiten}`)).toBe(true);
    expect(pdfDrawsText(bytes, `Seite ${seiten} von ${seiten}`)).toBe(true);
    // Der letzte Listenpunkt ist noch drauf – nichts fiel unten heraus.
    expect(pdfDrawsText(bytes, "Punkt 40:")).toBe(true);
  });

  it("bricht bei Zeichen außerhalb von WinAnsi nicht ab", async () => {
    const bytes = await renderRentalTermsPdf([
      { id: "x", heading: "Łódź – Şahin", blocks: [{ kind: "paragraph", text: "Иван ✓" }] },
    ]);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
