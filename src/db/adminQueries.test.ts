import { describe, it, expect, vi } from "vitest";
import type { SQL, Table } from "drizzle-orm";
import { compileCondition } from "./fakeConditions";
import { adminActionLog, blockedPeriod, bookingRequest } from "./schema";
import {
  confirmBookingRequest,
  declineBookingRequest,
  cancelStay,
  createInternalStay,
  createManualBooking,
  createMaintenanceBlock,
  RANGE_TAKEN_ERROR,
  NOT_PENDING_ERROR,
} from "./adminQueries";

// Schmale, testlokale Fake-DB-Form: erfüllt nur die von adminQueries.ts
// genutzte Teilmenge der Drizzle-API. Bewusst nicht identisch zum echten
// Drizzle-Transaktionstyp (dessen Generics für einen Fake unverhältnismäßig
// wären) – die Injektion erfolgt daher weiterhin über `@ts-expect-error`,
// während der Produktivpfad (adminQueries.ts mit dem echten `db`) voll und
// streng typisiert bleibt.
type FakeDb = {
  inserted: unknown[];
  /** Tabelle je Eintrag in `inserted`, gleiche Reihenfolge. */
  insertedTables: Table[];
  /** Einträge in admin_action_log, getrennt von den übrigen Inserts. */
  logs: Record<string, unknown>[];
  updated: unknown[];
  deleted: number;
  /** Sperrmodus jeder Verfügbarkeitsprüfung, z. B. "update". */
  locks: string[];
  query: {
    bookingRequest: { findFirst: ReturnType<typeof vi.fn> };
    blockedPeriod: { findFirst: ReturnType<typeof vi.fn> };
  };
  insert: (table: Table) => {
    values: (values: unknown) => {
      returning: () => Promise<unknown[]>;
      $returningId: () => Promise<{ id: number }[]>;
    };
  };
  update: () => { set: (values: unknown) => { where: () => Promise<void> } };
  delete: () => { where: () => Promise<void> };
  select: (fields?: Record<string, unknown>) => {
    from: (table: Table) => {
      where: (condition: SQL | undefined) => {
        for: (mode: string) => Promise<{ startDate: Date; endDate: Date }[]>;
      };
    };
  };
  transaction: <T>(callback: (tx: FakeDb) => Promise<T>) => Promise<T>;
};

type FakeDbOptions = {
  request?: { id: number; startDate: Date; endDate: Date; status: string };
  stay?: {
    id: number;
    startDate: Date;
    endDate: Date;
    guestName: string | null;
    bookingRequestId: number | null;
  };
  existingBlockedPeriods?: { startDate: Date; endDate: Date }[];
};

function createFakeDb({
  request,
  stay,
  existingBlockedPeriods = [],
}: FakeDbOptions): FakeDb {
  const inserted: unknown[] = [];
  const insertedTables: Table[] = [];
  const logs: Record<string, unknown>[] = [];
  const updated: unknown[] = [];
  // Fortlaufende IDs je Insert, ab 500: Die erste angelegte Zeile hat 500.
  let nextId = 500;
  const fakeDb: FakeDb = {
    inserted,
    insertedTables,
    logs,
    updated,
    deleted: 0,
    locks: [],
    query: {
      bookingRequest: { findFirst: vi.fn().mockResolvedValue(request) },
      blockedPeriod: { findFirst: vi.fn().mockResolvedValue(stay) },
    },
    insert: (table) => ({
      values: (values: unknown) => {
        if (table === adminActionLog) {
          logs.push(values as Record<string, unknown>);
        } else {
          inserted.push(values);
          insertedTables.push(table);
        }
        const id = nextId++;
        return { returning: async () => [values], $returningId: async () => [{ id }] };
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
    // Wertet die Bedingung aus (siehe fakeConditions.ts): Die Prüfung filtert
    // in SQL, also muss auch die Fake-DB nur die passenden Zeilen liefern.
    select: () => ({
      from: (table) => ({
        where: (condition) => ({
          for: async (mode) => {
            fakeDb.locks.push(mode);
            const matches = compileCondition(table, condition);
            return existingBlockedPeriods.filter((period) => matches(period));
          },
        }),
      }),
    }),
    transaction: async <T,>(callback: (tx: FakeDb) => Promise<T>): Promise<T> => callback(fakeDb),
  };
  return fakeDb;
}

const request = {
  id: 1,
  startDate: new Date("2026-08-01"),
  endDate: new Date("2026-08-05"),
  status: "pending",
};

const ACTOR = "admin@example.invalid";

function stayWith(overrides: Partial<NonNullable<FakeDbOptions["stay"]>>) {
  return {
    id: 7,
    startDate: new Date("2026-08-01"),
    endDate: new Date("2026-08-05"),
    guestName: null,
    bookingRequestId: 1,
    ...overrides,
  };
}

describe("confirmBookingRequest", () => {
  it("bestätigt keine Anfrage, die nicht mehr offen ist", async () => {
    const fakeDb = createFakeDb({ request: { ...request, status: "declined" } });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await expect(confirmBookingRequest(fakeDb, request.id, ACTOR)).rejects.toThrow(NOT_PENDING_ERROR);
    expect(fakeDb.inserted).toEqual([]);
  });

  it("verknüpft den Sperrzeitraum mit der Anfrage und setzt den Status auf confirmed", async () => {
    const fakeDb = createFakeDb({ request });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await confirmBookingRequest(fakeDb, request.id, ACTOR);

    expect(fakeDb.inserted).toEqual([
      {
        startDate: request.startDate,
        endDate: request.endDate,
        kind: "booking",
        bookingRequestId: request.id,
      },
    ]);
    expect(fakeDb.updated).toContainEqual({ status: "confirmed", decidedAt: expect.any(Date) });
  });

  it("speichert eine Anschrift aus dem Bestätigen-Dialog in derselben Änderung", async () => {
    const fakeDb = createFakeDb({ request });

    await confirmBookingRequest(
      // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
      fakeDb,
      request.id,
      ACTOR,
      { street: "Musterweg 1", postalCode: "12345", city: "Musterstadt", country: "" },
    );

    expect(fakeDb.updated).toContainEqual({
      status: "confirmed",
      decidedAt: expect.any(Date),
      street: "Musterweg 1",
      postalCode: "12345",
      city: "Musterstadt",
      country: null,
    });
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
      confirmBookingRequest(fakeDb, request.id, ACTOR),
    ).rejects.toThrow(RANGE_TAKEN_ERROR);

    expect(fakeDb.inserted).toHaveLength(0);
    expect(fakeDb.updated).toHaveLength(0);
  });
});

describe("declineBookingRequest", () => {
  it("gibt den Zeitraum einer zuvor bestätigten Anfrage wieder frei", async () => {
    const fakeDb = createFakeDb({ request });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await declineBookingRequest(fakeDb, request.id, ACTOR);

    // Ohne dieses Löschen bliebe der bei der Bestätigung angelegte
    // Sperrzeitraum stehen und würde den Zeitraum dauerhaft blockieren.
    expect(fakeDb.deleted).toBe(1);
    expect(fakeDb.updated).toContainEqual({
      status: "declined",
      reasonNote: null,
      decidedAt: expect.any(Date),
    });
  });

  it("speichert den Ablehnungsgrund für die Benachrichtigung des Gasts", async () => {
    const fakeDb = createFakeDb({ request });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await declineBookingRequest(fakeDb, request.id, ACTOR, "Zeitraum anderweitig vergeben");

    expect(fakeDb.updated).toContainEqual({
      status: "declined",
      reasonNote: "Zeitraum anderweitig vergeben",
      decidedAt: expect.any(Date),
    });
  });
});

describe("cancelStay", () => {
  it("löscht den Aufenthalt und setzt die zugehörige Anfrage auf declined", async () => {
    const fakeDb = createFakeDb({ stay: stayWith({ id: 7, bookingRequestId: 1 }) });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await cancelStay(fakeDb, 7, ACTOR, "Wasserschaden");

    expect(fakeDb.deleted).toBe(1);
    expect(fakeDb.updated).toContainEqual({
      status: "declined",
      reasonNote: "Wasserschaden",
      decidedAt: expect.any(Date),
    });
  });

  it("löscht einen manuell eingetragenen Aufenthalt, ohne eine Anfrage anzufassen", async () => {
    const fakeDb = createFakeDb({
      stay: stayWith({ id: 8, bookingRequestId: null, guestName: "Familie Janssen" }),
    });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await cancelStay(fakeDb, 8, ACTOR);

    expect(fakeDb.deleted).toBe(1);
    expect(fakeDb.updated).toHaveLength(0);
  });

  it("wirft einen Fehler für einen unbekannten Aufenthalt", async () => {
    const fakeDb = createFakeDb({ stay: undefined });

    await expect(
      // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
      cancelStay(fakeDb, 99, ACTOR),
    ).rejects.toThrow("Aufenthalt 99 nicht gefunden");

    expect(fakeDb.deleted).toBe(0);
  });
});

const manualBooking = {
  name: "Hanna Telefon",
  email: "hanna@example.invalid",
  phone: "0176 7654321",
  message: "Kommt mit Hund",
  startDate: new Date("2026-09-01"),
  endDate: new Date("2026-09-08"),
  guests: 3,
  guestsUnder14: 1,
  linens: 2,
  towels: 0,
};

describe("createManualBooking", () => {
  const now = new Date("2026-08-20T10:00:00Z");

  it("legt eine bestätigte Anfrage mit Herkunft manual und die verknüpfte Belegung an", async () => {
    const fakeDb = createFakeDb({});

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    const result = await createManualBooking(fakeDb, manualBooking, ACTOR, now);

    expect(fakeDb.insertedTables).toEqual([bookingRequest, blockedPeriod]);
    expect(fakeDb.inserted).toEqual([
      {
        name: "Hanna Telefon",
        email: "hanna@example.invalid",
        phone: "0176 7654321",
        message: "Kommt mit Hund",
        // Anschrift freiwillig, hier nicht angegeben.
        street: null,
        postalCode: null,
        city: null,
        country: null,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-09-08"),
        guests: 3,
        // Kinder unter 14 (BDS-006) werden wie angegeben gespeichert.
        guestsUnder14: 1,
        linens: 2,
        towels: 0,
        status: "confirmed",
        source: "manual",
        decidedAt: now,
      },
      {
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-09-08"),
        kind: "booking",
        bookingRequestId: 500,
      },
    ]);
    expect(result).toEqual({ bookingRequestId: 500, blockedPeriodId: 501 });
  });

  it("speichert leere Angaben zu Telefon und Nachricht als null", async () => {
    const fakeDb = createFakeDb({});

    await createManualBooking(
      // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
      fakeDb,
      { ...manualBooking, phone: "", message: undefined },
      ACTOR,
      now,
    );

    expect(fakeDb.inserted[0]).toMatchObject({ phone: null, message: null });
  });

  it("prüft die Verfügbarkeit sperrend in derselben Transaktion", async () => {
    const fakeDb = createFakeDb({});

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await createManualBooking(fakeDb, manualBooking, ACTOR, now);

    expect(fakeDb.locks).toEqual(["update"]);
  });

  it("lehnt einen belegten Zeitraum ab und schreibt nichts", async () => {
    const fakeDb = createFakeDb({
      existingBlockedPeriods: [
        { startDate: new Date("2026-09-07"), endDate: new Date("2026-09-10") },
      ],
    });

    await expect(
      // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
      createManualBooking(fakeDb, manualBooking, ACTOR, now),
    ).rejects.toThrow(RANGE_TAKEN_ERROR);

    expect(fakeDb.inserted).toHaveLength(0);
    expect(fakeDb.logs).toHaveLength(0);
  });

  it("lässt den Wechseltag frei: Anreise am Abreisetag des Vorgängers", async () => {
    const fakeDb = createFakeDb({
      existingBlockedPeriods: [
        { startDate: new Date("2026-08-25"), endDate: new Date("2026-09-01") },
      ],
    });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await createManualBooking(fakeDb, manualBooking, ACTOR, now);

    expect(fakeDb.inserted).toHaveLength(2);
  });

  it("protokolliert manual_booking mit Anfrage, Belegung und Zeitraum, ohne Gastdaten", async () => {
    const fakeDb = createFakeDb({});

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await createManualBooking(fakeDb, manualBooking, ACTOR, now);

    expect(fakeDb.logs).toEqual([
      {
        actor: ACTOR,
        action: "manual_booking",
        bookingRequestId: 500,
        blockedPeriodId: 501,
        details: { startDate: "2026-09-01", endDate: "2026-09-08" },
      },
    ]);
    const log = JSON.stringify(fakeDb.logs);
    for (const text of ["Hanna", "hanna@", "0176", "Hund"]) {
      expect(log).not.toContain(text);
    }
  });
});

describe("createInternalStay", () => {
  it("legt eine interne Belegung mit Notiz und Abreisetag als Ende an, ohne Gast", async () => {
    const fakeDb = createFakeDb({});

    await createInternalStay(
      // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
      fakeDb,
      { startDate: new Date("2026-09-01"), endDate: new Date("2026-09-08"), note: "Familie Janssen" },
      ACTOR,
    );

    expect(fakeDb.insertedTables).toEqual([blockedPeriod]);
    expect(fakeDb.inserted).toEqual([
      {
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-09-08"),
        kind: "internal",
        note: "Familie Janssen",
      },
    ]);
  });

  it("speichert eine leere Notiz als null", async () => {
    const fakeDb = createFakeDb({});

    await createInternalStay(
      // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
      fakeDb,
      { startDate: new Date("2026-09-01"), endDate: new Date("2026-09-08") },
      ACTOR,
    );

    expect(fakeDb.inserted[0]).toMatchObject({ note: null });
  });

  it("lehnt einen belegten Zeitraum ab", async () => {
    const fakeDb = createFakeDb({
      existingBlockedPeriods: [
        { startDate: new Date("2026-09-05"), endDate: new Date("2026-09-10") },
      ],
    });

    await expect(
      createInternalStay(
        // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
        fakeDb,
        { startDate: new Date("2026-09-01"), endDate: new Date("2026-09-08") },
        ACTOR,
      ),
    ).rejects.toThrow(RANGE_TAKEN_ERROR);

    expect(fakeDb.inserted).toHaveLength(0);
  });

  it("protokolliert internal_stay ohne Notiz", async () => {
    const fakeDb = createFakeDb({});

    await createInternalStay(
      // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
      fakeDb,
      { startDate: new Date("2026-09-01"), endDate: new Date("2026-09-08"), note: "Familie Janssen" },
      ACTOR,
    );

    expect(fakeDb.logs).toEqual([
      {
        actor: ACTOR,
        action: "internal_stay",
        bookingRequestId: null,
        blockedPeriodId: 500,
        details: { startDate: "2026-09-01", endDate: "2026-09-08" },
      },
    ]);
    expect(JSON.stringify(fakeDb.logs)).not.toContain("Janssen");
  });
});

describe("createMaintenanceBlock", () => {
  it("speichert das Enddatum inklusiv, indem intern ein Tag addiert wird", async () => {
    // Anders als bei Gastaufenthalten gibt es bei einem Sperrzeitraum keinen
    // Abreisetag – "Ende" soll der letzte gesperrte Tag sein, nicht der Tag
    // danach. Intern wird trotzdem die exklusive Enddatum-Konvention der
    // übrigen Verfügbarkeitslogik verwendet, daher +1 Tag beim Speichern.
    const fakeDb = createFakeDb({});

    await createMaintenanceBlock(
      // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
      fakeDb,
      {
        startDate: new Date("2026-08-09"),
        endDate: new Date("2026-08-22"),
        note: "Wartung",
      },
      ACTOR,
    );

    expect(fakeDb.inserted).toEqual([
      {
        startDate: new Date("2026-08-09"),
        endDate: new Date("2026-08-23"),
        note: "Wartung",
      },
    ]);
  });

  it("addiert den Tag auch über einen Monatswechsel hinweg korrekt", async () => {
    const fakeDb = createFakeDb({});

    await createMaintenanceBlock(
      // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
      fakeDb,
      {
        startDate: new Date("2026-08-30"),
        endDate: new Date("2026-08-31"),
      },
      ACTOR,
    );

    expect(fakeDb.inserted).toEqual([
      {
        startDate: new Date("2026-08-30"),
        endDate: new Date("2026-09-01"),
        note: null,
      },
    ]);
  });

  it("prüft die Verfügbarkeit bereits gegen das inklusive Enddatum", async () => {
    const fakeDb = createFakeDb({
      existingBlockedPeriods: [
        { startDate: new Date("2026-08-22"), endDate: new Date("2026-08-25") },
      ],
    });

    // Ohne die +1-Tag-Korrektur würde die Prüfung mit dem exklusiven
    // 2026-08-22 laufen und den echten Konflikt am 22. übersehen.
    await expect(
      createMaintenanceBlock(
        // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
        fakeDb,
        {
          startDate: new Date("2026-08-09"),
          endDate: new Date("2026-08-22"),
        },
        ACTOR,
      ),
    ).rejects.toThrow(RANGE_TAKEN_ERROR);

    expect(fakeDb.inserted).toHaveLength(0);
  });
});

describe("Verfügbarkeitsprüfung in der Transaktion", () => {
  // Anfrage: 01.08. bis 05.08. (Abreise), siehe `request` oben.
  it.each([
    ["Abreisetag des Vorgängers = Anreisetag", "2026-07-25", "2026-08-01"],
    ["Anreisetag des Nachfolgers = Abreisetag", "2026-08-05", "2026-08-12"],
  ])("lässt den Wechseltag frei: %s", async (_fall, start, end) => {
    const fakeDb = createFakeDb({
      request,
      existingBlockedPeriods: [{ startDate: new Date(start), endDate: new Date(end) }],
    });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await confirmBookingRequest(fakeDb, request.id, ACTOR);

    expect(fakeDb.inserted).toHaveLength(1);
  });

  it.each([
    ["ein Tag am Anfang", "2026-07-25", "2026-08-02"],
    ["ein Tag am Ende", "2026-08-04", "2026-08-12"],
    ["umschließend", "2026-07-30", "2026-08-10"],
    ["innerhalb", "2026-08-02", "2026-08-03"],
  ])("erkennt eine Überschneidung: %s", async (_fall, start, end) => {
    const fakeDb = createFakeDb({
      request,
      existingBlockedPeriods: [{ startDate: new Date(start), endDate: new Date(end) }],
    });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await expect(confirmBookingRequest(fakeDb, request.id, ACTOR)).rejects.toThrow(RANGE_TAKEN_ERROR);
    expect(fakeDb.inserted).toHaveLength(0);
  });

  it("liest die Zeilen sperrend (FOR UPDATE)", async () => {
    const fakeDb = createFakeDb({ request });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await confirmBookingRequest(fakeDb, request.id, ACTOR);

    expect(fakeDb.locks).toEqual(["update"]);
  });
});

describe("Protokoll administrativer Aktionen", () => {
  it("protokolliert die Bestätigung mit Anfrage, Aufenthalt und Zeitraum", async () => {
    const fakeDb = createFakeDb({ request });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await confirmBookingRequest(fakeDb, request.id, ACTOR);

    expect(fakeDb.logs).toEqual([
      {
        actor: ACTOR,
        action: "confirm",
        bookingRequestId: request.id,
        blockedPeriodId: 500,
        details: { startDate: "2026-08-01", endDate: "2026-08-05" },
      },
    ]);
  });

  it("protokolliert nichts, wenn die Bestätigung scheitert", async () => {
    const fakeDb = createFakeDb({
      request,
      existingBlockedPeriods: [
        { startDate: new Date("2026-08-03"), endDate: new Date("2026-08-10") },
      ],
    });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await expect(confirmBookingRequest(fakeDb, request.id, ACTOR)).rejects.toThrow();
    expect(fakeDb.logs).toHaveLength(0);
  });

  it("protokolliert die Ablehnung ohne den Begründungstext", async () => {
    const fakeDb = createFakeDb({ request });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await declineBookingRequest(fakeDb, request.id, ACTOR, "Wir sind privat verreist");

    expect(fakeDb.logs).toEqual([
      {
        actor: ACTOR,
        action: "decline",
        bookingRequestId: request.id,
        blockedPeriodId: null,
        details: null,
      },
    ]);
    expect(JSON.stringify(fakeDb.logs)).not.toContain("verreist");
  });

  it.each([
    ["Aufenthalt aus Anfrage", { bookingRequestId: 1, guestName: null }, "cancel"],
    ["manueller Aufenthalt", { bookingRequestId: null, guestName: "Familie Janssen" }, "cancel"],
    ["Sperrzeitraum ohne Gast", { bookingRequestId: null, guestName: null }, "block_delete"],
  ] as const)("protokolliert das Entfernen: %s → %s", async (_fall, herkunft, action) => {
    const fakeDb = createFakeDb({ stay: stayWith({ id: 9, ...herkunft }) });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await cancelStay(fakeDb, 9, ACTOR, "Grund");

    expect(fakeDb.logs).toEqual([
      {
        actor: ACTOR,
        action,
        bookingRequestId: herkunft.bookingRequestId,
        blockedPeriodId: 9,
        details: { startDate: "2026-08-01", endDate: "2026-08-05" },
      },
    ]);
    expect(JSON.stringify(fakeDb.logs)).not.toContain("Janssen");
  });

  it("protokolliert einen Sperrzeitraum mit gespeichertem (exklusivem) Ende", async () => {
    const fakeDb = createFakeDb({});

    await createMaintenanceBlock(
      // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
      fakeDb,
      { startDate: new Date("2026-08-09"), endDate: new Date("2026-08-22"), note: "Wartung" },
      ACTOR,
    );

    expect(fakeDb.logs).toEqual([
      {
        actor: ACTOR,
        action: "block_create",
        bookingRequestId: null,
        blockedPeriodId: 500,
        details: { startDate: "2026-08-09", endDate: "2026-08-23" },
      },
    ]);
  });
});
