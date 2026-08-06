import { describe, it, expect } from "vitest";
import { isDateBlocked, dayOccupancy, buildMonthDays, buildCalendarGrid } from "./calendar";

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

describe("dayOccupancy", () => {
  const stayA = { startDate: new Date("2026-08-05"), endDate: new Date("2026-08-10") };

  it("gibt \"free\" zurück, wenn kein Zeitraum den Tag berührt", () => {
    expect(dayOccupancy(new Date("2026-08-15"), [stayA], [])).toBe("free");
  });

  it("gibt \"occupied\" zurück für einen Tag mitten in einem Aufenthalt", () => {
    expect(dayOccupancy(new Date("2026-08-07"), [stayA], [])).toBe("occupied");
  });

  it("gibt \"occupied\" zurück für einen Tag in einem Sperrzeitraum", () => {
    const maintenance = [
      { startDate: new Date("2026-08-20"), endDate: new Date("2026-08-23") },
    ];

    expect(dayOccupancy(new Date("2026-08-21"), [], maintenance)).toBe("occupied");
  });

  it("gibt \"departure\" zurück für den Abreisetag eines Aufenthalts", () => {
    expect(dayOccupancy(new Date("2026-08-10"), [stayA], [])).toBe("departure");
  });

  it("gibt \"arrival\" zurück für den Anreisetag nach einem freien Vortag", () => {
    const stayB = { startDate: new Date("2026-08-20"), endDate: new Date("2026-08-25") };

    expect(dayOccupancy(new Date("2026-08-20"), [stayB], [])).toBe("arrival");
  });

  it("gibt \"arrival\" zurück, wenn der Vortag der Abreisetag eines anderen Aufenthalts ohne Anschlussbuchung war", () => {
    // stayA endet 2026-08-10, stayC beginnt erst zwei Tage später – kein
    // direkter Anschluss, 2026-08-10 selbst bleibt ein reiner Abreisetag.
    const stayC = { startDate: new Date("2026-08-12"), endDate: new Date("2026-08-15") };

    expect(dayOccupancy(new Date("2026-08-12"), [stayA, stayC], [])).toBe("arrival");
  });

  it("gibt \"occupied\" zurück, statt \"arrival\", wenn der Vortag in einem Sperrzeitraum liegt", () => {
    const stayB = { startDate: new Date("2026-08-20"), endDate: new Date("2026-08-25") };
    const maintenance = [
      { startDate: new Date("2026-08-15"), endDate: new Date("2026-08-20") },
    ];

    expect(dayOccupancy(new Date("2026-08-20"), [stayB], maintenance)).toBe("occupied");
  });

  it("gibt \"occupied\" zurück, wenn am selben Tag ein Aufenthalt endet und der nächste beginnt", () => {
    const stayB = { startDate: new Date("2026-08-10"), endDate: new Date("2026-08-15") };

    expect(dayOccupancy(new Date("2026-08-10"), [stayA, stayB], [])).toBe("occupied");
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

describe("buildCalendarGrid", () => {
  it("richtet den Monatsersten unter seinem Wochentag aus", () => {
    // Der 1. August 2026 ist ein Samstag: fünf Leerzellen (Mo–Fr) davor.
    const grid = buildCalendarGrid(2026, 7);

    expect(grid.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(grid[5]).toEqual(new Date("2026-08-01T00:00:00Z"));
  });

  it("beginnt ohne Leerzelle, wenn der Monat auf einen Montag fällt", () => {
    // Der 1. Juni 2026 ist ein Montag.
    const grid = buildCalendarGrid(2026, 5);

    expect(grid[0]).toEqual(new Date("2026-06-01T00:00:00Z"));
  });

  it("liefert immer 42 Zellen und füllt den Rest mit Leerzellen", () => {
    const grid = buildCalendarGrid(2026, 1); // Februar 2026, 28 Tage ab Sonntag

    expect(grid).toHaveLength(42);
    expect(grid.filter((day) => day !== null)).toHaveLength(28);
    expect(grid.at(-1)).toBeNull();
  });
});
