import { describe, it, expect, vi } from "vitest";
import { confirmBookingRequest, declineBookingRequest } from "./adminQueries";

// Schmale, testlokale Fake-DB-Form: erfüllt nur die von adminQueries.ts
// genutzte Teilmenge der Drizzle-API. Bewusst nicht identisch zum echten
// Drizzle-Transaktionstyp (dessen Generics für einen Fake unverhältnismäßig
// wären) – die Injektion in confirmBookingRequest/declineBookingRequest
// erfolgt daher weiterhin über `@ts-expect-error`, während der Produktivpfad
// (adminQueries.ts mit dem echten `db`) voll und streng typisiert bleibt.
type FakeDb = {
  inserted: unknown[];
  updated: unknown[];
  query: {
    bookingRequest: {
      findFirst: ReturnType<typeof vi.fn>;
    };
  };
  insert: () => {
    values: (values: unknown) => { returning: () => Promise<unknown[]> };
  };
  update: () => {
    set: (values: unknown) => { where: () => Promise<void> };
  };
  transaction: (callback: (tx: FakeDb) => Promise<void>) => Promise<void>;
};

function createFakeDb(request: { id: number; startDate: Date; endDate: Date }): FakeDb {
  const inserted: unknown[] = [];
  const updated: unknown[] = [];
  const fakeDb: FakeDb = {
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
    transaction: async (callback: (tx: FakeDb) => Promise<void>) => {
      await callback(fakeDb);
    },
  };
  return fakeDb;
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
