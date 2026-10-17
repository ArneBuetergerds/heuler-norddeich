import { describe, it, expect } from "vitest";
import { stayForDay } from "./stayForDay";
import type { Occupancy, Stay } from "./occupancy";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const stay = (id: number, start: string, end: string, bookingRequestId: number | null = id): Stay => ({
  id,
  startDate: d(start),
  endDate: d(end),
  guestName: `Gast ${id}`,
  bookingRequestId,
});

// Gast 1: 10.–15.05., Gast 2: 15.–18.05. (Wechseltag 15.), Gast 3 manuell
// 25.–27.05., Sperrzeitraum 20.–22.05.
const occupancy: Occupancy = {
  stays: [stay(1, "2027-05-10", "2027-05-15"), stay(2, "2027-05-15", "2027-05-18"), stay(3, "2027-05-25", "2027-05-27", null)],
  maintenance: [{ id: 9, startDate: d("2027-05-20"), endDate: d("2027-05-22"), note: "Maler" }],
};

describe("stayForDay", () => {
  it("öffnet an einem freien Tag nichts", () => {
    expect(stayForDay(d("2027-05-05"), occupancy)).toBeNull();
  });

  it("öffnet an Sperrtagen ohne Gast nichts", () => {
    expect(stayForDay(d("2027-05-20"), occupancy)).toBeNull();
    expect(stayForDay(d("2027-05-21"), occupancy)).toBeNull();
  });

  it("findet den Gast am Anreisetag und mitten im Aufenthalt", () => {
    expect(stayForDay(d("2027-05-10"), occupancy)?.id).toBe(1);
    expect(stayForDay(d("2027-05-12"), occupancy)?.id).toBe(1);
  });

  it("gibt am Wechseltag den anreisenden Gast zurück", () => {
    expect(stayForDay(d("2027-05-15"), occupancy)?.id).toBe(2);
  });

  it("gibt an einem reinen Abreisetag den abreisenden Gast zurück", () => {
    expect(stayForDay(d("2027-05-18"), occupancy)?.id).toBe(2);
  });

  it("findet auch manuell eingetragene Aufenthalte", () => {
    expect(stayForDay(d("2027-05-26"), occupancy)?.id).toBe(3);
  });

  it("bleibt unabhängig von der Reihenfolge der Aufenthalte", () => {
    const reversed: Occupancy = { ...occupancy, stays: [...occupancy.stays].reverse() };
    expect(stayForDay(d("2027-05-15"), reversed)?.id).toBe(2);
  });

  it("macht jeden Aufenthalt über seinen Anreisetag erreichbar", () => {
    for (const entry of occupancy.stays) {
      expect(stayForDay(entry.startDate, occupancy)).toBe(entry);
    }
  });
});
