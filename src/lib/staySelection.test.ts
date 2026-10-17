import { describe, it, expect } from "vitest";
import { isSelectable, nextStaySelection } from "./staySelection";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const today = d("2027-05-01");

// Belegt 10.–15.05. (Abreise am 15.), ein Sperrzeitraum 20.–22.05.
const occupancy = {
  stays: [{ startDate: d("2027-05-10"), endDate: d("2027-05-15") }],
  maintenance: [{ startDate: d("2027-05-20"), endDate: d("2027-05-22") }],
};

describe("nextStaySelection", () => {
  it("beginnt mit dem ersten Klick eine Anreise", () => {
    expect(nextStaySelection(undefined, d("2027-05-03"), occupancy, today)).toEqual({
      from: d("2027-05-03"),
    });
  });

  it("macht einen späteren Tag zur Abreise", () => {
    expect(
      nextStaySelection({ from: d("2027-05-03") }, d("2027-05-07"), occupancy, today),
    ).toEqual({ from: d("2027-05-03"), to: d("2027-05-07") });
  });

  it("erlaubt die Abreise am Anreisetag des nächsten Gasts (Übergabetag)", () => {
    expect(
      nextStaySelection({ from: d("2027-05-03") }, d("2027-05-10"), occupancy, today),
    ).toEqual({ from: d("2027-05-03"), to: d("2027-05-10") });
  });

  it("springt nicht über eine Belegung – der Klick dahinter wird neue Anreise", () => {
    expect(
      nextStaySelection({ from: d("2027-05-03") }, d("2027-05-17"), occupancy, today),
    ).toEqual({ from: d("2027-05-17") });
  });

  it("ersetzt die Anreise bei einem früheren Tag", () => {
    expect(
      nextStaySelection({ from: d("2027-05-06") }, d("2027-05-04"), occupancy, today),
    ).toEqual({ from: d("2027-05-04") });
  });

  it("beginnt nach vollständigem Zeitraum neu", () => {
    expect(
      nextStaySelection(
        { from: d("2027-05-03"), to: d("2027-05-07") },
        d("2027-05-16"),
        occupancy,
        today,
      ),
    ).toEqual({ from: d("2027-05-16") });
  });

  it("ignoriert belegte und vergangene Tage", () => {
    const current = { from: d("2027-05-03"), to: d("2027-05-07") };
    expect(nextStaySelection(current, d("2027-05-12"), occupancy, today)).toBe(current);
    expect(nextStaySelection(current, d("2027-04-20"), occupancy, today)).toBe(current);
  });

  it("erlaubt den Abreisetag eines anderen Gasts als Anreise", () => {
    expect(nextStaySelection(undefined, d("2027-05-15"), occupancy, today)).toEqual({
      from: d("2027-05-15"),
    });
  });
});

describe("isSelectable", () => {
  it("sperrt den Anreisetag eines anderen Gasts als eigene Anreise", () => {
    expect(isSelectable(undefined, d("2027-05-10"), occupancy, today)).toBe(false);
  });

  it("erlaubt ihn als Abreise", () => {
    expect(isSelectable({ from: d("2027-05-03") }, d("2027-05-10"), occupancy, today)).toBe(true);
  });
});
