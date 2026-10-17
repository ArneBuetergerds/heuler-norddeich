import { describe, it, expect } from "vitest";
import {
  addMonths,
  adminMonthLinks,
  adminOverviewHref,
  formatMonthLabel,
  formatMonthParam,
  monthWindow,
  parseMonthParam,
  resolveMonth,
  startOfUtcMonth,
} from "./month";

// Kurz vor Mitternacht UTC am Monatsletzten: Der Monat richtet sich nach UTC,
// wie im Kalender, nicht nach der Uhrzeit in Deutschland.
const today = new Date("2026-10-31T23:30:00Z");

describe("startOfUtcMonth und addMonths", () => {
  it("liefert den Ersten als UTC-Mitternacht", () => {
    expect(startOfUtcMonth(today)).toEqual(new Date("2026-10-01"));
  });

  it("blättert über den Jahreswechsel vor und zurück", () => {
    expect(addMonths(new Date("2026-12-01"), 1)).toEqual(new Date("2027-01-01"));
    expect(addMonths(new Date("2027-01-01"), -1)).toEqual(new Date("2026-12-01"));
  });
});

describe("parseMonthParam", () => {
  it("liest JJJJ-MM als Ersten des Monats", () => {
    expect(parseMonthParam("2027-01", today)).toEqual(new Date("2027-01-01"));
    expect(parseMonthParam("2026-12", today)).toEqual(new Date("2026-12-01"));
  });

  it.each([
    ["fehlt", undefined],
    ["mehrfach angegeben", ["2026-10", "2026-11"]],
    ["leer", ""],
    ["Monat 13", "2026-13"],
    ["Monat 00", "2026-00"],
    ["ohne führende Null", "2026-1"],
    ["mit Tag", "2026-10-01"],
    ["kein Datum", "oktober"],
    ["mit Leerzeichen", " 2026-10"],
    ["Jahr 0000", "0000-01"],
    ["zu weit zurück", "2016-09"],
    ["zu weit voraus", "2036-11"],
  ])("ist ungültig: %s", (_fall, value) => {
    expect(parseMonthParam(value, today)).toBeNull();
  });

  it("nimmt die Grenzen selbst noch an", () => {
    expect(parseMonthParam("2016-10", today)).toEqual(new Date("2016-10-01"));
    expect(parseMonthParam("2036-10", today)).toEqual(new Date("2036-10-01"));
  });
});

describe("resolveMonth", () => {
  it("fällt bei fehlendem oder ungültigem Monat auf den aktuellen zurück", () => {
    expect(resolveMonth(undefined, today)).toEqual(new Date("2026-10-01"));
    expect(resolveMonth("2026-13", today)).toEqual(new Date("2026-10-01"));
  });

  it("nimmt einen gültigen Monat aus der Adresse", () => {
    expect(resolveMonth("2025-03", today)).toEqual(new Date("2025-03-01"));
  });
});

describe("formatMonthParam und formatMonthLabel", () => {
  it("schreibt den Monat zweistellig", () => {
    expect(formatMonthParam(new Date("2027-01-01"))).toBe("2027-01");
    expect(formatMonthParam(new Date("2026-12-01"))).toBe("2026-12");
  });

  it("benennt den Monat auf Deutsch", () => {
    expect(formatMonthLabel(new Date("2026-03-01"))).toBe("März 2026");
  });
});

describe("monthWindow", () => {
  it("beginnt am Vortag des Ersten und endet exklusiv am Ersten des Folgemonats", () => {
    expect(monthWindow(new Date("2026-10-01"))).toEqual({
      start: new Date("2026-09-30"),
      end: new Date("2026-11-01"),
    });
  });

  it("überquert den Jahreswechsel", () => {
    expect(monthWindow(new Date("2027-01-01"))).toEqual({
      start: new Date("2026-12-31"),
      end: new Date("2027-02-01"),
    });
    expect(monthWindow(new Date("2026-12-01"))).toEqual({
      start: new Date("2026-11-30"),
      end: new Date("2027-01-01"),
    });
  });

  it("kennt den Schalttag", () => {
    expect(monthWindow(new Date("2028-03-01")).start).toEqual(new Date("2028-02-29"));
  });
});

describe("adminOverviewHref", () => {
  it("lässt den aktuellen Monat weg", () => {
    expect(
      adminOverviewHref({ month: new Date("2026-10-01"), today, showAllHistory: false }),
    ).toBe("/admin");
  });

  it("behält die ganze Historie beim Blättern", () => {
    expect(
      adminOverviewHref({ month: new Date("2027-01-01"), today, showAllHistory: true }),
    ).toBe("/admin?monat=2027-01&historie=alle");
    expect(
      adminOverviewHref({ month: new Date("2026-10-01"), today, showAllHistory: true }),
    ).toBe("/admin?historie=alle");
  });
});

describe("adminMonthLinks", () => {
  it("verlinkt Vor- und Folgemonat über den Jahreswechsel", () => {
    expect(adminMonthLinks(new Date("2026-12-01"), today, false)).toEqual({
      month: new Date("2026-12-01"),
      previousHref: "/admin?monat=2026-11",
      nextHref: "/admin?monat=2027-01",
      currentHref: "/admin",
    });
  });

  it("verlinkt den aktuellen Monat nicht auf sich selbst", () => {
    const links = adminMonthLinks(new Date("2026-10-01"), today, true);

    expect(links.currentHref).toBeNull();
    expect(links.previousHref).toBe("/admin?monat=2026-09&historie=alle");
    expect(links.nextHref).toBe("/admin?monat=2026-11&historie=alle");
  });

  it("blättert nicht über die Grenzen hinaus", () => {
    expect(adminMonthLinks(new Date("2016-10-01"), today, false).previousHref).toBeNull();
    expect(adminMonthLinks(new Date("2036-10-01"), today, false).nextHref).toBeNull();
  });
});
