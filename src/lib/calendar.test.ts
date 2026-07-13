import { describe, it, expect } from "vitest";
import { isDateBlocked, buildMonthDays } from "./calendar";

describe("isDateBlocked", () => {
  const periods = [
    { startDate: new Date("2026-08-05"), endDate: new Date("2026-08-10") },
  ];

  it("gibt true zurück für ein Datum innerhalb eines gesperrten Zeitraums", () => {
    expect(isDateBlocked(new Date("2026-08-07"), periods)).toBe(true);
  });

  it("gibt false zurück für den Abreisetag (Half-Open-Intervall)", () => {
    expect(isDateBlocked(new Date("2026-08-10"), periods)).toBe(false);
  });

  it("gibt false zurück für ein Datum außerhalb aller Zeiträume", () => {
    expect(isDateBlocked(new Date("2026-09-01"), periods)).toBe(false);
  });
});

describe("buildMonthDays (Regression: UTC- statt Lokalzeit-Konstruktion)", () => {
  it("erzeugt Tage als UTC-Mitternacht, konsistent mit aus der DB geladenen Sperrzeiträumen", () => {
    // Drizzle `date`-Spalten (mode: "date") parsen "2026-08-01" als UTC-
    // Mitternacht. Vor dem Fix wurden Kalendertage mit `new Date(year, month, i+1)`
    // (Lokalzeit) gebaut - für Besucher mit positivem UTC-Offset (z.B. Deutschland)
    // lag der 1. lokale Mitternacht dann VOR der UTC-Mitternacht des Sperrzeitraum-
    // Starts, wodurch isDateBlocked den ersten gesperrten Tag fälschlich als frei
    // auswies.
    const days = buildMonthDays(2026, 7); // August 2026 (0-indexiert)
    const blockedPeriods = [
      { startDate: new Date("2026-08-01T00:00:00Z"), endDate: new Date("2026-08-03T00:00:00Z") },
    ];

    const firstDay = days[0];
    expect(firstDay.getTime()).toBe(new Date("2026-08-01T00:00:00Z").getTime());
    expect(isDateBlocked(firstDay, blockedPeriods)).toBe(true);

    const secondDay = days[1];
    expect(isDateBlocked(secondDay, blockedPeriods)).toBe(true);

    const thirdDay = days[2];
    expect(isDateBlocked(thirdDay, blockedPeriods)).toBe(false);
  });

  it("erzeugt die korrekte Anzahl an Tagen für den Monat", () => {
    expect(buildMonthDays(2026, 7)).toHaveLength(31); // August
    expect(buildMonthDays(2026, 1)).toHaveLength(28); // Februar 2026 (kein Schaltjahr)
  });
});
