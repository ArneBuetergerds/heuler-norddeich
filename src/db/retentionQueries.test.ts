import { describe, it, expect } from "vitest";
import { getTableColumns, getTableName, type Column, type SQL, type Table } from "drizzle-orm";
import { compileCondition } from "./fakeConditions";
import { adminActionLog, blockedPeriod, bookingRequest, invoice } from "./schema";
import {
  deleteBookingRequest,
  purgeExpiredData,
  purgeLogMessage,
  REQUEST_ALREADY_ANONYMIZED_ERROR,
  REQUEST_NOT_FOUND_ERROR,
  STAY_AHEAD_ERROR,
} from "./retentionQueries";

type Row = Record<string, unknown>;

/**
 * In-Memory-Fake für die von retentionQueries.ts genutzte Teilmenge der
 * Drizzle-API: select(fields).from(t)[.where(c)][.for(m)], insert, update,
 * delete und transaction. Bedingungen werden wie in queries.test.ts über
 * fakeConditions.ts ausgewertet. Fremdschlüssel kennt der Fake nicht; die
 * Tests prüfen stattdessen, dass Rechnungen vor ihren Anfragen gelöscht werden.
 */
function createFakeDb(initial: Map<Table, Row[]>) {
  const tables = new Map<Table, Row[]>();
  for (const [table, rows] of initial) {
    tables.set(table, rows.map((row) => ({ ...row })));
  }
  const rows = (table: Table) => {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table)!;
  };
  const ops: string[] = [];
  const locks: string[] = [];

  function project(table: Table, fields: Record<string, unknown>, row: Row): Row {
    const columns = Object.entries(getTableColumns(table));
    return Object.fromEntries(
      Object.entries(fields).map(([alias, column]) => {
        const key = columns.find(([, entry]) => entry === (column as Column))?.[0];
        if (!key) throw new Error(`Feld ${alias} gehört nicht zu der Tabelle`);
        return [alias, row[key] ?? null];
      }),
    );
  }

  let nextId = 1000;

  const db = {
    tables,
    ops,
    locks,
    select: (fields: Record<string, unknown>) => ({
      from: (table: Table) => {
        let condition: SQL | undefined;
        const run = () => {
          const matches = compileCondition(table, condition);
          return rows(table)
            .filter((row) => matches(row))
            .map((row) => project(table, fields, row));
        };
        const lockable = () =>
          Object.assign(Promise.resolve().then(run), {
            for: async (mode: string) => {
              locks.push(mode);
              return run();
            },
          });
        return Object.assign(lockable(), {
          where: (next: SQL) => {
            condition = next;
            return lockable();
          },
        });
      },
    }),
    insert: (table: Table) => ({
      values: async (values: Row) => {
        rows(table).push({ id: nextId++, createdAt: new Date(), ...values });
      },
    }),
    update: (table: Table) => ({
      set: (values: Row) => ({
        where: async (condition: SQL) => {
          const matches = compileCondition(table, condition);
          for (const row of rows(table)) {
            if (matches(row)) Object.assign(row, values);
          }
        },
      }),
    }),
    delete: (table: Table) => ({
      where: async (condition: SQL) => {
        const matches = compileCondition(table, condition);
        const kept = rows(table).filter((row) => !matches(row));
        ops.push(`delete ${getTableName(table)}`);
        tables.set(table, kept);
      },
    }),
    // Die Transaktion ist dieselbe Fake-DB; Rollback simuliert der Fake nicht.
    // `tx: never` statt des Drizzle-Typs: Der Fake erfüllt nur die genutzte
    // Teilmenge der API (wie `@ts-expect-error` in den übrigen DB-Tests).
    transaction: async <T,>(callback: (tx: never) => Promise<T>): Promise<T> =>
      callback(db as never),
  };
  return db;
}

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function guestRequest(overrides: Row): Row {
  return {
    id: 1,
    name: "Erika Musterfrau",
    email: "erika@example.invalid",
    phone: "0176 1234567",
    startDate: day("2026-08-01"),
    endDate: day("2026-08-08"),
    message: "Wir kommen mit Hund",
    guests: 2,
    linens: 0,
    towels: 0,
    status: "pending",
    reasonNote: null,
    createdAt: new Date("2026-02-01T10:00:00Z"),
    decidedAt: null,
    anonymizedAt: null,
    ...overrides,
  };
}

/** Alle Namen, Adressen und Texte der Testgäste – keiner darf im Protokoll landen. */
const PERSONAL = ["Musterfrau", "erika@", "0176", "Hund", "Janssen", "Wasserschaden"];

const ACTOR = "admin@example.invalid";
const TODAY = day("2027-03-01");

describe("deleteBookingRequest", () => {
  it("meldet eine unbekannte Anfrage", async () => {
    const db = createFakeDb(new Map());

    await expect(deleteBookingRequest(db, 99, ACTOR, TODAY)).rejects.toThrow(
      REQUEST_NOT_FOUND_ERROR,
    );
  });

  it.each([
    ["offen", { status: "pending" }],
    ["abgelehnt", { status: "declined" }],
    ["vergangen bestätigt", { status: "confirmed", endDate: day("2027-02-20") }],
  ])("löscht eine Anfrage ohne Rechnung (%s) samt Belegung", async (_fall, overrides) => {
    const db = createFakeDb(
      new Map<Table, Row[]>([
        [bookingRequest, [guestRequest({ id: 1, ...overrides })]],
        [blockedPeriod, [{ id: 5, bookingRequestId: 1, guestName: null }]],
      ]),
    );

    await expect(deleteBookingRequest(db, 1, ACTOR, TODAY)).resolves.toBe("deleted");

    expect(db.tables.get(bookingRequest)).toEqual([]);
    expect(db.tables.get(blockedPeriod)).toEqual([]);
    expect(db.locks).toEqual(["update", "update"]);

    const logs = db.tables.get(adminActionLog)!;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actor: ACTOR,
      action: "request_delete",
      bookingRequestId: 1,
      blockedPeriodId: null,
    });
    for (const text of PERSONAL) {
      expect(JSON.stringify(logs)).not.toContain(text);
    }
  });

  it("verweigert eine bestätigte Buchung mit Abreise in der Zukunft (→ 409) und ändert nichts", async () => {
    const db = createFakeDb(
      new Map<Table, Row[]>([
        [bookingRequest, [guestRequest({ status: "confirmed", endDate: day("2027-03-02") })]],
        [blockedPeriod, [{ id: 5, bookingRequestId: 1, guestName: null }]],
      ]),
    );

    await expect(deleteBookingRequest(db, 1, ACTOR, TODAY)).rejects.toThrow(STAY_AHEAD_ERROR);

    expect(db.tables.get(bookingRequest)).toHaveLength(1);
    expect(db.tables.get(blockedPeriod)).toHaveLength(1);
    expect(db.tables.get(adminActionLog) ?? []).toHaveLength(0);
  });

  it("anonymisiert statt zu löschen, wenn es eine Rechnung gibt", async () => {
    const now = new Date("2027-03-01T09:00:00Z");
    const db = createFakeDb(
      new Map<Table, Row[]>([
        [
          bookingRequest,
          [
            guestRequest({
              status: "confirmed",
              endDate: day("2027-02-20"),
              reasonNote: "Wasserschaden",
            }),
          ],
        ],
        [blockedPeriod, [{ id: 5, bookingRequestId: 1, guestName: null }]],
        [invoice, [{ id: 10, bookingRequestId: 1, year: 2027 }]],
      ]),
    );

    await expect(deleteBookingRequest(db, 1, ACTOR, TODAY, now)).resolves.toBe("anonymized");

    expect(db.tables.get(bookingRequest)![0]).toMatchObject({
      name: "gelöscht",
      email: "gelöscht",
      phone: null,
      message: null,
      reasonNote: null,
      anonymizedAt: now,
      // Zeitraum und Status bleiben – die Rechnung bezieht sich darauf.
      status: "confirmed",
      endDate: day("2027-02-20"),
    });
    expect(db.tables.get(invoice)).toHaveLength(1);
    expect(db.tables.get(blockedPeriod)).toHaveLength(1);
    expect(db.tables.get(adminActionLog)![0]).toMatchObject({
      action: "request_anonymize",
      bookingRequestId: 1,
    });
  });

  it("meldet eine bereits anonymisierte Anfrage mit Rechnung als nicht löschbar", async () => {
    const db = createFakeDb(
      new Map<Table, Row[]>([
        [
          bookingRequest,
          [guestRequest({ status: "declined", anonymizedAt: new Date("2027-01-01") })],
        ],
        [invoice, [{ id: 10, bookingRequestId: 1, year: 2026 }]],
      ]),
    );

    await expect(deleteBookingRequest(db, 1, ACTOR, TODAY)).rejects.toThrow(
      REQUEST_ALREADY_ANONYMIZED_ERROR,
    );
  });
});

describe("purgeExpiredData", () => {
  // 1.3.2027, 10 Uhr deutscher Zeit.
  const now = new Date("2027-03-01T09:00:00Z");

  function fixture() {
    return createFakeDb(
      new Map<Table, Row[]>([
        [
          bookingRequest,
          [
            // Offen seit 31.8.2026 → fällig 28.2.2027: gelöscht.
            guestRequest({ id: 1, createdAt: new Date("2026-08-31T10:00:00Z") }),
            // Offen seit 2.9.2026 → fällig 2.3.2027: bleibt.
            guestRequest({ id: 2, createdAt: new Date("2026-09-02T10:00:00Z") }),
            // Abgelehnt am 15.8.2026: gelöscht.
            guestRequest({
              id: 3,
              status: "declined",
              decidedAt: new Date("2026-08-15T10:00:00Z"),
              reasonNote: "Wasserschaden",
            }),
            // Altbestand ohne decided_at, eingegangen 1.8.2026: gelöscht.
            guestRequest({ id: 4, status: "declined", createdAt: new Date("2026-08-01T10:00:00Z") }),
            // Abreise 2022, keine Rechnung: gelöscht samt Belegung.
            guestRequest({ id: 5, status: "confirmed", endDate: day("2022-08-10") }),
            // Abreise 2024 → löschbar erst ab 1.1.2029: bleibt.
            guestRequest({ id: 6, status: "confirmed", endDate: day("2024-08-10") }),
            // Abreise 2022 mit Rechnung von 2022: anonymisiert.
            guestRequest({ id: 7, status: "confirmed", endDate: day("2022-07-01") }),
            // Bereits anonymisiert, Rechnung von 2016 abgelaufen: beides gelöscht.
            guestRequest({
              id: 8,
              status: "confirmed",
              name: "gelöscht",
              email: "gelöscht",
              endDate: day("2016-07-01"),
              anonymizedAt: new Date("2020-01-01T00:00:00Z"),
            }),
          ],
        ],
        [
          invoice,
          [
            { id: 70, bookingRequestId: 7, year: 2022 },
            { id: 80, bookingRequestId: 8, year: 2016 },
          ],
        ],
        [
          blockedPeriod,
          [
            { id: 50, bookingRequestId: 5, guestName: null, endDate: day("2022-08-10") },
            { id: 70, bookingRequestId: 7, guestName: null, endDate: day("2022-07-01") },
            // Manuell, Abreise 2022: gelöscht.
            { id: 90, bookingRequestId: null, guestName: "Familie Janssen", endDate: day("2022-05-01") },
            // Manuell, Abreise 2024: bleibt.
            { id: 91, bookingRequestId: null, guestName: "Familie Janssen", endDate: day("2024-05-01") },
            // Sperrzeitraum ohne Gast: bleibt, egal wie alt.
            { id: 92, bookingRequestId: null, guestName: null, endDate: day("2019-05-01") },
          ],
        ],
        [
          adminActionLog,
          [
            { id: 1, createdAt: new Date("2024-02-28T12:00:00Z"), actor: ACTOR, action: "confirm" },
            { id: 2, createdAt: new Date("2024-03-02T12:00:00Z"), actor: ACTOR, action: "confirm" },
          ],
        ],
      ]),
    );
  }

  it("löscht und anonymisiert nach den Fristen", async () => {
    const db = fixture();

    const counts = await purgeExpiredData(db, now);

    expect(counts).toEqual({
      requestsDeleted: 5,
      requestsAnonymized: 1,
      invoicesDeleted: 1,
      manualStaysDeleted: 1,
      logEntriesDeleted: 1,
    });
    expect(db.tables.get(bookingRequest)!.map((row) => row.id)).toEqual([2, 6, 7]);
    expect(db.tables.get(bookingRequest)!.find((row) => row.id === 7)).toMatchObject({
      name: "gelöscht",
      email: "gelöscht",
      phone: null,
      message: null,
      anonymizedAt: now,
    });
    expect(db.tables.get(invoice)!.map((row) => row.id)).toEqual([70]);
    expect(db.tables.get(blockedPeriod)!.map((row) => row.id)).toEqual([70, 91, 92]);
  });

  it("löscht Rechnungen vor ihren Anfragen (Fremdschlüssel)", async () => {
    const db = fixture();

    await purgeExpiredData(db, now);

    expect(db.ops.indexOf("delete invoice")).toBeLessThan(db.ops.indexOf("delete booking_request"));
  });

  it("räumt Protokolleinträge älter als 3 Jahre ab und protokolliert den Lauf mit Anzahlen", async () => {
    const db = fixture();

    await purgeExpiredData(db, now);

    const logs = db.tables.get(adminActionLog)!;
    expect(logs.map((row) => row.id)).toContain(2);
    expect(logs.map((row) => row.id)).not.toContain(1);
    expect(logs.at(-1)).toMatchObject({
      actor: "system",
      action: "purge",
      bookingRequestId: null,
      blockedPeriodId: null,
      details: {
        requestsDeleted: 5,
        requestsAnonymized: 1,
        invoicesDeleted: 1,
        manualStaysDeleted: 1,
        logEntriesDeleted: 1,
      },
    });
  });

  it("schreibt weder ins Protokoll noch ins Log personenbezogene Daten", async () => {
    const db = fixture();

    const counts = await purgeExpiredData(db, now);

    const message = purgeLogMessage(counts);
    const purgeEntry = JSON.stringify(db.tables.get(adminActionLog)!.at(-1));
    for (const text of PERSONAL) {
      expect(message).not.toContain(text);
      expect(purgeEntry).not.toContain(text);
    }
    // Außer Wörtern nur Zahlen.
    expect(message.replace(/[0-9]+/g, "#")).toBe(
      "Automatische Löschung: # Anfragen gelöscht, # anonymisiert, # Rechnungen gelöscht, # manuelle Aufenthalte gelöscht, # Protokolleinträge gelöscht",
    );
  });

  it("protokolliert auch einen Lauf, bei dem nichts fällig war", async () => {
    const db = createFakeDb(new Map());

    const counts = await purgeExpiredData(db, now);

    expect(Object.values(counts)).toEqual([0, 0, 0, 0, 0]);
    expect(db.tables.get(adminActionLog)).toHaveLength(1);
    expect(db.ops).toEqual([]);
  });
});
