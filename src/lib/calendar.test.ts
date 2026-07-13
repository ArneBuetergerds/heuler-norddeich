import { describe, it, expect } from "vitest";
import { isDateBlocked } from "./calendar";

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
