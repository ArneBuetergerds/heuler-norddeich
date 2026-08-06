import { describe, it, expect } from "vitest";
import { SEASONS, seasonForDate, nightsBetween } from "./pricing";

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
