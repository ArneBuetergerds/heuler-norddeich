import { describe, it, expect } from "vitest";
import { rangesOverlap } from "./dateRange";

describe("rangesOverlap", () => {
  it("erkennt eine Überschneidung, wenn sich zwei Zeiträume schneiden", () => {
    const result = rangesOverlap(
      new Date("2026-08-01"),
      new Date("2026-08-10"),
      new Date("2026-08-05"),
      new Date("2026-08-15"),
    );
    expect(result).toBe(true);
  });

  it("erkennt keine Überschneidung bei direkt aneinandergrenzenden Zeiträumen", () => {
    const result = rangesOverlap(
      new Date("2026-08-01"),
      new Date("2026-08-10"),
      new Date("2026-08-10"),
      new Date("2026-08-15"),
    );
    expect(result).toBe(false);
  });

  it("erkennt keine Überschneidung bei komplett getrennten Zeiträumen", () => {
    const result = rangesOverlap(
      new Date("2026-08-01"),
      new Date("2026-08-05"),
      new Date("2026-09-01"),
      new Date("2026-09-05"),
    );
    expect(result).toBe(false);
  });
});
