import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import type { BookingRequest } from "@/db/schema";
import {
  buildInvoiceSnapshot,
  formatInvoiceNumber,
  hasPostalAddress,
  invoiceFileName,
  parseAddress,
  postalAddressLines,
  GUEST_TAX_INVOICE_NOTE,
  SMALL_BUSINESS_NOTE,
  type InvoiceSnapshot,
} from "./invoice";
import { GUEST_TAX } from "./pricing";
import { renderInvoicePdf } from "./invoicePdf";

/** Einzig erlaubte Nennung des Satzungsbegriffs (BDS-006, Bezeichnung Kurtaxe). */
const GUEST_TAX_SATZUNG = "Kurtaxe (Gästebeitrag nach Satzung der Stadt Norden)";

const request: BookingRequest = {
  id: 7,
  name: "Erika Musterfrau",
  email: "erika@example.invalid",
  phone: null,
  street: "Musterweg 1",
  postalCode: "12345",
  city: "Musterstadt",
  country: null,
  // Über den Saisonwechsel 31.08./01.09.: 3 Nächte zu 94 €, 4 zu 74 €.
  startDate: new Date("2027-08-29"),
  endDate: new Date("2027-09-05"),
  message: null,
  // Drei Personen, davon ein Kind: Kurtaxe für zwei Personen, alle
  // sieben Nächte in der Hauptsaison der Kurtaxe (3,50 €).
  guests: 3,
  guestsUnder14: 1,
  linens: 2,
  towels: 0,
  status: "confirmed",
  source: "online",
  reasonNote: null,
  createdAt: new Date("2027-02-03"),
  decidedAt: null,
  anonymizedAt: null,
  termsAcceptedAt: null,
  termsVersion: null,
};

function snapshot(overrides: Partial<Parameters<typeof buildInvoiceSnapshot>[0]> = {}) {
  return buildInvoiceSnapshot({
    request,
    number: formatInvoiceNumber(2027, 1),
    issuedAt: new Date("2027-02-10"),
    recipientName: "Erika Musterfrau",
    recipientAddress: ["Musterweg 1", "12345 Musterstadt"],
    bankDetails: null,
    ...overrides,
  });
}

describe("formatInvoiceNumber", () => {
  it("setzt Jahr und vierstellige laufende Nummer zusammen", () => {
    expect(formatInvoiceNumber(2026, 1)).toBe("RE-2026-0001");
    expect(formatInvoiceNumber(2026, 42)).toBe("RE-2026-0042");
  });

  it("schneidet ab 10.000 Rechnungen im Jahr nichts ab", () => {
    expect(formatInvoiceNumber(2026, 12345)).toBe("RE-2026-12345");
  });
});

describe("parseAddress", () => {
  it("trennt Zeilen und verwirft Leerzeilen", () => {
    expect(parseAddress("  Musterweg 1 \n\n12345 Musterstadt\n")).toEqual([
      "Musterweg 1",
      "12345 Musterstadt",
    ]);
  });

  it("versteht auch Windows-Zeilenumbrüche", () => {
    expect(parseAddress("Musterweg 1\r\n12345 Musterstadt")).toHaveLength(2);
  });
});

describe("buildInvoiceSnapshot", () => {
  it("bepreist Nacht für Nacht und trennt beim Saisonwechsel", () => {
    const s = snapshot();

    expect(s.lines).toHaveLength(3);
    expect(s.lines[0]).toMatchObject({ quantity: 3, unitPrice: 94, total: 282 });
    expect(s.lines[1]).toMatchObject({ quantity: 4, unitPrice: 74, total: 296 });
  });

  it("weist die Kurtaxe als eigenen Posten aus: zahlende Personen × Nächte zum Satz", () => {
    const s = snapshot();

    expect(s.lines[2]).toEqual({
      description: "Kurtaxe Stadt Norden (Hauptsaison)",
      // 3 Personen − 1 Kind = 2 zahlende × 7 Nächte
      quantity: 14,
      unitPrice: GUEST_TAX.main,
      total: 49,
    });
    expect(s.guestsUnder14).toBe(1);
    expect(s.guestTaxNote).toBe(GUEST_TAX_INVOICE_NOTE);
  });

  it("trennt die Kurtaxe an der Saisongrenze 31.10./01.11. in zwei Posten", () => {
    // 3 Nächte Hauptsaison (29.–31.10.), 2 Nächte Nebensaison (01.–02.11.);
    // beim Mietpreis alles Zwischensaison.
    const s = snapshot({
      request: {
        ...request,
        startDate: new Date("2027-10-29"),
        endDate: new Date("2027-11-03"),
        guests: 2,
        guestsUnder14: 0,
        linens: 0,
      },
    });

    expect(s.lines).toHaveLength(3);
    expect(s.lines[0]).toMatchObject({ quantity: 5, unitPrice: 74, total: 370 });
    expect(s.lines[1]).toMatchObject({
      description: "Kurtaxe Stadt Norden (Hauptsaison)",
      quantity: 6,
      unitPrice: 3.5,
      total: 21,
    });
    expect(s.lines[2]).toMatchObject({
      description: "Kurtaxe Stadt Norden (Nebensaison)",
      quantity: 4,
      unitPrice: 1.8,
      total: 7.2,
    });
    expect(s.total).toBe(398.2);
  });

  it("rechnet Miete plus Kurtaxe als Rechnungsbetrag", () => {
    expect(snapshot().total).toBe(578 + 49);
  });

  it("teilt den Betrag so auf, dass Anzahlung und Rest exakt die Summe ergeben", () => {
    const s = snapshot();

    // 30 % von 627 € (Miete 578 € + Kurtaxe 49 €)
    expect(s.deposit).toBe(188.1);
    expect(s.balance).toBe(438.9);
    expect(s.deposit + s.balance).toBeCloseTo(s.total, 2);
  });

  it("führt Nebenkosten und Wäsche nur als bar zu zahlende Hinweise, die Kurtaxe nicht", () => {
    const s = snapshot();

    expect(s.cashOnSite.some((p) => p.includes("Endreinigung"))).toBe(true);
    expect(s.cashOnSite.some((p) => p.includes("Bettwäsche 2"))).toBe(true);
    // Keine Handtücher bestellt, also auch nicht erwähnt.
    expect(s.cashOnSite.some((p) => p.includes("Handtücher"))).toBe(false);
    // Die Kurtaxe steht seit BDS-006 auf der Rechnung, nicht im Bar-Block.
    expect(s.cashOnSite.some((p) => p.includes("Kurtaxe"))).toBe(false);
    expect(s.cashOnSite.some((p) => p.includes("Gästebeitrag"))).toBe(false);
  });

  it("sagt in neuen Rechnungen „Kurtaxe“, „Gästebeitrag“ nur einmal als Begriff der Satzung", () => {
    const text = JSON.stringify(snapshot());

    expect(text).toContain("Kurtaxe Stadt Norden (Hauptsaison)");
    expect(text.split(GUEST_TAX_SATZUNG).length - 1).toBe(1);
    expect(text.replace(GUEST_TAX_SATZUNG, "")).not.toContain("Gästebeitrag");
  });

  it("friert den Stand ein – das Datum steht als Text, nicht als Date", () => {
    const s = snapshot();

    expect(s.issuedAt).toBe("2027-02-10");
    expect(s.serviceStart).toBe("2027-08-29");
    expect(s.serviceEnd).toBe("2027-09-05");
    // Muss sich verlustfrei als JSON speichern lassen.
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe("renderInvoicePdf", () => {
  it("erzeugt ein gültiges einseitiges PDF", async () => {
    const bytes = await renderInvoicePdf(snapshot());
    const pdf = await PDFDocument.load(bytes);

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("Rechnung RE-2027-0001");
  });

  it("druckt Kurtaxe-Posten, Spalte „Menge“, Kinder im Kopf und den Weiterleitungshinweis", async () => {
    const bytes = await renderInvoicePdf(snapshot());

    expect(pdfDrawsText(bytes, "Menge")).toBe(true);
    expect(pdfDrawsText(bytes, "Nächte")).toBe(false);
    expect(pdfDrawsText(bytes, "Kurtaxe Stadt Norden (Hauptsaison)")).toBe(true);
    expect(pdfDrawsText(bytes, "3 Personen, davon 1 unter 14 Jahren")).toBe(true);
    expect(pdfDrawsText(bytes, "Die Kurtaxe (Gästebeitrag nach Satzung der Stadt Norden)")).toBe(true);
  });

  it("rendert einen alten Snapshot ohne Kinderangabe und mit Gästebeitrag im Bar-Block unverändert", async () => {
    // So sahen Snapshots vor BDS-006 aus: nur Übernachtungen, Gästebeitrag
    // als Barposten, kein guestsUnder14, kein Hinweis.
    const alt: InvoiceSnapshot = {
      ...snapshot(),
      lines: snapshot().lines.slice(0, 2),
      total: 578,
      deposit: 173.4,
      balance: 404.6,
      cashOnSite: [
        "Endreinigung 55,00 €",
        "Servicegebühr 30,00 €",
        "Gästebeitrag nach Satzung der Stadt Norden (3,50 € bzw. 1,80 € je Person ab 14 Jahren und Nacht)",
      ],
    };
    delete alt.guestsUnder14;
    delete alt.guestTaxNote;

    const bytes = await renderInvoicePdf(alt);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    expect(pdfDrawsText(bytes, "3 Personen")).toBe(true);
    expect(pdfDrawsText(bytes, "unter 14 Jahren")).toBe(false);
    expect(pdfDrawsText(bytes, "Kurtaxe Stadt Norden")).toBe(false);
    expect(pdfDrawsText(bytes, "Gästebeitrag nach Satzung")).toBe(true);
  });

  it("enthält den Kleinunternehmer-Hinweis nach § 19 UStG", () => {
    expect(SMALL_BUSINESS_NOTE).toContain("§ 19 UStG");
  });

  // Die PDF-Standardschriften kennen nur WinAnsi. Ohne Entschärfung würde ein
  // Gastname außerhalb davon die gesamte Rechnungserzeugung abbrechen.
  it.each(["Łukasz Wiśniewski", "Ayşe Şahin", "Đorđe Petrović", "Иван Петров"])(
    "bricht bei einem Namen wie %s nicht ab",
    async (name) => {
      const bytes = await renderInvoicePdf(
        snapshot({ recipientName: name, recipientAddress: ["ul. Długa 5", "00-001 Warszawa"] }),
      );

      expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    },
  );

  it("druckt die Bankverbindung nur, wenn eine hinterlegt ist", async () => {
    const ohne = await renderInvoicePdf(snapshot());
    const mit = await renderInvoicePdf(
      snapshot({ bankDetails: ["Sabrina Rönne", "IBAN DE00 0000 0000 0000 0000 00"] }),
    );

    // Ein zusätzlicher Textblock macht das Dokument messbar größer.
    expect(mit.length).toBeGreaterThan(ohne.length);
  });
});

/**
 * Prüft, ob ein Text im PDF gezeichnet wird. pdf-lib komprimiert die
 * Seiteninhalte (FlateDecode) und schreibt Text der Standardschriften als
 * Hex-String – gesucht wird deshalb in den entpackten Streams nach dem Hex.
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
      // Kein Flate-Stream (z. B. eingebettete Daten) – überspringen.
    }
  }
  return false;
}

describe("Rechnung ohne Steuernummer", () => {
  it("hat im Snapshot keine Steuernummer", () => {
    expect(snapshot().seller).toEqual({
      name: "Sabrina Rönne",
      address: ["Am Tannenkamp 1", "48465 Schüttorf"],
    });
  });

  it("druckt keine Steuernummer, auch nicht aus einem älteren Snapshot, der noch eine trägt", async () => {
    const alt = {
      ...snapshot(),
      seller: { ...snapshot().seller, taxNumber: "12/345/67890" },
    } as InvoiceSnapshot;

    for (const bytes of [await renderInvoicePdf(snapshot()), await renderInvoicePdf(alt)]) {
      // Gegenprobe: Die Suche findet, was wirklich gedruckt wird.
      expect(pdfDrawsText(bytes, "Rechnungsnummer")).toBe(true);
      expect(pdfDrawsText(bytes, "Steuernummer")).toBe(false);
      expect(pdfDrawsText(bytes, "12/345/67890")).toBe(false);
    }
  });
});

describe("Rechnungsanschrift aus der Anfrage", () => {
  const anschrift = { street: "Musterweg 1", postalCode: "12345", city: "Musterstadt", country: null };

  it("bildet Straße und PLZ/Ort als eigene Zeilen", () => {
    expect(postalAddressLines(anschrift)).toEqual(["Musterweg 1", "12345 Musterstadt"]);
  });

  it.each(["", "  ", "Deutschland", "deutschland", "Germany", "DE"])(
    "lässt das Land %j weg",
    (country) => {
      expect(postalAddressLines({ ...anschrift, country })).toHaveLength(2);
    },
  );

  it("nennt ein anderes Land in einer dritten Zeile", () => {
    expect(
      postalAddressLines({ street: "Hauptstraße 3", postalCode: "1010", city: "Wien", country: "Österreich" }),
    ).toEqual(["Hauptstraße 3", "1010 Wien", "Österreich"]);
  });

  it("verlangt für eine Rechnung Straße, PLZ und Ort", () => {
    expect(hasPostalAddress(anschrift)).toBe(true);
    expect(hasPostalAddress({ ...anschrift, street: null })).toBe(false);
    expect(hasPostalAddress({ ...anschrift, postalCode: " " })).toBe(false);
    expect(hasPostalAddress({ street: null, postalCode: null, city: null, country: null })).toBe(false);
  });

  it("benennt das PDF nach der Rechnungsnummer", () => {
    expect(invoiceFileName("RE-2027-0001")).toBe("Rechnung-RE-2027-0001.pdf");
  });
});
