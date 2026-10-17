import { afterEach, describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm";

// vi.mock wird nach oben gezogen; die Attrappe muss es mit ihm.
const insert = vi.hoisted(() => vi.fn());

// Vitest kennt den Pfad-Alias `@/` nicht (keine vitest-Konfiguration). Die
// echten Module werden deshalb über relative Pfade eingehängt; nur Datenbank,
// Mail und Push sind Attrappen.
vi.mock("@/db/schema", () => import("../../../db/schema"));
vi.mock("@/lib/validation", () => import("../../../lib/validation"));
vi.mock("@/lib/rateLimit", () => import("../../../lib/rateLimit"));
vi.mock("@/lib/safeError", () => import("../../../lib/safeError"));
vi.mock("@/lib/bookingNotifications", () => import("../../../lib/bookingNotifications"));
vi.mock("@/lib/routeErrors", () => import("../../../lib/routeErrors"));
vi.mock("@/db/client", () => ({ db: { insert } }));
// `after()` braucht den Request-Kontext von Next.js; Benachrichtigungen sind
// hier nicht Gegenstand.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/db/queries", () => ({ isRangeFree: vi.fn(async () => true) }));
vi.mock("@/lib/email", () => ({
  sendBookingRequestNotification: vi.fn(),
  sendGuestRequestReceived: vi.fn(),
  sendOperatorDigest: vi.fn(),
}));
vi.mock("@/lib/push", () => ({
  buildBookingRequestPush: vi.fn(),
  buildOperatorDigestPush: vi.fn(),
  sendPushToAdmins: vi.fn(),
}));

import { POST } from "./route";

const GUEST = {
  name: "Erika Mustermann",
  email: "gast@example.org",
  phone: "0151 2345678",
  message: "Wir kommen mit Hund",
  street: "Musterweg 1",
  postalCode: "12345",
  city: "Musterstadt",
};

function isoDay(daysFromToday: number): string {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + daysFromToday);
  return day.toISOString().slice(0, 10);
}

function bookingRequest(overrides: Record<string, unknown> = {}): Request {
  return new Request("http://localhost/api/booking-request", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
    body: JSON.stringify({
      ...GUEST,
      startDate: isoDay(30),
      endDate: isoDay(44),
      guests: 2,
      formMs: 10_000,
      ...overrides,
    }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  insert.mockReset();
});

describe("POST /api/booking-request", () => {
  it("fehlschlagender Insert: 500 mit Hinweis für den Gast, Log ohne Gastdaten", async () => {
    // Wie Drizzle den Fehler eines Inserts meldet: alle Werte in `params`.
    insert.mockReturnValue({
      values: (values: Record<string, unknown>) => ({
        $returningId: async () => {
          throw new DrizzleQueryError(
            "insert into `booking_request` (`name`, `email`, `phone`, `message`) values (?, ?, ?, ?)",
            [values.name, values.email, values.phone, values.message],
            Object.assign(new Error("Connection lost: The server closed the connection."), {
              code: "PROTOCOL_CONNECTION_LOST",
            }),
          );
        },
      }),
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(bookingRequest());

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(Object.keys(body)).toEqual(["error"]);
    expect(body.error).toContain("kontakt@norddeich-heuler.de");
    expect(body.error).not.toContain("insert");

    expect(insert).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    const logged = error.mock.calls[0].map(String).join(" ");
    expect(logged).toContain("POST /api/booking-request");
    expect(logged).toContain("PROTOCOL_CONNECTION_LOST");
    for (const value of Object.values(GUEST)) {
      expect(logged).not.toContain(value);
    }
    expect(logged).not.toContain("params");
  });

  it("speichert die Rechnungsanschrift mit der Anfrage, ein leeres Land als null", async () => {
    const values = vi.fn();
    insert.mockReturnValue({
      values: (v: Record<string, unknown>) => {
        values(v);
        return { $returningId: async () => [{ id: 42 }] };
      },
    });

    const response = await POST(bookingRequest({ country: "" }));

    expect(response.status).toBe(201);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        street: "Musterweg 1",
        postalCode: "12345",
        city: "Musterstadt",
        country: null,
      }),
    );
  });

  it("lehnt eine Anfrage ohne Anschrift mit Meldung am Feld ab und speichert nichts", async () => {
    const response = await POST(bookingRequest({ street: "" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Bitte Straße und Hausnummer angeben",
      field: "street",
    });
    expect(insert).not.toHaveBeenCalled();
  });
});
