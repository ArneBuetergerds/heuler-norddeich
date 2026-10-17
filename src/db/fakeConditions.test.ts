import { describe, it, expect } from "vitest";
import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { compileCondition } from "./fakeConditions";
import { bookingRequest } from "./schema";

const rows = [
  { id: 1, status: "declined", decidedAt: null, createdAt: new Date("2026-01-01T10:00:00Z") },
  { id: 2, status: "declined", decidedAt: new Date("2026-02-01T10:00:00Z"), createdAt: new Date("2026-01-01T10:00:00Z") },
  { id: 3, status: "pending", decidedAt: null, createdAt: new Date("2026-03-01T10:00:00Z") },
];

const ids = (condition: Parameters<typeof compileCondition>[1]) =>
  rows.filter(compileCondition(bookingRequest, condition)).map((row) => row.id);

describe("compileCondition", () => {
  it("versteht isNull, auch mit and und Parametern davor und danach", () => {
    expect(ids(isNull(bookingRequest.decidedAt))).toEqual([1, 3]);
    expect(
      ids(
        and(
          eq(bookingRequest.status, "declined"),
          isNull(bookingRequest.decidedAt),
          lt(bookingRequest.createdAt, new Date("2026-02-01T00:00:00Z")),
        ),
      ),
    ).toEqual([1]);
  });

  it("wirft bei is not null und or statt still alles durchzulassen", () => {
    expect(() => ids(isNotNull(bookingRequest.decidedAt))).toThrow("Bedingung nicht unterstützt");
    expect(() =>
      ids(or(isNull(bookingRequest.decidedAt), eq(bookingRequest.status, "pending"))),
    ).toThrow("Bedingung nicht unterstützt");
  });
});
