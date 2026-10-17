import type { PDFFont } from "pdf-lib";

/**
 * Texthilfen für PDFs mit den Standardschriften von pdf-lib, geteilt von
 * Rechnung (`invoicePdf.ts`) und Mietbedingungen (`rentalTermsPdf.ts`).
 */

/**
 * Buchstaben mit Querstrich zerfallen unter NFD nicht in Grundbuchstabe plus
 * Akzent – sie brauchen eine feste Zuordnung.
 */
const ERSATZ: Record<string, string> = {
  "Ł": "L", "ł": "l", "Đ": "D", "đ": "d", "Ħ": "H", "ħ": "h", "ı": "i",
};

/**
 * Die Standardschriften von PDF kennen nur WinAnsi. Deutsche Umlaute, ß und €
 * sind darin enthalten – ein Gastname wie "Łukasz" oder "Şahin" aber nicht,
 * und pdf-lib bricht dann die ganze Erzeugung mit einer Exception ab.
 *
 * Deshalb wird jeder Text vorher entschärft: Was die Schrift kann, bleibt;
 * Buchstaben mit Akzent werden auf den Grundbuchstaben zurückgeführt
 * ("Ş" → "S"); was dann immer noch fehlt, wird zu "?". Lieber ein leicht
 * vereinfachter Name auf der Rechnung als gar keine Rechnung.
 */
export function darstellbar(text: string, font: PDFFont): string {
  const zeichensatz = new Set(font.getCharacterSet());
  const kann = (zeichen: string) =>
    [...zeichen].every((z) => zeichensatz.has(z.codePointAt(0)!));

  return [...text]
    .map((zeichen) => {
      if (kann(zeichen)) {
        return zeichen;
      }
      const ersatz = ERSATZ[zeichen] ?? zeichen.normalize("NFD").replace(/\p{M}/gu, "");
      return ersatz && kann(ersatz) ? ersatz : "?";
    })
    .join("");
}

/**
 * Bricht Text an Wortgrenzen um, damit lange Zeilen – etwa die Hinweise zum
 * Gästebeitrag – nicht über den Rand laufen. pdf-lib bricht selbst nicht um.
 */
export function umbrechen(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const woerter = text.split(" ");
  const zeilen: string[] = [];
  let aktuell = "";

  for (const wort of woerter) {
    const versuch = aktuell ? `${aktuell} ${wort}` : wort;
    if (font.widthOfTextAtSize(versuch, size) > maxWidth && aktuell) {
      zeilen.push(aktuell);
      aktuell = wort;
    } else {
      aktuell = versuch;
    }
  }
  if (aktuell) {
    zeilen.push(aktuell);
  }
  return zeilen;
}
