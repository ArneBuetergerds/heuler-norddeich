import { describe, it, expect } from "vitest";
import { groupByDay } from "./groupByDay";

const today = new Date("2026-10-17T00:00:00Z");

describe("groupByDay", () => {
  it("liefert für eine leere Liste keine Gruppen", () => {
    expect(groupByDay([], today)).toEqual([]);
  });

  it("fasst Einträge desselben Tages zusammen und behält ihre Reihenfolge", () => {
    const entries = [
      { id: 1, date: new Date("2026-10-17") },
      { id: 2, date: new Date("2026-10-20") },
      { id: 3, date: new Date("2026-10-17") },
    ];
    const groups = groupByDay(entries, today);
    expect(groups.map((group) => group.entries.map((entry) => entry.id))).toEqual([[1, 3], [2]]);
    expect(groups.map((group) => group.date)).toEqual([
      new Date("2026-10-17"),
      new Date("2026-10-20"),
    ]);
  });

  it("sortiert die Gruppen nach Tag, auch bei unsortierter Eingabe", () => {
    const entries = [
      { id: 1, date: new Date("2026-12-01") },
      { id: 2, date: new Date("2026-10-18") },
      { id: 3, date: new Date("2027-01-01") },
    ];
    expect(groupByDay(entries, today).map((group) => group.entries[0]?.id)).toEqual([2, 1, 3]);
  });

  it("markiert nur die Gruppe von heute", () => {
    const entries = [
      { id: 1, date: new Date("2026-10-17") },
      { id: 2, date: new Date("2026-10-18") },
    ];
    expect(groupByDay(entries, today).map((group) => group.isToday)).toEqual([true, false]);
  });

  it("vergleicht nach Kalendertag, nicht nach Uhrzeit", () => {
    const entries = [
      { id: 1, date: new Date("2026-10-17T00:00:00Z") },
      { id: 2, date: new Date("2026-10-17T15:30:00Z") },
    ];
    const groups = groupByDay(entries, new Date("2026-10-17T22:00:00Z"));
    expect(groups).toHaveLength(1);
    expect(groups[0]?.isToday).toBe(true);
    expect(groups[0]?.date).toEqual(new Date("2026-10-17"));
  });
});
