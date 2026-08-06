import { describe, it, expect } from "vitest";
import { bookingRequestSchema } from "./validation";

const base = {
  name: "Erika Musterfrau",
  email: "erika@example.invalid",
};

describe("bookingRequestSchema", () => {
  it("akzeptiert eine Anfrage, die den Mindestaufenthalt der Saison erreicht", () => {
    // 01.07.–31.08.: Mindestaufenthalt 7 Nächte.
    const result = bookingRequestSchema.safeParse({
      ...base,
      startDate: "2027-07-10",
      endDate: "2027-07-17",
    });

    expect(result.success).toBe(true);
  });

  it("lehnt eine Anfrage ab, die den Mindestaufenthalt der Saison unterschreitet", () => {
    const result = bookingRequestSchema.safeParse({
      ...base,
      startDate: "2027-07-10",
      endDate: "2027-07-14",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join(".") === "endDate");
      expect(issue?.message).toContain("mindestens 7 Nächte");
    }
  });

  it("wendet den Mindestaufenthalt der Saison des Anreisedatums an", () => {
    // 05.11.–22.12.: Mindestaufenthalt 3 Nächte.
    const result = bookingRequestSchema.safeParse({
      ...base,
      startDate: "2027-11-10",
      endDate: "2027-11-13",
    });

    expect(result.success).toBe(true);
  });

  it("verlangt in einer Saison mit kürzerem Mindestaufenthalt entsprechend weniger Nächte", () => {
    // 09.01.–31.03.: Mindestaufenthalt 3 Nächte.
    const result = bookingRequestSchema.safeParse({
      ...base,
      startDate: "2027-02-10",
      endDate: "2027-02-13",
    });

    expect(result.success).toBe(true);
  });

  it("lehnt ein Abreisedatum vor dem Anreisedatum ab", () => {
    const result = bookingRequestSchema.safeParse({
      ...base,
      startDate: "2027-07-17",
      endDate: "2027-07-10",
    });

    expect(result.success).toBe(false);
  });

  it("lehnt ein Anreisedatum in der Vergangenheit ab", () => {
    const result = bookingRequestSchema.safeParse({
      ...base,
      startDate: "2020-01-01",
      endDate: "2020-01-10",
    });

    expect(result.success).toBe(false);
  });
});
