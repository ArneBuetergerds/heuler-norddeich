import { describe, it, expect } from "vitest";
import { staysForDay, stayRoleOnDay } from "./stayForDay";
import type { Occupancy, Stay } from "./occupancy";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const stay = (id: number, start: string, end: string, bookingRequestId: number | null = id): Stay => ({
  id,
  startDate: d(start),
  endDate: d(end),
  guestName: `Gast ${id}`,
  bookingRequestId,
});

const ids = (stays: Stay[]) => stays.map((entry) => entry.id);

// Gast 1: 10.–15.05., Gast 2: 15.–18.05. (Wechseltag 15.), Gast 3 manuell
// 25.–27.05., Gast 4 manuell 27.–29.05. (Wechseltag 27., beide manuell),
// Sperrzeitraum 20.–22.05.
const occupancy: Occupancy = {
  stays: [
    stay(1, "2027-05-10", "2027-05-15"),
    stay(2, "2027-05-15", "2027-05-18"),
    stay(3, "2027-05-25", "2027-05-27", null),
    stay(4, "2027-05-27", "2027-05-29", null),
  ],
  maintenance: [{ id: 9, startDate: d("2027-05-20"), endDate: d("2027-05-22"), note: "Maler" }],
};

describe("staysForDay", () => {
  it("liefert an einem freien Tag nichts", () => {
    expect(staysForDay(d("2027-05-05"), occupancy)).toEqual([]);
  });

  it("liefert an Sperrtagen ohne Gast nichts", () => {
    expect(staysForDay(d("2027-05-20"), occupancy)).toEqual([]);
    expect(staysForDay(d("2027-05-21"), occupancy)).toEqual([]);
  });

  it("findet den Gast am Anreisetag und mitten im Aufenthalt", () => {
    expect(ids(staysForDay(d("2027-05-10"), occupancy))).toEqual([1]);
    expect(ids(staysForDay(d("2027-05-12"), occupancy))).toEqual([1]);
  });

  it("liefert am Wechseltag beide Gäste, den abreisenden zuerst", () => {
    expect(ids(staysForDay(d("2027-05-15"), occupancy))).toEqual([1, 2]);
  });

  it("liefert an einem reinen Abreisetag nur den abreisenden Gast", () => {
    expect(ids(staysForDay(d("2027-05-18"), occupancy))).toEqual([2]);
  });

  it("findet auch manuell eingetragene Aufenthalte, auch am Wechseltag", () => {
    expect(ids(staysForDay(d("2027-05-26"), occupancy))).toEqual([3]);
    expect(ids(staysForDay(d("2027-05-27"), occupancy))).toEqual([3, 4]);
  });

  it("bleibt unabhängig von der Reihenfolge der Aufenthalte", () => {
    const reversed: Occupancy = { ...occupancy, stays: [...occupancy.stays].reverse() };
    expect(ids(staysForDay(d("2027-05-15"), reversed))).toEqual([1, 2]);
    expect(ids(staysForDay(d("2027-05-27"), reversed))).toEqual([3, 4]);
  });

  it("macht jeden Aufenthalt an seinem An- und Abreisetag erreichbar", () => {
    for (const entry of occupancy.stays) {
      expect(staysForDay(entry.startDate, occupancy)).toContain(entry);
      expect(staysForDay(entry.endDate, occupancy)).toContain(entry);
    }
  });
});

describe("stayRoleOnDay", () => {
  it("benennt Abreise, Anreise und die Tage dazwischen", () => {
    const [first, second] = occupancy.stays;
    expect(stayRoleOnDay(first, d("2027-05-15"))).toBe("Abreise");
    expect(stayRoleOnDay(second, d("2027-05-15"))).toBe("Anreise");
    expect(stayRoleOnDay(first, d("2027-05-12"))).toBe("Aufenthalt");
  });
});
