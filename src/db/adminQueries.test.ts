import { describe, it, expect, vi } from "vitest";
import {
  confirmBookingRequest,
  declineBookingRequest,
  cancelStay,
  createManualStay,
  RANGE_TAKEN_ERROR,
} from "./adminQueries";

// Schmale, testlokale Fake-DB-Form: erfüllt nur die von adminQueries.ts
// genutzte Teilmenge der Drizzle-API. Bewusst nicht identisch zum echten
// Drizzle-Transaktionstyp (dessen Generics für einen Fake unverhältnismäßig
// wären) – die Injektion erfolgt daher weiterhin über `@ts-expect-error`,
// während der Produktivpfad (adminQueries.ts mit dem echten `db`) voll und
// streng typisiert bleibt.
type FakeDb = {
  inserted: unknown[];
  updated: unknown[];
  deleted: number;
  query: {
    bookingRequest: { findFirst: ReturnType<typeof vi.fn> };
    blockedPeriod: { findFirst: ReturnType<typeof vi.fn> };
  };
  insert: () => {
    values: (values: unknown) => { returning: () => Promise<unknown[]> };
  };
  update: () => { set: (values: unknown) => { where: () => Promise<void> } };
  delete: () => { where: () => Promise<void> };
  select: () => { from: (table: unknown) => Promise<{ startDate: Date; endDate: Date }[]> };
  transaction: (callback: (tx: FakeDb) => Promise<void>) => Promise<void>;
};

type FakeDbOptions = {
  request?: { id: number; startDate: Date; endDate: Date };
  stay?: { id: number; bookingRequestId: number | null };
  existingBlockedPeriods?: { startDate: Date; endDate: Date }[];
};

function createFakeDb({
  request,
  stay,
  existingBlockedPeriods = [],
}: FakeDbOptions): FakeDb {
  const inserted: unknown[] = [];
  const updated: unknown[] = [];
  const fakeDb: FakeDb = {
    inserted,
    updated,
    deleted: 0,
    query: {
      bookingRequest: { findFirst: vi.fn().mockResolvedValue(request) },
      blockedPeriod: { findFirst: vi.fn().mockResolvedValue(stay) },
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
    delete: () => ({
      where: async () => {
        fakeDb.deleted += 1;
      },
    }),
    select: () => ({ from: async () => existingBlockedPeriods }),
    transaction: async (callback: (tx: FakeDb) => Promise<void>) => {
      await callback(fakeDb);
    },
  };
  return fakeDb;
}

const request = {
  id: 1,
  startDate: new Date("2026-08-01"),
  endDate: new Date("2026-08-05"),
};

describe("confirmBookingRequest", () => {
  it("verknüpft den Sperrzeitraum mit der Anfrage und setzt den Status auf confirmed", async () => {
    const fakeDb = createFakeDb({ request });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await confirmBookingRequest(fakeDb, request.id);

    expect(fakeDb.inserted).toEqual([
      {
        startDate: request.startDate,
        endDate: request.endDate,
        bookingRequestId: request.id,
      },
    ]);
    expect(fakeDb.updated).toContainEqual({ status: "confirmed" });
  });

  it("wirft einen Fehler und schreibt nichts, wenn der Zeitraum inzwischen belegt ist", async () => {
    const fakeDb = createFakeDb({
      request,
      existingBlockedPeriods: [
        { startDate: new Date("2026-08-03"), endDate: new Date("2026-08-10") },
      ],
    });

    await expect(
      // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
      confirmBookingRequest(fakeDb, request.id),
    ).rejects.toThrow(RANGE_TAKEN_ERROR);

    expect(fakeDb.inserted).toHaveLength(0);
    expect(fakeDb.updated).toHaveLength(0);
  });
});

describe("declineBookingRequest", () => {
  it("gibt den Zeitraum einer zuvor bestätigten Anfrage wieder frei", async () => {
    const fakeDb = createFakeDb({ request });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await declineBookingRequest(fakeDb, request.id);

    // Ohne dieses Löschen bliebe der bei der Bestätigung angelegte
    // Sperrzeitraum stehen und würde den Zeitraum dauerhaft blockieren.
    expect(fakeDb.deleted).toBe(1);
    expect(fakeDb.updated).toContainEqual({ status: "declined", reasonNote: null });
  });

  it("speichert den Ablehnungsgrund für die Benachrichtigung des Gasts", async () => {
    const fakeDb = createFakeDb({ request });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await declineBookingRequest(fakeDb, request.id, "Zeitraum anderweitig vergeben");

    expect(fakeDb.updated).toContainEqual({
      status: "declined",
      reasonNote: "Zeitraum anderweitig vergeben",
    });
  });
});

describe("cancelStay", () => {
  it("löscht den Aufenthalt und setzt die zugehörige Anfrage auf declined", async () => {
    const fakeDb = createFakeDb({ stay: { id: 7, bookingRequestId: 1 } });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await cancelStay(fakeDb, 7, "Wasserschaden");

    expect(fakeDb.deleted).toBe(1);
    expect(fakeDb.updated).toContainEqual({
      status: "declined",
      reasonNote: "Wasserschaden",
    });
  });

  it("löscht einen manuell eingetragenen Aufenthalt, ohne eine Anfrage anzufassen", async () => {
    const fakeDb = createFakeDb({ stay: { id: 8, bookingRequestId: null } });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await cancelStay(fakeDb, 8);

    expect(fakeDb.deleted).toBe(1);
    expect(fakeDb.updated).toHaveLength(0);
  });

  it("wirft einen Fehler für einen unbekannten Aufenthalt", async () => {
    const fakeDb = createFakeDb({ stay: undefined });

    await expect(
      // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
      cancelStay(fakeDb, 99),
    ).rejects.toThrow("Aufenthalt 99 nicht gefunden");

    expect(fakeDb.deleted).toBe(0);
  });
});

describe("createManualStay", () => {
  it("legt einen Aufenthalt mit Gastnamen und ohne Anfrage an", async () => {
    const fakeDb = createFakeDb({});

    await createManualStay(
      // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
      fakeDb,
      {
        guestName: "Familie Janssen",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-09-08"),
      },
    );

    expect(fakeDb.inserted).toEqual([
      {
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-09-08"),
        guestName: "Familie Janssen",
      },
    ]);
  });

  it("lehnt einen bereits belegten Zeitraum ab", async () => {
    const fakeDb = createFakeDb({
      existingBlockedPeriods: [
        { startDate: new Date("2026-09-05"), endDate: new Date("2026-09-10") },
      ],
    });

    await expect(
      createManualStay(
        // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
        fakeDb,
        {
          guestName: "Familie Janssen",
          startDate: new Date("2026-09-01"),
          endDate: new Date("2026-09-08"),
        },
      ),
    ).rejects.toThrow(RANGE_TAKEN_ERROR);

    expect(fakeDb.inserted).toHaveLength(0);
  });
});
