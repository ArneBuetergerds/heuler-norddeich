import { describe, it, expect } from "vitest";
import { isRangeAvailable, latestCheckout } from "./booking";

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

describe("latestCheckout", () => {
  const stay = (from: string, to: string) => ({
    startDate: new Date(from),
    endDate: new Date(to),
  });

  it("liefert den Beginn des nächsten belegten Zeitraums", () => {
    const periods = [stay("2027-05-08", "2027-05-15"), stay("2027-06-01", "2027-06-08")];

    expect(latestCheckout(periods, new Date("2027-05-01"))).toEqual(
      new Date("2027-05-08"),
    );
  });

  it("liefert null, wenn danach nichts mehr belegt ist", () => {
    expect(latestCheckout([stay("2027-05-08", "2027-05-15")], new Date("2027-06-01"))).toBeNull();
  });

  it("ignoriert Zeiträume, die vor der Anreise liegen", () => {
    const periods = [stay("2027-04-01", "2027-04-08"), stay("2027-06-01", "2027-06-08")];

    expect(latestCheckout(periods, new Date("2027-05-01"))).toEqual(
      new Date("2027-06-01"),
    );
  });

  // Der so ermittelte Abreisetag muss auch die Überschneidungsprüfung
  // passieren, sonst würde der Picker etwas anbieten, das der Server ablehnt.
  it("liefert einen Abreisetag, den isRangeAvailable akzeptiert", () => {
    const periods = [stay("2027-05-08", "2027-05-15")];
    const start = new Date("2027-05-01");
    const checkout = latestCheckout(periods, start);

    expect(checkout).not.toBeNull();
    expect(isRangeAvailable(periods, start, checkout!)).toBe(true);

    const oneDayLater = new Date("2027-05-09");
    expect(isRangeAvailable(periods, start, oneDayLater)).toBe(false);
  });
});
