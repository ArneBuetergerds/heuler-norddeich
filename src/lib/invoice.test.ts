import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { BookingRequest } from "@/db/schema";
import {
  buildInvoiceSnapshot,
  formatInvoiceNumber,
  parseAddress,
  SMALL_BUSINESS_NOTE,
} from "./invoice";
import { renderInvoicePdf } from "./invoicePdf";

const request: BookingRequest = {
  id: 7,
  name: "Erika Musterfrau",
  email: "erika@example.invalid",
  phone: null,
  // Über den Saisonwechsel 31.08./01.09.: 3 Nächte zu 94 €, 4 zu 74 €.
  startDate: new Date("2027-08-29"),
  endDate: new Date("2027-09-05"),
  message: null,
  guests: 3,
  linens: 2,
  towels: 0,
  status: "confirmed",
  reasonNote: null,
  createdAt: new Date("2027-02-03"),
};

function snapshot(overrides: Partial<Parameters<typeof buildInvoiceSnapshot>[0]> = {}) {
  return buildInvoiceSnapshot({
    request,
    number: formatInvoiceNumber(2027, 1),
    issuedAt: new Date("2027-02-10"),
    recipientName: "Erika Musterfrau",
    recipientAddress: ["Musterweg 1", "12345 Musterstadt"],
    taxNumber: "12/345/67890",
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

    expect(s.lines).toHaveLength(2);
    expect(s.lines[0]).toMatchObject({ quantity: 3, unitPrice: 94, total: 282 });
    expect(s.lines[1]).toMatchObject({ quantity: 4, unitPrice: 74, total: 296 });
    expect(s.total).toBe(578);
  });

  it("teilt den Betrag so auf, dass Anzahlung und Rest exakt die Summe ergeben", () => {
    const s = snapshot();

    expect(s.deposit).toBe(173.4);
    expect(s.balance).toBe(404.6);
    expect(s.deposit + s.balance).toBeCloseTo(s.total, 2);
  });

  it("führt Nebenkosten und Wäsche nur als bar zu zahlende Hinweise", () => {
    const s = snapshot();

    expect(s.cashOnSite.some((p) => p.includes("Endreinigung"))).toBe(true);
    expect(s.cashOnSite.some((p) => p.includes("Bettwäsche 2"))).toBe(true);
    // Keine Handtücher bestellt, also auch nicht erwähnt.
    expect(s.cashOnSite.some((p) => p.includes("Handtücher"))).toBe(false);
    // Der Rechnungsbetrag ist allein die Miete.
    expect(s.total).toBe(578);
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
