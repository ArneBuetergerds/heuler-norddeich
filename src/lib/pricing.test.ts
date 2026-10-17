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
  it("rechnet eine Woche Hauptsaison für 4 Personen inkl. Pflicht-Nebenkosten", async () => {
    const { quoteStay } = await import("./pricing");
    const quote = quoteStay(new Date("2027-07-10"), new Date("2027-07-17"), {
      guests: 4,
      linens: 0,
      towels: 0,
    });
    expect(quote.nights).toBe(7);
    expect(quote.rent).toBe(658);
    expect(quote.total).toBe(743);
    expect(quote.deposit).toBe(197.4);
    // 7 Nächte × 3,50 € × 4 Personen
    expect(quote.guestTaxMax).toBe(98);
  });

  it("zählt bestellte Wäsche in den Gesamtpreis, nicht in die Anzahlung", async () => {
    const { quoteStay } = await import("./pricing");
    const quote = quoteStay(new Date("2027-07-10"), new Date("2027-07-17"), {
      guests: 2,
      linens: 2,
      towels: 1,
    });
    expect(quote.extras).toBe(25);
    expect(quote.total).toBe(658 + 85 + 25);
    expect(quote.deposit).toBe(197.4);
  });

  it("wechselt den Gästebeitrag an der Saisongrenze am 15.03.", async () => {
    const { guestTaxPerNight } = await import("./pricing");
    expect(guestTaxPerNight(new Date("2027-03-14"))).toBe(1.8);
    expect(guestTaxPerNight(new Date("2027-03-15"))).toBe(3.5);
    expect(guestTaxPerNight(new Date("2027-10-31"))).toBe(3.5);
    expect(guestTaxPerNight(new Date("2027-11-01"))).toBe(1.8);
  });
});
