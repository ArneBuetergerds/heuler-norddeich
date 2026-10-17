import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getTableName, is, Column, type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { adminActionLog, invoice, type BookingRequest, type Invoice } from "./schema";
import { compileCondition } from "./fakeConditions";

// invoiceQueries.ts importiert den echten DB-Client als Vorgabe, der ohne
// DATABASE_URL beim Import wirft. Die Tests übergeben ihre eigene Fake-DB.
vi.mock("./client", () => ({ db: {} }));

const {
  createInvoice,
  duplicateKeyName,
  getInvoiceSummaries,
  INVOICE_EXISTS_ERROR,
  INVOICE_NUMBER_CONFLICT_ERROR,
  NOT_CONFIRMED_ERROR,
  TAX_NUMBER_MISSING_ERROR,
} = await import("./invoiceQueries");

/**
 * Parameter einer Drizzle-Bedingung in Reihenfolge, z. B. `[2027, 3]` für
 * `and(eq(invoice.year, 2027), eq(invoice.sequence, 3))`. So kann die Fake-DB
 * filtern, ohne SQL auszuwerten.
 */
const dialect = new MySqlDialect();
function params(condition: SQL | undefined): unknown[] {
  return condition ? dialect.sqlToQuery(condition).params : [];
}

// Schmale, testlokale Fake-DB wie in adminQueries.test.ts: erfüllt nur die
// von createInvoice genutzte Teilmenge der Drizzle-API (select/from/where/for,
// insert/values, transaction). Die Injektion erfolgt deshalb über
// `@ts-expect-error`.
type FakeDb = {
  invoices: Invoice[];
  /** Einträge in admin_action_log, getrennt von den Rechnungen. */
  logs: Record<string, unknown>[];
  select: (fields?: Record<string, unknown>) => {
    from: (table: Parameters<typeof getTableName>[0]) => {
      where: (condition: SQL | undefined) => Promise<unknown[]> & { for: () => Promise<unknown[]> };
    };
  };
  insert: (table: unknown) => {
    values: (values: Omit<Invoice, "id" | "createdAt">) => Promise<void>;
  };
  transaction: <T>(callback: (tx: FakeDb) => Promise<T>) => Promise<T>;
};

function createFakeDb({
  requests = [],
  invoices = [],
  insertErrors = [],
}: {
  requests?: BookingRequest[];
  invoices?: Invoice[];
  /**
   * Fehler, die die nächsten Inserts der Reihe nach werfen – so simuliert der
   * Test einen gleichzeitigen Request, der den Index zuerst belegt hat.
   */
  insertErrors?: unknown[];
}): FakeDb {
  const stored = [...invoices];
  const logs: Record<string, unknown>[] = [];
  const pendingErrors = [...insertErrors];

  function rowsFor(
    fields: Record<string, unknown> | undefined,
    table: string,
    values: unknown[],
  ): unknown[] {
    if (table === "booking_request") {
      return requests.filter((request) => request.id === values[0]);
    }
    if (fields && "hoechste" in fields) {
      const ofYear = stored.filter((row) => row.year === values[0]).map((row) => row.sequence);
      return [{ hoechste: ofYear.length > 0 ? Math.max(...ofYear) : null }];
    }
    if (fields && "id" in fields) {
      return stored.filter((row) => row.bookingRequestId === values[0]).map(({ id }) => ({ id }));
    }
    return stored.filter((row) => row.year === values[0] && row.sequence === values[1]);
  }

  const fakeDb: FakeDb = {
    invoices: stored,
    logs,
    select: (fields) => ({
      from: (table) => ({
        where: (condition) => {
          const rows = rowsFor(fields, getTableName(table), params(condition));
          return Object.assign(Promise.resolve(rows), { for: async () => rows });
        },
      }),
    }),
    insert: (table) => ({
      values: async (values) => {
        if (table === adminActionLog) {
          logs.push(values);
          return;
        }
        const error = pendingErrors.shift();
        if (error) throw error;
        stored.push({ ...values, id: stored.length + 100, createdAt: new Date() });
      },
    }),
    transaction: (callback) => callback(fakeDb),
  };
  return fakeDb;
}

const confirmed: BookingRequest = {
  id: 7,
  name: "Erika Musterfrau",
  email: "erika@example.invalid",
  phone: null,
  startDate: new Date("2027-08-29"),
  endDate: new Date("2027-09-05"),
  message: null,
  guests: 3,
  linens: 0,
  towels: 0,
  status: "confirmed",
  source: "online",
  reasonNote: null,
  createdAt: new Date("2027-02-03"),
  decidedAt: null,
  anonymizedAt: null,
};

function existingInvoice(overrides: Partial<Invoice>): Invoice {
  return {
    id: 1,
    year: 2027,
    sequence: 1,
    number: "RE-2027-0001",
    bookingRequestId: 1,
    // Inhalt spielt für die Nummernvergabe keine Rolle.
    snapshot: {} as Invoice["snapshot"],
    createdAt: new Date("2027-01-15"),
    ...overrides,
  };
}

/**
 * Fehler, wie ihn Drizzle bei einem doppelten Schlüssel wirft: Der Fehler des
 * mysql2-Treibers hängt als `cause` an einem `DrizzleQueryError`.
 */
function duplicateEntry(key: string): Error {
  const driverError = Object.assign(new Error(`Duplicate entry 'x' for key '${key}'`), {
    code: "ER_DUP_ENTRY",
    errno: 1062,
    sqlMessage: `Duplicate entry 'x' for key '${key}'`,
  });
  return new Error("Failed query: insert into `invoice` ...", { cause: driverError });
}

function deadlock(): Error {
  const driverError = Object.assign(new Error("Deadlock found"), {
    code: "ER_LOCK_DEADLOCK",
    errno: 1213,
    sqlMessage: "Deadlock found when trying to get lock; try restarting transaction",
  });
  return new Error("Failed query: insert into `invoice` ...", { cause: driverError });
}

const input = {
  bookingRequestId: confirmed.id,
  recipientName: "Erika Musterfrau",
  recipientAddress: ["Musterweg 1", "12345 Musterstadt"],
  issuedAt: new Date("2027-09-06T10:00:00Z"),
  actor: "admin@example.invalid",
};

describe("createInvoice", () => {
  beforeEach(() => {
    vi.stubEnv("INVOICE_TAX_NUMBER", "12/345/67890");
    vi.stubEnv("BANK_TRANSFER_DETAILS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stellt für eine bestätigte Buchung die erste Rechnung des Jahres mit Nummer 1 aus", async () => {
    const fakeDb = createFakeDb({ requests: [confirmed] });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    const created = await createInvoice(input, fakeDb);

    expect(created).toMatchObject({
      year: 2027,
      sequence: 1,
      number: "RE-2027-0001",
      bookingRequestId: confirmed.id,
    });
    expect(created.snapshot.seller.taxNumber).toBe("12/345/67890");
    expect(fakeDb.invoices).toHaveLength(1);
  });

  it("protokolliert die Rechnung in derselben Transaktion, ohne Empfängerdaten", async () => {
    const fakeDb = createFakeDb({ requests: [confirmed] });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await createInvoice(input, fakeDb);

    expect(fakeDb.logs).toEqual([
      {
        actor: "admin@example.invalid",
        action: "invoice_create",
        bookingRequestId: confirmed.id,
        blockedPeriodId: null,
        details: { number: "RE-2027-0001" },
      },
    ]);
    expect(JSON.stringify(fakeDb.logs)).not.toContain("Musterfrau");
  });

  it("protokolliert nichts, wenn keine Rechnung entsteht", async () => {
    const fakeDb = createFakeDb({ requests: [{ ...confirmed, status: "pending" }] });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await expect(createInvoice(input, fakeDb)).rejects.toThrow(NOT_CONFIRMED_ERROR);
    expect(fakeDb.logs).toHaveLength(0);
  });

  it.each(["pending", "declined"] as const)("lehnt eine Anfrage mit Status %s ab", async (status) => {
    const fakeDb = createFakeDb({ requests: [{ ...confirmed, status }] });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await expect(createInvoice(input, fakeDb)).rejects.toThrow(NOT_CONFIRMED_ERROR);
    expect(fakeDb.invoices).toHaveLength(0);
  });

  it("lehnt eine unbekannte Buchung ab", async () => {
    const fakeDb = createFakeDb({});

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await expect(createInvoice(input, fakeDb)).rejects.toThrow(NOT_CONFIRMED_ERROR);
  });

  it("stellt zu derselben Buchung keine zweite Rechnung aus", async () => {
    const fakeDb = createFakeDb({
      requests: [confirmed],
      invoices: [existingInvoice({ bookingRequestId: confirmed.id })],
    });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await expect(createInvoice(input, fakeDb)).rejects.toThrow(INVOICE_EXISTS_ERROR);
    expect(fakeDb.invoices).toHaveLength(1);
  });

  it("vergibt die höchste Nummer des Jahres plus eins, auch bei Lücken", async () => {
    const fakeDb = createFakeDb({
      requests: [confirmed],
      invoices: [
        existingInvoice({ id: 1, sequence: 1, number: "RE-2027-0001", bookingRequestId: 1 }),
        existingInvoice({ id: 2, sequence: 4, number: "RE-2027-0004", bookingRequestId: 2 }),
        // Höhere Nummer aus dem Vorjahr zählt nicht mit.
        existingInvoice({
          id: 3,
          year: 2026,
          sequence: 9,
          number: "RE-2026-0009",
          bookingRequestId: 3,
        }),
      ],
    });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    const created = await createInvoice(input, fakeDb);

    expect(created).toMatchObject({ year: 2027, sequence: 5, number: "RE-2027-0005" });
  });

  it("beginnt im neuen Jahr wieder bei 1", async () => {
    const fakeDb = createFakeDb({
      requests: [confirmed],
      invoices: [existingInvoice({ sequence: 12, number: "RE-2027-0012", bookingRequestId: 1 })],
    });

    const created = await createInvoice(
      { ...input, issuedAt: new Date("2028-01-02T10:00:00Z") },
      // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
      fakeDb,
    );

    expect(created).toMatchObject({ year: 2028, sequence: 1, number: "RE-2028-0001" });
  });

  it("meldet eine gleichzeitig angelegte Rechnung zur selben Buchung als INVOICE_EXISTS_ERROR", async () => {
    const fakeDb = createFakeDb({
      requests: [confirmed],
      insertErrors: [duplicateEntry("invoice.invoice_booking_request")],
    });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await expect(createInvoice(input, fakeDb)).rejects.toThrow(INVOICE_EXISTS_ERROR);
    expect(fakeDb.invoices).toHaveLength(0);
  });

  it.each(["invoice.invoice_year_sequence", "invoice_number"])(
    "versucht es bei einer Nummernkollision (%s) einmal neu",
    async (key) => {
      const fakeDb = createFakeDb({
        requests: [confirmed],
        insertErrors: [duplicateEntry(key)],
      });

      // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
      const created = await createInvoice(input, fakeDb);

      expect(created).toMatchObject({ year: 2027, sequence: 1, bookingRequestId: confirmed.id });
      expect(fakeDb.invoices).toHaveLength(1);
    },
  );

  it("versucht es nach einem Deadlock einmal neu", async () => {
    const fakeDb = createFakeDb({ requests: [confirmed], insertErrors: [deadlock()] });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await expect(createInvoice(input, fakeDb)).resolves.toMatchObject({ sequence: 1 });
  });

  it("gibt nach der zweiten Nummernkollision mit klarer Meldung auf", async () => {
    const fakeDb = createFakeDb({
      requests: [confirmed],
      insertErrors: [
        duplicateEntry("invoice.invoice_year_sequence"),
        duplicateEntry("invoice.invoice_year_sequence"),
      ],
    });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await expect(createInvoice(input, fakeDb)).rejects.toThrow(INVOICE_NUMBER_CONFLICT_ERROR);
    expect(fakeDb.invoices).toHaveLength(0);
  });

  it("reicht andere Datenbankfehler unverändert durch", async () => {
    const other = new Error("Verbindung verloren");
    const fakeDb = createFakeDb({ requests: [confirmed], insertErrors: [other] });

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await expect(createInvoice(input, fakeDb)).rejects.toBe(other);
  });

  it("ordnet eine Rechnung vom 31.12., 23:30 UTC (1.1., 0:30 Uhr in Deutschland) dem neuen Jahr zu", async () => {
    const fakeDb = createFakeDb({
      requests: [confirmed],
      invoices: [existingInvoice({ sequence: 12, number: "RE-2027-0012", bookingRequestId: 1 })],
    });

    const created = await createInvoice(
      { ...input, issuedAt: new Date("2027-12-31T23:30:00Z") },
      // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
      fakeDb,
    );

    expect(created).toMatchObject({ year: 2028, sequence: 1, number: "RE-2028-0001" });
    expect(created.snapshot.issuedAt).toBe("2028-01-01");
  });

  it("bleibt am 31.12., 23:59 Uhr deutscher Zeit im alten Jahr", async () => {
    const fakeDb = createFakeDb({ requests: [confirmed] });

    const created = await createInvoice(
      { ...input, issuedAt: new Date("2027-12-31T22:59:00Z") },
      // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
      fakeDb,
    );

    expect(created).toMatchObject({ year: 2027, number: "RE-2027-0001" });
    expect(created.snapshot.issuedAt).toBe("2027-12-31");
  });

  it.each(["", "   "])(
    "stellt ohne Steuernummer (INVOICE_TAX_NUMBER = %j) keine Rechnung aus",
    async (value) => {
      vi.stubEnv("INVOICE_TAX_NUMBER", value);
      const fakeDb = createFakeDb({ requests: [confirmed] });

      // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
      await expect(createInvoice(input, fakeDb)).rejects.toThrow(TAX_NUMBER_MISSING_ERROR);
      expect(fakeDb.invoices).toHaveLength(0);
    },
  );
});

describe("duplicateKeyName", () => {
  it("liest den Index mit und ohne Tabellenpräfix", () => {
    expect(duplicateKeyName(duplicateEntry("invoice.invoice_booking_request"))).toBe(
      "invoice_booking_request",
    );
    expect(duplicateKeyName(duplicateEntry("invoice_year_sequence"))).toBe("invoice_year_sequence");
  });

  it("liefert null für andere Fehler", () => {
    expect(duplicateKeyName(deadlock())).toBeNull();
    expect(duplicateKeyName(new Error("irgendwas"))).toBeNull();
    expect(duplicateKeyName(null)).toBeNull();
  });
});

describe("getInvoiceSummaries", () => {
  const stored = [
    existingInvoice({ id: 1, bookingRequestId: 1, number: "RE-2027-0001" }),
    existingInvoice({ id: 2, bookingRequestId: 2, sequence: 2, number: "RE-2027-0002" }),
    existingInvoice({ id: 3, bookingRequestId: 3, sequence: 3, number: "RE-2027-0003" }),
  ];

  /** Fake mit ausgewerteter Bedingung; merkt sich die abgefragten Felder. */
  function createSummaryDb() {
    const selected: Record<string, unknown>[] = [];
    return {
      selected,
      select: (fields: Record<string, unknown>) => {
        selected.push(fields);
        return {
          from: () => ({
            where: async (condition: SQL | undefined) => {
              const matches = compileCondition(invoice, condition);
              return stored
                .filter((row) => matches(row))
                .map((row) => ({
                  id: row.id,
                  number: row.number,
                  bookingRequestId: row.bookingRequestId,
                  issuedAt: "2027-09-06",
                }));
            },
          }),
        };
      },
    };
  }

  it("liefert nur die Rechnungen der angegebenen Buchungen", async () => {
    const fakeDb = createSummaryDb();

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    const summaries = await getInvoiceSummaries([1, 3], fakeDb);

    expect(summaries.map((entry) => entry.id)).toEqual([1, 3]);
  });

  it("lädt den Snapshot nicht, nur das Rechnungsdatum daraus", async () => {
    const fakeDb = createSummaryDb();

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await getInvoiceSummaries([1], fakeDb);

    const [fields] = fakeDb.selected;
    expect(Object.keys(fields)).toEqual(["id", "number", "bookingRequestId", "issuedAt"]);
    expect(is(fields.issuedAt, Column)).toBe(false);
    expect(dialect.sqlToQuery(fields.issuedAt as SQL).sql).toBe(
      "json_unquote(json_extract(`invoice`.`snapshot`, '$.issuedAt'))",
    );
  });

  it("fragt ohne Buchungen gar nicht erst ab", async () => {
    const fakeDb = createSummaryDb();

    // @ts-expect-error – Fake-DB erfüllt nur die genutzte Teilmenge der Drizzle-API
    await expect(getInvoiceSummaries([], fakeDb)).resolves.toEqual([]);
    expect(fakeDb.selected).toHaveLength(0);
  });
});
