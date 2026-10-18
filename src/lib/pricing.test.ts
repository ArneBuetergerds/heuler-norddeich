import { describe, it, expect } from "vitest";
import {
  SEASONS,
  seasonForDate,
  nightsBetween,
  extrasBookable,
  extrasTotal,
  nightlyPrices,
  stayTotal,
  priceBreakdown,
  depositAmount,
  balanceAmount,
  bookingCharges,
  guestTaxBreakdown,
  guestTaxTotal,
  payingGuests,
  paymentSplit,
} from "./pricing";

describe("seasonForDate", () => {
  it("erkennt ein Datum in der Mitte einer normalen Saison", () => {
    expect(seasonForDate(new Date("2026-05-15")).label).toBe("01.04. – 30.06.");
  });

  it("erkennt Start- und Enddatum einer Saison als zur Saison gehörig", () => {
    expect(seasonForDate(new Date("2026-01-09")).label).toBe("09.01. – 31.03.");
    expect(seasonForDate(new Date("2026-03-31")).label).toBe("09.01. – 31.03.");
  });

  it("behandelt die jahresübergreifende Saison auf beiden Seiten des Jahreswechsels korrekt", () => {
    expect(seasonForDate(new Date("2026-12-25")).label).toBe("23.12. – 08.01.");
    expect(seasonForDate(new Date("2026-01-03")).label).toBe("23.12. – 08.01.");
  });

  it("schlägt die frühere Lücke (31.08.) der Sommersaison zu", () => {
    expect(seasonForDate(new Date("2026-08-31")).label).toBe("01.07. – 31.08.");
  });

  it("schlägt die spätere Lücke (06.–08.01.) der Wintersaison zu", () => {
    expect(seasonForDate(new Date("2026-01-06"))).toBe(seasonForDate(new Date("2026-01-08")));
    expect(seasonForDate(new Date("2026-01-07")).label).toBe("23.12. – 08.01.");
  });

  it("deckt jeden Tag des Jahres lückenlos ab", () => {
    for (let day = 0; day < 365; day++) {
      const date = new Date(Date.UTC(2026, 0, 1 + day));
      expect(() => seasonForDate(date)).not.toThrow();
    }
  });
});

describe("nightsBetween", () => {
  it("zählt die Nächte zwischen zwei Daten", () => {
    expect(nightsBetween(new Date("2026-08-01"), new Date("2026-08-08"))).toBe(7);
  });

  it("gibt 0 zurück für identische Daten", () => {
    expect(nightsBetween(new Date("2026-08-01"), new Date("2026-08-01"))).toBe(0);
  });
});

describe("SEASONS", () => {
  it("enthält alle sechs Saisonstufen mit positiven Preisen und Mindestaufenthalten", () => {
    expect(SEASONS).toHaveLength(6);
    for (const season of SEASONS) {
      expect(season.pricePerNight).toBeGreaterThan(0);
      expect(season.minNights).toBeGreaterThan(0);
    }
  });
});

describe("extrasBookable", () => {
  const heute = new Date("2026-09-20");

  it("erlaubt Wäsche bei genau einer Woche Vorlauf", () => {
    expect(extrasBookable(new Date("2026-09-27"), heute)).toBe(true);
  });

  it("lehnt Wäsche bei weniger als einer Woche Vorlauf ab", () => {
    expect(extrasBookable(new Date("2026-09-26"), heute)).toBe(false);
  });

  it("erlaubt Wäsche bei weitem Vorlauf", () => {
    expect(extrasBookable(new Date("2027-07-01"), heute)).toBe(true);
  });
});

describe("extrasTotal", () => {
  it("rechnet je Satz ab: Bettwäsche 10 €, Handtücher 5 €", () => {
    expect(extrasTotal({ linens: 2, towels: 4 })).toBe(40);
  });

  it("ist ohne Bestellung null", () => {
    expect(extrasTotal({ linens: 0, towels: 0 })).toBe(0);
  });
});

describe("nightlyPrices / stayTotal", () => {
  it("zählt Nächte, nicht Tage", () => {
    const naechte = nightlyPrices(new Date("2027-07-10"), new Date("2027-07-17"));

    expect(naechte).toHaveLength(7);
    expect(naechte[0]!.date).toEqual(new Date("2027-07-10"));
    expect(naechte.at(-1)!.date).toEqual(new Date("2027-07-16"));
  });

  it("bepreist einen Aufenthalt innerhalb einer Saison", () => {
    // 01.07.–31.08.: 94 € pro Nacht.
    expect(stayTotal(new Date("2027-07-10"), new Date("2027-07-17"))).toBe(7 * 94);
  });

  // Der Fall, den seasonForDate allein falsch gerechnet hätte.
  it("wechselt mitten im Aufenthalt die Saison", () => {
    // 29.08. bis 05.09.: drei Nächte zu 94 € (29., 30., 31.08.),
    // danach fünf Nächte zu 74 € (01.–04.09. und 05.09. ist Abreise).
    const naechte = nightlyPrices(new Date("2027-08-29"), new Date("2027-09-05"));

    expect(naechte).toHaveLength(7);
    expect(naechte.filter((n) => n.price === 94)).toHaveLength(3);
    expect(naechte.filter((n) => n.price === 74)).toHaveLength(4);
    expect(stayTotal(new Date("2027-08-29"), new Date("2027-09-05"))).toBe(
      3 * 94 + 4 * 74,
    );
  });

  it("liefert für einen Aufenthalt ohne Nächte nichts", () => {
    expect(nightlyPrices(new Date("2027-07-10"), new Date("2027-07-10"))).toEqual([]);
    expect(stayTotal(new Date("2027-07-10"), new Date("2027-07-10"))).toBe(0);
  });
});

describe("priceBreakdown", () => {
  it("fasst gleich bepreiste Nächte zu einem Posten zusammen", () => {
    const posten = priceBreakdown(new Date("2027-07-10"), new Date("2027-07-17"));

    expect(posten).toHaveLength(1);
    expect(posten[0]).toMatchObject({ nights: 7, pricePerNight: 94, total: 658 });
  });

  it("trennt bei einem Saisonwechsel in zwei Posten", () => {
    const posten = priceBreakdown(new Date("2027-08-29"), new Date("2027-09-05"));

    expect(posten).toHaveLength(2);
    expect(posten[0]).toMatchObject({ nights: 3, pricePerNight: 94 });
    expect(posten[1]).toMatchObject({ nights: 4, pricePerNight: 74 });
    expect(posten[0]!.total + posten[1]!.total).toBe(stayTotal(new Date("2027-08-29"), new Date("2027-09-05")));
  });
});

describe("Anzahlung", () => {
  it("rechnet 30 Prozent des Mietpreises", () => {
    expect(depositAmount(578)).toBe(173.4);
    expect(balanceAmount(578)).toBe(404.6);
  });

  // Bei ungeraden Beträgen darf getrenntes Runden keine Differenz erzeugen.
  it.each([578, 659, 94, 1234.55, 3])(
    "ergibt zusammen wieder genau die Summe (%s €)",
    (summe) => {
      expect(depositAmount(summe) + balanceAmount(summe)).toBeCloseTo(summe, 2);
    },
  );
});

describe("quoteStay", () => {
  it("rechnet eine Woche Hauptsaison für 4 Personen inkl. Pflicht-Nebenkosten und Gästebeitrag", async () => {
    const { quoteStay } = await import("./pricing");
    const quote = quoteStay(new Date("2027-07-10"), new Date("2027-07-17"), {
      guests: 4,
      linens: 0,
      towels: 0,
    });
    expect(quote.nights).toBe(7);
    expect(quote.rent).toBe(658);
    // 7 Nächte × 3,50 € × 4 Personen, ohne Angabe keine Kinder
    expect(quote.guestTax).toBe(98);
    expect(quote.total).toBe(658 + 98 + 85);
    // 30 % von Miete + Gästebeitrag (756 €)
    expect(quote.deposit).toBe(226.8);
  });

  it("rechnet den Gästebeitrag nur für Personen ab 14 Jahren", async () => {
    const { quoteStay } = await import("./pricing");
    const quote = quoteStay(new Date("2027-07-10"), new Date("2027-07-17"), {
      guests: 4,
      guestsUnder14: 2,
      linens: 0,
      towels: 0,
    });
    expect(quote.guestTax).toBe(49);
    expect(quote.guestTaxLines).toEqual([
      { season: "main", nights: 7, persons: 2, rate: 3.5, total: 49 },
    ]);
    expect(quote.deposit).toBe(depositAmount(658 + 49));
  });

  it("zählt bestellte Wäsche in den Gesamtpreis, nicht in die Anzahlung", async () => {
    const { quoteStay } = await import("./pricing");
    const quote = quoteStay(new Date("2027-07-10"), new Date("2027-07-17"), {
      guests: 2,
      linens: 2,
      towels: 1,
    });
    expect(quote.extras).toBe(25);
    expect(quote.total).toBe(658 + 49 + 85 + 25);
    expect(quote.deposit).toBe(212.1);
  });

  it("wechselt den Gästebeitrag an der Saisongrenze am 15.03.", async () => {
    const { guestTaxPerNight } = await import("./pricing");
    expect(guestTaxPerNight(new Date("2027-03-14"))).toBe(1.8);
    expect(guestTaxPerNight(new Date("2027-03-15"))).toBe(3.5);
    expect(guestTaxPerNight(new Date("2027-10-31"))).toBe(3.5);
    expect(guestTaxPerNight(new Date("2027-11-01"))).toBe(1.8);
  });
});

describe("Gästebeitrag je Buchung", () => {
  it("zählt als zahlende Personen alle ab 14 Jahren", () => {
    expect(payingGuests({ guests: 4, guestsUnder14: 3 })).toBe(1);
    expect(payingGuests({ guests: 2, guestsUnder14: 0 })).toBe(2);
  });

  it.each([undefined, null])("zählt Altbestand ohne Kinderangabe (%s) als 0 Kinder", (guestsUnder14) => {
    expect(payingGuests({ guests: 3, guestsUnder14 })).toBe(3);
    expect(guestTaxTotal(new Date("2027-07-10"), new Date("2027-07-17"), { guests: 3, guestsUnder14 })).toBe(73.5);
  });

  it("trennt beim Saisonwechsel am 15.03. und bepreist jede Nacht mit ihrem Satz", () => {
    // Nächte 12., 13., 14.03. Nebensaison, 15. und 16.03. Hauptsaison.
    const posten = guestTaxBreakdown(new Date("2027-03-12"), new Date("2027-03-17"), {
      guests: 3,
      guestsUnder14: 1,
    });
    expect(posten).toEqual([
      { season: "off", nights: 3, persons: 2, rate: 1.8, total: 10.8 },
      { season: "main", nights: 2, persons: 2, rate: 3.5, total: 14 },
    ]);
    expect(guestTaxTotal(new Date("2027-03-12"), new Date("2027-03-17"), { guests: 3, guestsUnder14: 1 })).toBe(24.8);
  });

  it("trennt beim Saisonwechsel am 01.11.", () => {
    const posten = guestTaxBreakdown(new Date("2027-10-30"), new Date("2027-11-02"), { guests: 1 });
    expect(posten.map((p) => [p.season, p.nights])).toEqual([
      ["main", 2],
      ["off", 1],
    ]);
  });

  it("rundet auf volle Cent ohne Gleitkommareste", () => {
    // 3 × 1,80 € × 7 = 37,80 € – als Gleitkommazahl 37.800000000000004.
    expect(guestTaxTotal(new Date("2027-01-10"), new Date("2027-01-17"), { guests: 3 })).toBe(37.8);
    // Über den Saisonwechsel: 2 × 3,50 € × 2 + 2 × 1,80 € × 1 = 17,60 €.
    expect(guestTaxTotal(new Date("2027-10-30"), new Date("2027-11-02"), { guests: 2 })).toBe(17.6);
  });

  it("ergibt ohne zahlende Personen keinen Posten", () => {
    expect(guestTaxBreakdown(new Date("2027-07-10"), new Date("2027-07-17"), { guests: 1, guestsUnder14: 1 })).toEqual([]);
  });
});

describe("Anzahlung und Rest aus Miete und Gästebeitrag", () => {
  it("rechnet das Beispiel der alten Vorlage: 537 € Miete + 63 € Gästebeitrag → 180 € Anzahlung", () => {
    expect(paymentSplit(537, 63)).toEqual({ total: 600, deposit: 180, balance: 420 });
  });

  it.each([
    [578, 49],
    [370, 28.2],
    [94, 1.8],
    [1234.55, 37.8],
  ])("ergibt zusammen wieder genau die Summe (%s € + %s €)", (rent, tax) => {
    const { total, deposit, balance } = paymentSplit(rent, tax);
    expect(total).toBeCloseTo(rent + tax, 2);
    expect(deposit + balance).toBeCloseTo(total, 2);
  });

  it("fasst eine Buchung zusammen wie die Rechnung: Miete, Gästebeitrag, Zahlung", () => {
    const charges = bookingCharges({
      startDate: new Date("2027-08-29"),
      endDate: new Date("2027-09-05"),
      guests: 3,
      guestsUnder14: 1,
    });
    expect(charges.rent).toBe(578);
    expect(charges.guestTax).toBe(49);
    expect(charges.total).toBe(627);
    expect(charges.deposit).toBe(188.1);
    expect(charges.balance).toBe(438.9);
  });
});
