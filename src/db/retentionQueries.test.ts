import { describe, it, expect } from "vitest";
import { getTableColumns, getTableName, type Column, type SQL, type Table } from "drizzle-orm";
import { compileCondition, compileOrder } from "./fakeConditions";
import { adminActionLog, blockedPeriod, bookingRequest, invoice } from "./schema";
import {
  deleteBookingRequest,
  getLastPurgeRun,
  getRetentionPreview,
  purgeExpiredData,
  purgeLogMessage,
  REQUEST_ALREADY_ANONYMIZED_ERROR,
  REQUEST_NOT_FOUND_ERROR,
  STAY_AHEAD_ERROR,
} from "./retentionQueries";

type Row = Record<string, unknown>;

/**
 * In-Memory-Fake für die von retentionQueries.ts genutzte Teilmenge der
 * Drizzle-API: select(fields).from(t)[.where(c)][.orderBy(…)][.limit(n)][.for(m)],
 * insert, update,
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
  /** Gelesene bzw. gesperrt gelesene Zeilen als "tabelle:id". */
  const reads: string[] = [];
  const lockedRows: string[] = [];
  const transactionConfigs: unknown[] = [];

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
    reads,
    lockedRows,
    transactionConfigs,
    select: (fields: Record<string, unknown>) => ({
      from: (table: Table) => {
        let condition: SQL | undefined;
        let order: SQL[] = [];
        let limit: number | undefined;
        let locked = false;
        // Erst beim `await` ausgewertet, wie Drizzle: So zählt jede Abfrage
        // ihre gelesenen und gesperrten Zeilen genau einmal.
        const run = () => {
          const matches = compileCondition(table, condition);
          let found = rows(table).filter((row) => matches(row));
          if (order.length > 0) found = [...found].sort(compileOrder(table, order));
          if (limit !== undefined) found = found.slice(0, limit);
          const ids = found.map((row) => `${getTableName(table)}:${String(row.id)}`);
          reads.push(...ids);
          if (locked) lockedRows.push(...ids);
          return found.map((row) => project(table, fields, row));
        };
        const query = {
          where: (next: SQL) => {
            condition = next;
            return query;
          },
          orderBy: (...next: SQL[]) => {
            order = next;
            return query;
          },
          limit: (next: number) => {
            limit = next;
            return query;
          },
          for: (mode: string) => {
            locks.push(mode);
            locked = true;
            return query;
          },
          then: <T,>(resolve: (value: Row[]) => T, reject?: (error: unknown) => T) =>
            Promise.resolve().then(run).then(resolve, reject),
        };
        return query;
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
    transaction: async <T,>(callback: (tx: never) => Promise<T>, config?: unknown): Promise<T> => {
      transactionConfigs.push(config);
      return callback(db as never);
    },
  };
  return db;
}

/**
 * Für Funktionen, die nur `select` brauchen: Der Fake erfüllt nur die genutzte
 * Teilmenge der Drizzle-API, daher `never` wie bei `transaction` oben.
 */
const selectDb = (db: ReturnType<typeof createFakeDb>) => db as never;

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function guestRequest(overrides: Row): Row {
  return {
    id: 1,
    name: "Erika Musterfrau",
    email: "erika@example.invalid",
    phone: "0176 1234567",
    street: "Deichstraße 5",
    postalCode: "26506",
    city: "Norden",
    country: "Deutschland",
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
const PERSONAL = ["Musterfrau", "erika@", "0176", "Deichstraße", "Hund", "Janssen", "Wasserschaden"];

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
      street: null,
      postalCode: null,
      city: null,
      country: null,
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
            { id: 50, kind: "booking", bookingRequestId: 5, guestName: null, endDate: day("2022-08-10") },
            { id: 70, kind: "booking", bookingRequestId: 7, guestName: null, endDate: day("2022-07-01") },
            // Altbestand manuell, Abreise 2022: gelöscht.
            { id: 90, kind: "legacy_stay", bookingRequestId: null, guestName: "Familie Janssen", endDate: day("2022-05-01") },
            // Altbestand manuell, Abreise 2024: bleibt.
            { id: 91, kind: "legacy_stay", bookingRequestId: null, guestName: "Familie Janssen", endDate: day("2024-05-01") },
            // Sperrzeitraum ohne Gast: bleibt, egal wie alt.
            { id: 92, kind: "block", bookingRequestId: null, guestName: null, endDate: day("2019-05-01") },
            // Intern, Abreise 1.9.2026 → löschbar ab 1.3.2027: gelöscht.
            { id: 93, kind: "internal", bookingRequestId: null, guestName: null, note: "Familie Janssen", endDate: day("2026-09-01") },
            // Intern, Abreise 2.9.2026 → löschbar ab 2.3.2027: bleibt.
            { id: 94, kind: "internal", bookingRequestId: null, guestName: null, note: "Freunde", endDate: day("2026-09-02") },
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
      internalStaysDeleted: 1,
      logEntriesDeleted: 1,
    });
    expect(db.tables.get(bookingRequest)!.map((row) => row.id)).toEqual([2, 6, 7]);
    expect(db.tables.get(bookingRequest)!.find((row) => row.id === 7)).toMatchObject({
      name: "gelöscht",
      email: "gelöscht",
      phone: null,
      street: null,
      postalCode: null,
      city: null,
      country: null,
      message: null,
      anonymizedAt: now,
    });
    expect(db.tables.get(invoice)!.map((row) => row.id)).toEqual([70]);
    expect(db.tables.get(blockedPeriod)!.map((row) => row.id)).toEqual([70, 91, 92, 94]);
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
        internalStaysDeleted: 1,
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
      "Automatische Löschung: # Anfragen gelöscht, # anonymisiert, # Rechnungen gelöscht, # manuelle Aufenthalte gelöscht, # interne Belegungen gelöscht, # Protokolleinträge gelöscht",
    );
  });

  it("liest und sperrt nur vorgefilterte Kandidaten, in fester Reihenfolge", async () => {
    const db = fixture();

    await purgeExpiredData(db, now);

    // Anfragen (offen, abgelehnt, abgelehnt ohne decided_at, bestätigt), dann
    // Rechnungen, dann Belegungen (intern, Altbestand) – wie die Admin-Aktionen
    // erst Anfrage, dann Rechnung. Anfrage 2 und Belegung 94 liegen im
    // Sicherheitsabstand: gelesen, aber nicht gelöscht.
    expect(db.lockedRows).toEqual([
      "booking_request:1",
      "booking_request:2",
      "booking_request:3",
      "booking_request:4",
      "booking_request:5",
      "booking_request:7",
      "booking_request:8",
      "invoice:70",
      "invoice:80",
      "blocked_period:93",
      "blocked_period:94",
      "blocked_period:90",
    ]);
    // Buchung mit Abreise 2024, Altbestand 2024, Sperrzeitraum und Belegungen
    // von Buchungen: weder gelesen noch gesperrt.
    for (const id of [
      "booking_request:6",
      "blocked_period:50",
      "blocked_period:70",
      "blocked_period:91",
      "blocked_period:92",
    ]) {
      expect(db.reads).not.toContain(id);
    }
  });

  it("liest Zeilen, die erst später fällig werden, gar nicht", async () => {
    const db = fixture();
    db.tables.get(bookingRequest)!.push(
      guestRequest({ id: 20, createdAt: new Date("2027-01-15T10:00:00Z") }),
      guestRequest({
        id: 21,
        status: "declined",
        createdAt: new Date("2026-06-01T10:00:00Z"),
        decidedAt: new Date("2027-01-15T10:00:00Z"),
      }),
      guestRequest({ id: 22, status: "confirmed", endDate: day("2026-08-08") }),
    );
    db.tables.get(invoice)!.push({ id: 220, bookingRequestId: 22, year: 2026 });
    db.tables
      .get(blockedPeriod)!
      .push({ id: 95, kind: "internal", bookingRequestId: null, guestName: null, endDate: day("2027-01-10") });

    const counts = await purgeExpiredData(db, now);

    for (const id of [
      "booking_request:20",
      "booking_request:21",
      "booking_request:22",
      "invoice:220",
      "blocked_period:95",
    ]) {
      expect(db.reads).not.toContain(id);
    }
    expect(counts.requestsDeleted).toBe(5);
    expect(counts.internalStaysDeleted).toBe(1);
  });

  it("löscht eine Anfrage, die nach deutscher Zeit heute fällig wird", async () => {
    // 31.8.2026, 23:30 Uhr deutscher Zeit ist in UTC noch der 31.8. – nach
    // deutscher Zeit aber der 1.9.: fällig am 1.3.2027, also heute.
    const db = createFakeDb(
      new Map<Table, Row[]>([
        [bookingRequest, [guestRequest({ id: 30, createdAt: new Date("2026-08-31T21:30:00Z") })]],
      ]),
    );

    const counts = await purgeExpiredData(db, now);

    expect(counts.requestsDeleted).toBe(1);
  });

  it("läuft unter READ COMMITTED, damit nur gefundene Zeilen gesperrt bleiben", async () => {
    const db = fixture();

    await purgeExpiredData(db, now);

    expect(db.transactionConfigs).toEqual([{ isolationLevel: "read committed" }]);
  });

  it("protokolliert auch einen Lauf, bei dem nichts fällig war", async () => {
    const db = createFakeDb(new Map());

    const counts = await purgeExpiredData(db, now);

    expect(Object.values(counts)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(db.tables.get(adminActionLog)).toHaveLength(1);
    expect(db.ops).toEqual([]);
  });

  describe("getRetentionPreview", () => {
    const today = day("2027-03-01");

    it("listet die Löschungen der nächsten 90 Tage, schon Fälliges auf heute", async () => {
      const db = fixture();

      const entries = await getRetentionPreview(selectDb(db), today);

      expect(
        entries.map(({ date, kind, source, id, label }) => [
          date.toISOString().slice(0, 10),
          kind,
          source,
          id,
          label,
        ]),
      ).toEqual([
        ["2027-03-01", "delete_request", "request", 1, "Erika Musterfrau"],
        ["2027-03-01", "delete_request", "request", 3, "Erika Musterfrau"],
        ["2027-03-01", "delete_request", "request", 4, "Erika Musterfrau"],
        ["2027-03-01", "delete_request", "request", 5, "Erika Musterfrau"],
        ["2027-03-01", "anonymize_request", "request", 7, "Erika Musterfrau"],
        ["2027-03-01", "delete_invoice_and_request", "request", 8, "gelöscht"],
        ["2027-03-01", "delete_legacy_stay", "blocked_period", 90, "Familie Janssen"],
        ["2027-03-01", "delete_internal_stay", "blocked_period", 93, "Familie Janssen"],
        ["2027-03-02", "delete_request", "request", 2, "Erika Musterfrau"],
        ["2027-03-02", "delete_internal_stay", "blocked_period", 94, "Freunde"],
      ]);
      expect(entries[0]).toMatchObject({
        startDate: day("2026-08-01"),
        endDate: day("2026-08-08"),
      });
    });

    it("liest ohne Sperre und lässt Zeilen jenseits des Horizonts aus", async () => {
      const db = fixture();

      await getRetentionPreview(selectDb(db), today);

      expect(db.locks).toEqual([]);
      expect(db.reads).not.toContain("booking_request:6");
      expect(db.reads).not.toContain("blocked_period:91");
      expect(db.reads).not.toContain("blocked_period:92");
    });

    it("stimmt für heute mit dem überein, was der Lauf tut", async () => {
      const entries = await getRetentionPreview(selectDb(fixture()), today);
      const counts = await purgeExpiredData(fixture(), now);

      const dueToday = entries.filter((entry) => entry.date.getTime() === today.getTime());
      const count = (...kinds: string[]) =>
        dueToday.filter((entry) => kinds.includes(entry.kind)).length;
      expect(count("delete_request", "delete_invoice_and_request")).toBe(counts.requestsDeleted);
      expect(count("anonymize_request")).toBe(counts.requestsAnonymized);
      expect(count("delete_invoice_and_request")).toBe(counts.invoicesDeleted);
      expect(count("delete_legacy_stay")).toBe(counts.manualStaysDeleted);
      expect(count("delete_internal_stay")).toBe(counts.internalStaysDeleted);
    });
  });
});

describe("getLastPurgeRun", () => {
  it("liefert null, solange es keinen Lauf gab", async () => {
    const db = createFakeDb(
      new Map<Table, Row[]>([
        [adminActionLog, [{ id: 1, createdAt: new Date("2027-03-01T09:00:00Z"), action: "confirm" }]],
      ]),
    );

    await expect(getLastPurgeRun(selectDb(db))).resolves.toBeNull();
  });

  it("liest den jüngsten Lauf mit Zeitpunkt und Anzahlen", async () => {
    const db = createFakeDb(
      new Map<Table, Row[]>([
        [
          adminActionLog,
          [
            {
              id: 1,
              createdAt: new Date("2027-02-28T09:01:00Z"),
              action: "purge",
              details: { requestsDeleted: 9 },
            },
            {
              id: 2,
              createdAt: new Date("2027-03-01T09:01:00Z"),
              action: "purge",
              details: {
                requestsDeleted: 2,
                requestsAnonymized: 1,
                invoicesDeleted: 0,
                manualStaysDeleted: 0,
                internalStaysDeleted: 3,
                logEntriesDeleted: 4,
              },
            },
            // Jünger, aber kein Lauf.
            { id: 3, createdAt: new Date("2027-03-01T10:00:00Z"), action: "confirm", details: null },
          ],
        ],
      ]),
    );

    await expect(getLastPurgeRun(selectDb(db))).resolves.toEqual({
      at: new Date("2027-03-01T09:01:00Z"),
      counts: {
        requestsDeleted: 2,
        requestsAnonymized: 1,
        invoicesDeleted: 0,
        manualStaysDeleted: 0,
        internalStaysDeleted: 3,
        logEntriesDeleted: 4,
      },
    });
  });

  it("zählt fehlende Anzahlen älterer Einträge als 0", async () => {
    const db = createFakeDb(
      new Map<Table, Row[]>([
        [
          adminActionLog,
          [
            {
              id: 1,
              createdAt: new Date("2026-10-01T09:01:00Z"),
              action: "purge",
              details: {
                requestsDeleted: 1,
                requestsAnonymized: 0,
                invoicesDeleted: 0,
                manualStaysDeleted: 2,
                logEntriesDeleted: 0,
              },
            },
          ],
        ],
      ]),
    );

    const run = await getLastPurgeRun(selectDb(db));

    expect(run?.counts).toEqual({
      requestsDeleted: 1,
      requestsAnonymized: 0,
      invoicesDeleted: 0,
      manualStaysDeleted: 2,
      internalStaysDeleted: 0,
      logEntriesDeleted: 0,
    });
  });
});
