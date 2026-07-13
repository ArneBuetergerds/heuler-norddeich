import { describe, it, expect } from "vitest";
import { isRangeAvailable } from "./booking";

describe("isRangeAvailable", () => {
  const periods = [
    { startDate: new Date("2026-08-05"), endDate: new Date("2026-08-10") },
  ];

  it("gibt false zurück, wenn der Zeitraum einen gesperrten Zeitraum überschneidet", () => {
    expect(
      isRangeAvailable(periods, new Date("2026-08-08"), new Date("2026-08-12")),
    ).toBe(false);
  });

  it("gibt true zurück, wenn der Zeitraum frei ist", () => {
    expect(
      isRangeAvailable(periods, new Date("2026-09-01"), new Date("2026-09-05")),
    ).toBe(true);
  });
});
