import { describe, it, expect, vi } from "vitest";
import { confirmBookingRequest, declineBookingRequest } from "./adminQueries";

function createFakeDb(request: { id: number; startDate: Date; endDate: Date }) {
  const inserted: unknown[] = [];
  const updated: unknown[] = [];
  return {
    inserted,
    updated,
    query: {
      bookingRequest: {
        findFirst: vi.fn().mockResolvedValue(request),
      },
    },
    insert: () => ({
      values: (values: unknown) => {
        inserted.push(values);
        return { returning: async () => [values] };
      },
    }),
    update: () => ({
      set: (values: unknown) => ({
        where: async () => {
          updated.push(values);
        },
      }),
    }),
  };
}

describe("confirmBookingRequest", () => {
  it("legt einen blocked_period-Eintrag an und setzt den Status auf confirmed", async () => {
    const request = {
      id: 1,
      startDate: new Date("2026-08-01"),
      endDate: new Date("2026-08-05"),
    };
    const fakeDb = createFakeDb(request);

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await confirmBookingRequest(fakeDb, request.id);

    expect(fakeDb.inserted).toHaveLength(1);
    expect(fakeDb.updated).toContainEqual({ status: "confirmed" });
  });
});

describe("declineBookingRequest", () => {
  it("setzt nur den Status auf declined, ohne blocked_period anzulegen", async () => {
    const request = {
      id: 2,
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-09-05"),
    };
    const fakeDb = createFakeDb(request);

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await declineBookingRequest(fakeDb, request.id);

    expect(fakeDb.inserted).toHaveLength(0);
    expect(fakeDb.updated).toContainEqual({ status: "declined" });
  });
});
