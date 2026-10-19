import { describe, it, expect } from "vitest";
import { bookingCharges, quoteStay } from "./pricing";
import {
  guestTaxLineLabel,
  stayChargesView,
  guestsUnder14Note,
  paymentOverview,
  under14Hint,
  under14Selectable,
} from "./quoteView";

describe("paymentOverview", () => {
  const quote = quoteStay(new Date("2027-07-10"), new Date("2027-07-17"), {
    guests: 2,
    guestsUnder14: 0,
    linens: 1,
    towels: 0,
  });

  it("überweist Mietpreis und Kurtaxe, geteilt in Anzahlung und Rest", () => {
    // 7 × 94 € Miete + 7 × 2 × 3,50 € Kurtaxe
    expect(paymentOverview(quote).transfer).toEqual({
      total: 707,
      deposit: 212.1,
      balance: 494.9,
    });
  });

  it("zahlt Endreinigung, Servicegebühr und bestellte Wäsche bar", () => {
    expect(paymentOverview(quote).onSite).toEqual({
      lines: [
        { label: "Endreinigung", amount: 55 },
        { label: "Servicegebühr", amount: 30 },
        { label: "Bettwäsche & Handtücher", amount: 10 },
      ],
      total: 95,
    });
  });

  it("ergibt zusammen den Gesamtpreis der Vorschau", () => {
    const { transfer, onSite } = paymentOverview(quote);
    expect(transfer.total + onSite.total).toBe(quote.total);
  });

  it("lässt Wäsche weg, wenn keine bestellt ist", () => {
    const ohne = quoteStay(new Date("2027-02-01"), new Date("2027-02-04"), {
      guests: 1,
      linens: 0,
      towels: 0,
    });
    expect(paymentOverview(ohne).onSite.lines.map((l) => l.label)).toEqual([
      "Endreinigung",
      "Servicegebühr",
    ]);
  });
});

describe("guestTaxLineLabel", () => {
  it("nennt Nächte, zahlende Personen und Saison", () => {
    expect(
      guestTaxLineLabel({ season: "main", nights: 4, persons: 2, rate: 3.5, total: 28 }),
    ).toBe("4 Nächte × 2 Personen ab 14 (Hauptsaison)");
  });

  it("schreibt die Einzahl", () => {
    expect(
      guestTaxLineLabel({ season: "off", nights: 1, persons: 1, rate: 1.8, total: 1.8 }),
    ).toBe("1 Nacht × 1 Person ab 14 (Nebensaison)");
  });
});

describe("guestsUnder14Note", () => {
  it("nennt Kinder unter 14", () => {
    expect(guestsUnder14Note(2)).toBe("davon 2 unter 14");
  });

  it("bleibt ohne Kinder und bei Altdaten leer", () => {
    expect(guestsUnder14Note(0)).toBeNull();
    expect(guestsUnder14Note(null)).toBeNull();
    expect(guestsUnder14Note(undefined)).toBeNull();
  });
});

describe("under14Selectable / under14Hint", () => {
  it("sperrt das Feld bei einer Person und erklärt warum", () => {
    expect(under14Selectable(1)).toBe(false);
    expect(under14Hint(1)).toContain("Mindestens eine Person muss 14 Jahre oder älter sein");
  });

  it("gibt das Feld ab zwei Personen frei", () => {
    expect(under14Selectable(2)).toBe(true);
    expect(under14Hint(2)).toBe("Kinder bis 13 Jahre zahlen keine Kurtaxe.");
  });
});

describe("stayChargesView (Admin-Dialog, BDS-006)", () => {
  // 29.08.–05.09.2027, 3 Personen, 1 Kind: Miete 578 €, Kurtaxe 49 €.
  const charges = bookingCharges({
    startDate: new Date("2027-08-29"),
    endDate: new Date("2027-09-05"),
    guests: 3,
    guestsUnder14: 1,
  });

  it("ohne Rechnung: Kurtaxe auf der Rechnung, Überweisung Miete + Kurtaxe", () => {
    expect(stayChargesView(charges, undefined)).toEqual({
      invoiceGuestTaxLines: charges.guestTaxLines,
      invoiceTotal: 627,
      guestTaxOnSite: null,
      invoiceBeforeSwitch: false,
    });
  });

  it("mit neuer Rechnung (Kurtaxe enthalten): wie ohne Rechnung", () => {
    const view = stayChargesView(charges, { number: "RE-2027-0005", includesGuestTax: true });

    expect(view.invoiceTotal).toBe(627);
    expect(view.invoiceGuestTaxLines).toHaveLength(1);
    expect(view.guestTaxOnSite).toBeNull();
    expect(view.invoiceBeforeSwitch).toBe(false);
  });

  it("mit Rechnung von vor der Umstellung: Miete als Rechnungsbetrag, Kurtaxe bar vor Ort", () => {
    expect(stayChargesView(charges, { number: "RE-2027-0001", includesGuestTax: false })).toEqual({
      invoiceGuestTaxLines: [],
      invoiceTotal: 578,
      guestTaxOnSite: { amount: 49, invoiceNumber: "RE-2027-0001" },
      invoiceBeforeSwitch: true,
    });
  });
});
