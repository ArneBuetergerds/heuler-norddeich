import { describe, it, expect, vi } from "vitest";
import { getTableColumns, getTableName, is, Column, type SQL, type Table } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { compileCondition, compileOrder } from "./fakeConditions";
import { blockedPeriod, bookingRequest, type BookingRequest } from "./schema";

// queries.ts importiert den echten DB-Client als Vorgabe, der ohne
// DATABASE_URL beim Import wirft. Die Tests übergeben ihre eigene Fake-DB.
vi.mock("./client", () => ({ db: {} }));

const {
  getBookingHistory,
  getBookingRequestsByIds,
  getOccupancyInRange,
  getPendingBookingRequests,
  getPublicOccupancy,
  isRangeFree,
} = await import("./queries");

type Row = Record<string, unknown>;

/**
 * Schmale Fake-DB wie in invoiceQueries.test.ts, aber mit ausgewerteten
 * Bedingungen (siehe fakeConditions.ts): `select(fields?).from(t)` mit
 * optionalem `leftJoin`, `where`, `orderBy`, `limit`, `await`-bar wie Drizzle.
 *
 * `leftJoin` versteht nur `eq(spalte, spalte)` zwischen Haupt- und
 * verbundener Tabelle; `where`, `orderBy` und `fields` ohne Spalte beziehen
 * sich auf die Haupttabelle. Spalten der verbundenen Tabelle sind `null`, wenn
 * keine Zeile passt – wie in SQL.
 *
 * Felder aus SQL-Ausdrücken (`sql\`…\``) kann der Fake nicht auswerten; der
 * Test gibt sie über `computed` vor und prüft den Ausdruck getrennt.
 */
function createFakeDb(
  rowsByTable: Map<Table, Row[]>,
  computed: Record<string, (row: Row) => unknown> = {},
) {
  type Query = { table: Table; limit?: number; fields: string[]; joins?: Table[] };
  const queries: Query[] = [];

  const db = {
    queries,
    select: (fields?: Record<string, unknown>) => ({
      from: (table: Table) => {
        let condition: SQL | undefined;
        let order: SQL[] = [];
        let limit: number | undefined;
        let join: { table: Table; matches: (row: Row, other: Row) => boolean } | undefined;
        const query: Query = {
          table,
          fields: fields ? Object.keys(fields) : [],
        };
        queries.push(query);

        const keyOf = (column: Column, owner: Table = table) =>
          Object.entries(getTableColumns(owner)).find(([, entry]) => entry === column)?.[0];

        function run(): Row[] {
          const matches = compileCondition(table, condition);
          let rows = (rowsByTable.get(table) ?? []).filter((row) => matches(row));
          if (order.length > 0) {
            rows = [...rows].sort(compileOrder(table, order));
          }
          if (limit !== undefined) {
            rows = rows.slice(0, limit);
          }
          if (!fields) {
            return rows;
          }
          return rows.map((row) => {
            const joined = join
              ? (rowsByTable.get(join.table) ?? []).find((other) => join!.matches(row, other))
              : undefined;
            return Object.fromEntries(
              Object.entries(fields).map(([name, field]) => {
                if (is(field, Column) && join && field.table === join.table) {
                  return [name, joined ? joined[keyOf(field, join.table) ?? name] : null];
                }
                if (is(field, Column)) {
                  return [name, row[keyOf(field) ?? name]];
                }
                if (name in computed) {
                  return [name, computed[name](row)];
                }
                throw new Error(`Feld ${name} kann der Fake nicht auswerten`);
              }),
            );
          });
        }

        const builder = {
          leftJoin(other: Table, on: SQL) {
            const { sql } = new MySqlDialect().sqlToQuery(on);
            const match = /^`(\w+)`\.`(\w+)` = `(\w+)`\.`(\w+)`$/.exec(sql);
            if (!match) {
              throw new Error(`Join-Bedingung nicht unterstützt: ${sql}`);
            }
            const keyIn = (owner: Table, tableName: string, columnName: string) => {
              const key = Object.entries(getTableColumns(owner)).find(
                ([, column]) => column.name === columnName,
              )?.[0];
              if (getTableName(owner) !== tableName || !key) {
                throw new Error(`Join-Spalte ${tableName}.${columnName} nicht gefunden`);
              }
              return key;
            };
            // Die Seiten von `eq` dürfen in beliebiger Reihenfolge stehen.
            const [left, right] =
              match[1] === getTableName(table)
                ? [keyIn(table, match[1], match[2]), keyIn(other, match[3], match[4])]
                : [keyIn(table, match[3], match[4]), keyIn(other, match[1], match[2])];
            join = {
              table: other,
              matches: (row, otherRow) => row[left] !== null && row[left] === otherRow[right],
            };
            query.joins = [...(query.joins ?? []), other];
            return builder;
          },
          where(next: SQL | undefined) {
            condition = next;
            return builder;
          },
          orderBy(...next: SQL[]) {
            order = next;
            return builder;
          },
          limit(next: number) {
            limit = next;
            query.limit = next;
            return builder;
          },
          then<T>(resolve: (rows: Row[]) => T, reject: (error: unknown) => T) {
            return Promise.resolve().then(run).then(resolve, reject);
          },
        };
        return builder;
      },
    }),
  };
  return db;
}

function period(id: number, start: string, end: string, extra: Partial<Row> = {}): Row {
  return {
    id,
    startDate: new Date(start),
    endDate: new Date(end),
    note: null,
    guestName: null,
    bookingRequestId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...extra,
  };
}

describe("isRangeFree", () => {
  // Bestehender Aufenthalt 10.08. bis 15.08. (Abreise).
  const periods = new Map<Table, Row[]>([
    [blockedPeriod, [period(1, "2026-08-10", "2026-08-15", { guestName: "Familie Janssen" })]],
  ]);

  it.each([
    ["Abreisetag = Anreisetag des Bestehenden", "2026-08-05", "2026-08-10"],
    ["Anreisetag = Abreisetag des Bestehenden", "2026-08-15", "2026-08-20"],
    ["ganz davor", "2026-07-01", "2026-07-05"],
  ])("ist frei: %s", async (_fall, start, end) => {
    const fakeDb = createFakeDb(periods);

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await expect(isRangeFree(new Date(start), new Date(end), fakeDb)).resolves.toBe(true);
  });

  it.each([
    ["ein Tag am Anfang", "2026-08-05", "2026-08-11"],
    ["ein Tag am Ende", "2026-08-14", "2026-08-20"],
    ["umschließend", "2026-08-01", "2026-08-31"],
    ["innerhalb", "2026-08-11", "2026-08-12"],
    ["deckungsgleich", "2026-08-10", "2026-08-15"],
  ])("ist belegt: %s", async (_fall, start, end) => {
    const fakeDb = createFakeDb(periods);

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await expect(isRangeFree(new Date(start), new Date(end), fakeDb)).resolves.toBe(false);
  });

  it("liest höchstens eine Zeile und nur die ID", async () => {
    const fakeDb = createFakeDb(periods);

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await isRangeFree(new Date("2026-08-01"), new Date("2026-08-31"), fakeDb);

    expect(fakeDb.queries).toEqual([{ table: blockedPeriod, limit: 1, fields: ["id"] }]);
  });
});

describe("getPublicOccupancy", () => {
  const today = new Date("2026-10-17");
  const rows = new Map<Table, Row[]>([
    [
      blockedPeriod,
      [
        period(1, "2026-09-01", "2026-09-08", { bookingRequestId: 3 }),
        // Abreise heute: Heute ist schon wieder frei.
        period(2, "2026-10-10", "2026-10-17", { guestName: "Familie Janssen" }),
        // Abreise morgen: sperrt heute noch.
        period(3, "2026-10-12", "2026-10-18", { bookingRequestId: 4 }),
        period(4, "2026-11-01", "2026-11-05", { note: "Wartung" }),
        period(5, "2026-12-20", "2027-01-02", { guestName: "Familie Ahrends" }),
      ],
    ],
  ]);
  const computed = {
    hasGuest: (row: Row) => row.bookingRequestId !== null || row.guestName !== null,
  };

  it("liefert nur Zeiträume, die nach heute enden", async () => {
    const fakeDb = createFakeDb(rows, computed);

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    const occupancy = await getPublicOccupancy(today, fakeDb);

    expect(occupancy).toEqual({
      stays: [
        { startDate: new Date("2026-10-12"), endDate: new Date("2026-10-18") },
        { startDate: new Date("2026-12-20"), endDate: new Date("2027-01-02") },
      ],
      maintenance: [{ startDate: new Date("2026-11-01"), endDate: new Date("2026-11-05") }],
    });
  });

  it("fragt weder Namen noch Notizen ab", async () => {
    const fakeDb = createFakeDb(rows, computed);

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await getPublicOccupancy(today, fakeDb);

    expect(fakeDb.queries[0].fields).toEqual(["startDate", "endDate", "hasGuest"]);
  });

  it("bildet hasGuest in SQL aus Anfrage und manuellem Gastnamen", async () => {
    // Der Fake wertet `hasGuest` nur nach – hier wird geprüft, dass der
    // SQL-Ausdruck dieselbe Regel enthält wie splitOccupancy.
    let hasGuestSql: unknown;
    const fakeDb = {
      select: (fields: Record<string, unknown>) => {
        hasGuestSql = fields.hasGuest;
        return { from: () => ({ where: async () => [] }) };
      },
    };

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await getPublicOccupancy(today, fakeDb);

    const { sql } = new MySqlDialect().sqlToQuery(hasGuestSql as SQL);
    expect(sql).toBe(
      "(`blocked_period`.`booking_request_id` is not null or `blocked_period`.`guest_name` is not null)",
    );
  });
});

function request(id: number, status: BookingRequest["status"], createdAt: string): Row {
  return {
    id,
    name: `Gast ${id}`,
    email: `gast${id}@example.invalid`,
    phone: null,
    startDate: new Date("2027-08-01"),
    endDate: new Date("2027-08-05"),
    message: null,
    guests: 2,
    linens: 0,
    towels: 0,
    status,
    reasonNote: null,
    createdAt: new Date(createdAt),
    decidedAt: null,
    anonymizedAt: null,
  };
}

describe("Anfragen für die Admin-Übersicht", () => {
  const requests = new Map<Table, Row[]>([
    [
      bookingRequest,
      [
        request(1, "confirmed", "2026-01-10T08:00:00Z"),
        request(2, "pending", "2026-02-10T08:00:00Z"),
        request(3, "declined", "2026-03-10T08:00:00Z"),
        request(4, "confirmed", "2026-04-10T08:00:00Z"),
        request(5, "pending", "2026-05-10T08:00:00Z"),
      ],
    ],
  ]);

  it("lädt alle offenen Anfragen, neueste zuerst, ohne Begrenzung", async () => {
    const fakeDb = createFakeDb(requests);

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    const pending = await getPendingBookingRequests(fakeDb);

    expect(pending.map((entry) => entry.id)).toEqual([5, 2]);
    expect(fakeDb.queries[0].limit).toBeUndefined();
  });

  it("begrenzt die Historie und meldet, dass es ältere gibt", async () => {
    const fakeDb = createFakeDb(requests);

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    const history = await getBookingHistory({ limit: 2 }, fakeDb);

    expect(history.entries.map((entry) => entry.id)).toEqual([4, 3]);
    expect(history.hasMore).toBe(true);
    // Ein Eintrag mehr als angezeigt, um "ältere vorhanden" ohne Zählabfrage zu erkennen.
    expect(fakeDb.queries[0].limit).toBe(3);
  });

  it("meldet keine älteren Einträge, wenn die Historie ins Limit passt", async () => {
    const fakeDb = createFakeDb(requests);

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    const history = await getBookingHistory({ limit: 3 }, fakeDb);

    expect(history.entries.map((entry) => entry.id)).toEqual([4, 3, 1]);
    expect(history.hasMore).toBe(false);
  });

  it("lädt mit limit null die ganze Historie", async () => {
    const fakeDb = createFakeDb(requests);

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    const history = await getBookingHistory({ limit: null }, fakeDb);

    expect(history).toMatchObject({ hasMore: false });
    expect(history.entries.map((entry) => entry.id)).toEqual([4, 3, 1]);
    expect(fakeDb.queries[0].limit).toBeUndefined();
  });

  it("lädt Anfragen nur zu den angegebenen IDs", async () => {
    const fakeDb = createFakeDb(requests);

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    const found = await getBookingRequestsByIds([1, 4], fakeDb);

    expect(found.map((entry) => entry.id).sort()).toEqual([1, 4]);
  });

  it("fragt ohne IDs gar nicht erst ab", async () => {
    const fakeDb = createFakeDb(requests);

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await expect(getBookingRequestsByIds([], fakeDb)).resolves.toEqual([]);
    expect(fakeDb.queries).toHaveLength(0);
  });
});

describe("getOccupancyInRange", () => {
  // Fenster für Oktober 2026 wie `monthWindow`: Vortag des Ersten bis
  // exklusiv zum Ersten des Folgemonats.
  const start = new Date("2026-09-30");
  const end = new Date("2026-11-01");

  const rows = new Map<Table, Row[]>([
    [
      blockedPeriod,
      [
        // Abreise am Ersten: im Kalender als Abreisetag, also dabei.
        period(1, "2026-09-24", "2026-10-01", { bookingRequestId: 11 }),
        // Abreise am Letzten des Vormonats: nicht dabei.
        period(2, "2026-09-20", "2026-09-30", { guestName: "Familie Ahrends" }),
        // Über den Monatswechsel hinaus.
        period(3, "2026-10-28", "2026-11-04", { bookingRequestId: 12 }),
        // Anreise am Monatsletzten: dabei.
        period(4, "2026-10-31", "2026-11-07", { guestName: "Familie Janssen" }),
        // Anreise am Ersten des Folgemonats: nicht dabei.
        period(5, "2026-11-01", "2026-11-08", { guestName: "Familie Weber" }),
        // Sperrzeitraum bis einschließlich 30.09. (Ende exklusiv gespeichert):
        // dabei, er entscheidet über die Einfärbung einer Anreise am Ersten.
        period(6, "2026-09-28", "2026-10-01", { note: "Wartung" }),
        // Sperrzeitraum, der am 30.09. schon endet: nicht dabei.
        period(7, "2026-09-25", "2026-09-30", { note: "Eigennutzung" }),
      ],
    ],
    [
      bookingRequest,
      [
        { ...request(11, "confirmed", "2026-08-01T08:00:00Z"), name: "Erika Muster" },
        { ...request(12, "confirmed", "2026-08-02T08:00:00Z"), name: "Peter Wilkens" },
      ],
    ],
  ]);

  it("liefert genau die Zeiträume, die das Fenster berühren", async () => {
    const fakeDb = createFakeDb(rows);

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    const occupancy = await getOccupancyInRange(start, end, fakeDb);

    expect(occupancy.stays.map((stay) => stay.id)).toEqual([1, 3, 4]);
    expect(occupancy.maintenance.map((block) => block.id)).toEqual([6]);
  });

  it("nimmt den Gastnamen aus der verknüpften Anfrage, sonst den manuellen", async () => {
    const fakeDb = createFakeDb(rows);

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    const occupancy = await getOccupancyInRange(start, end, fakeDb);

    expect(occupancy.stays).toEqual([
      {
        id: 1,
        startDate: new Date("2026-09-24"),
        endDate: new Date("2026-10-01"),
        guestName: "Erika Muster",
        bookingRequestId: 11,
      },
      {
        id: 3,
        startDate: new Date("2026-10-28"),
        endDate: new Date("2026-11-04"),
        guestName: "Peter Wilkens",
        bookingRequestId: 12,
      },
      {
        id: 4,
        startDate: new Date("2026-10-31"),
        endDate: new Date("2026-11-07"),
        guestName: "Familie Janssen",
        bookingRequestId: null,
      },
    ]);
    expect(occupancy.maintenance).toEqual([
      {
        id: 6,
        startDate: new Date("2026-09-28"),
        endDate: new Date("2026-10-01"),
        note: "Wartung",
      },
    ]);
  });

  it("filtert in der Abfrage und verbindet die Anfrage für den Namen", async () => {
    const fakeDb = createFakeDb(rows);

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await getOccupancyInRange(start, end, fakeDb);

    expect(fakeDb.queries).toEqual([
      {
        table: blockedPeriod,
        joins: [bookingRequest],
        fields: [
          "id",
          "startDate",
          "endDate",
          "note",
          "guestName",
          "bookingRequestId",
          "requestName",
        ],
      },
    ]);
  });

  it("findet mit dem Fenster der offenen Anfragen Belegungen außerhalb des angezeigten Monats", async () => {
    const fakeDb = createFakeDb(rows);

    // Offene Anfragen im November – angezeigt wird Oktober.
    const pendingStart = new Date("2026-11-05");
    const pendingEnd = new Date("2026-11-10");

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    const occupancy = await getOccupancyInRange(pendingStart, pendingEnd, fakeDb);

    expect(occupancy.stays.map((stay) => stay.id)).toEqual([4, 5]);
  });
});
