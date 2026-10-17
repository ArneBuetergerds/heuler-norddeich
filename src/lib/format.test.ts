import { describe, it, expect } from "vitest";
import { berlinIsoDate, berlinYear, formatBerlinDateTime, formatDate } from "./format";

describe("berlinIsoDate", () => {
  it("rechnet im Winter mit UTC+1: 31.12., 23:30 UTC ist der 1.1. in Deutschland", () => {
    expect(berlinIsoDate(new Date("2027-12-31T23:30:00Z"))).toBe("2028-01-01");
    expect(berlinYear(new Date("2027-12-31T23:30:00Z"))).toBe(2028);
  });

  it("bleibt bis 23:59 Uhr deutscher Zeit am alten Tag", () => {
    expect(berlinIsoDate(new Date("2027-12-31T22:59:00Z"))).toBe("2027-12-31");
    expect(berlinYear(new Date("2027-12-31T22:59:00Z"))).toBe(2027);
  });

  it("rechnet im Sommer mit UTC+2", () => {
    expect(berlinIsoDate(new Date("2027-06-30T22:30:00Z"))).toBe("2027-07-01");
    expect(berlinIsoDate(new Date("2027-06-30T21:59:00Z"))).toBe("2027-06-30");
  });

  it("schreibt Monat und Tag zweistellig", () => {
    expect(berlinIsoDate(new Date("2027-02-03T12:00:00Z"))).toBe("2027-02-03");
  });
});

describe("formatDate", () => {
  it("bleibt für date-Spalten (UTC-Mitternacht) in UTC", () => {
    expect(formatDate(new Date("2027-08-01"))).toBe("01.08.2027");
  });
});

describe("formatBerlinDateTime", () => {
  it("zeigt den Zeitpunkt in deutscher Zeit, Winter wie Sommer", () => {
    expect(formatBerlinDateTime(new Date("2027-03-01T09:01:00Z"))).toBe("01.03.2027, 10:01 Uhr");
    expect(formatBerlinDateTime(new Date("2027-07-31T22:30:00Z"))).toBe("01.08.2027, 00:30 Uhr");
  });
});
