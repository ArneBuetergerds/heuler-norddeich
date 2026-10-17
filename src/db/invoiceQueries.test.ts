import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { BookingRequest, Invoice } from "./schema";

// invoiceQueries.ts importiert den echten DB-Client als Vorgabe, der ohne
// DATABASE_URL beim Import wirft. Die Tests übergeben ihre eigene Fake-DB.
vi.mock("./client", () => ({ db: {} }));

const { createInvoice, INVOICE_EXISTS_ERROR, NOT_CONFIRMED_ERROR, TAX_NUMBER_MISSING_ERROR } =
  await import("./invoiceQueries");

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
  select: (fields?: Record<string, unknown>) => {
    from: (table: Parameters<typeof getTableName>[0]) => {
      where: (condition: SQL | undefined) => Promise<unknown[]> & { for: () => Promise<unknown[]> };
    };
  };
  insert: () => { values: (values: Omit<Invoice, "id" | "createdAt">) => Promise<void> };
  transaction: <T>(callback: (tx: FakeDb) => Promise<T>) => Promise<T>;
};

function createFakeDb({
  requests = [],
  invoices = [],
}: {
  requests?: BookingRequest[];
  invoices?: Invoice[];
}): FakeDb {
  const stored = [...invoices];

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
    select: (fields) => ({
      from: (table) => ({
        where: (condition) => {
          const rows = rowsFor(fields, getTableName(table), params(condition));
          return Object.assign(Promise.resolve(rows), { for: async () => rows });
        },
      }),
    }),
    insert: () => ({
      values: async (values) => {
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
  reasonNote: null,
  createdAt: new Date("2027-02-03"),
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

const input = {
  bookingRequestId: confirmed.id,
  recipientName: "Erika Musterfrau",
  recipientAddress: ["Musterweg 1", "12345 Musterstadt"],
  issuedAt: new Date("2027-09-06T10:00:00Z"),
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
