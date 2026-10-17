import { afterEach, describe, expect, it, vi } from "vitest";
import type { Table } from "drizzle-orm";

// vi.mock wird nach oben gezogen; die Attrappen müssen es mit ihm.
const state = vi.hoisted(() => ({
  inserts: [] as { table: unknown; values: Record<string, unknown> }[],
  overlapping: [] as { id: number }[],
}));
const mails = vi.hoisted(() => ({
  sendBookingRequestNotification: vi.fn(),
  sendGuestRequestReceived: vi.fn(),
  sendGuestConfirmation: vi.fn(),
  sendGuestDecline: vi.fn(),
  sendOperatorDigest: vi.fn(),
}));
const push = vi.hoisted(() => ({
  buildBookingRequestPush: vi.fn(),
  buildOperatorDigestPush: vi.fn(),
  sendPushToAdmins: vi.fn(),
}));

// Vitest kennt den Pfad-Alias `@/` nicht (keine vitest-Konfiguration). Die
// echten Module über relative Pfade; Datenbank, Anmeldung, Mail und Push
// sind Attrappen.
vi.mock("@/db/adminQueries", () => import("../../../../db/adminQueries"));
vi.mock("@/lib/validation", () => import("../../../../lib/validation"));
vi.mock("@/lib/routeErrors", () => import("../../../../lib/routeErrors"));
vi.mock("@/lib/adminAuth", () => ({
  authorizeAdmin: vi.fn(async () => ({ actor: "admin@example.invalid" })),
}));
vi.mock("@/lib/email", () => mails);
vi.mock("@/lib/push", () => push);
vi.mock("@/db/client", () => {
  const tx = {
    select: () => ({
      from: () => ({ where: () => ({ for: async () => state.overlapping }) }),
    }),
    insert: (table: Table) => ({
      values: (values: Record<string, unknown>) => {
        state.inserts.push({ table, values });
        const id = state.inserts.length;
        return { $returningId: async () => [{ id }] };
      },
    }),
  };
  return { db: { transaction: async <T,>(callback: (t: typeof tx) => Promise<T>) => callback(tx) } };
});

import { POST } from "./route";
import { adminActionLog, blockedPeriod, bookingRequest } from "../../../../db/schema";

function post(body: unknown): Request {
  return new Request("http://localhost/api/admin/manual-booking", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const BOOKING = {
  name: "Hanna Telefon",
  email: "hanna@example.invalid",
  phone: "0176 7654321",
  // Nachträglich und kürzer als der Mindestaufenthalt: für die Betreiberin erlaubt.
  startDate: "2026-07-10",
  endDate: "2026-07-12",
  guests: 2,
  linens: 1,
  towels: 0,
};

afterEach(() => {
  state.inserts.length = 0;
  state.overlapping = [];
  vi.clearAllMocks();
});

describe("POST /api/admin/manual-booking", () => {
  it("legt bestätigte Anfrage, Belegung und Protokoll an und verschickt nichts", async () => {
    const response = await POST(post(BOOKING));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 1 });
    expect(state.inserts.map((entry) => entry.table)).toEqual([
      bookingRequest,
      blockedPeriod,
      adminActionLog,
    ]);
    expect(state.inserts[0].values).toMatchObject({ status: "confirmed", source: "manual" });
    expect(state.inserts[1].values).toMatchObject({ kind: "booking", bookingRequestId: 1 });

    for (const mock of [...Object.values(mails), ...Object.values(push)]) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  it("speichert eine freiwillige Anschrift, ohne sie leer als null", async () => {
    await POST(
      post({ ...BOOKING, street: "Musterweg 1", postalCode: "12345", city: "Musterstadt", country: "" }),
    );
    expect(state.inserts[0].values).toMatchObject({
      street: "Musterweg 1",
      postalCode: "12345",
      city: "Musterstadt",
      country: null,
    });

    state.inserts.length = 0;
    const response = await POST(post(BOOKING));
    expect(response.status).toBe(201);
    expect(state.inserts[0].values).toMatchObject({
      street: null,
      postalCode: null,
      city: null,
      country: null,
    });
  });

  it("verlangt eine angefangene Anschrift vollständig", async () => {
    const response = await POST(post({ ...BOOKING, city: "Musterstadt" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ field: "street" });
    expect(state.inserts).toHaveLength(0);
  });

  it("antwortet 400 mit lesbarer Meldung und Feld", async () => {
    const response = await POST(post({ ...BOOKING, towels: 3 }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Nicht mehr Sätze als Personen",
      field: "towels",
    });
    expect(state.inserts).toHaveLength(0);
  });

  it("antwortet 409, wenn der Zeitraum belegt ist", async () => {
    state.overlapping = [{ id: 7 }];

    const response = await POST(post(BOOKING));

    expect(response.status).toBe(409);
    expect(state.inserts).toHaveLength(0);
  });
});
