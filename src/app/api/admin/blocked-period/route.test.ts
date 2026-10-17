import { afterEach, describe, expect, it, vi } from "vitest";

// vi.mock wird nach oben gezogen; die Attrappen müssen es mit ihm.
const db = vi.hoisted(() => ({
  query: {
    blockedPeriod: { findFirst: vi.fn() },
    bookingRequest: { findFirst: vi.fn() },
  },
}));
const sendGuestDecline = vi.hoisted(() => vi.fn());
const cancelStay = vi.hoisted(() => vi.fn());

// Vitest kennt den Pfad-Alias `@/` nicht (keine vitest-Konfiguration).
vi.mock("@/db/schema", () => import("../../../../db/schema"));
vi.mock("@/lib/validation", () => import("../../../../lib/validation"));
vi.mock("@/lib/routeErrors", () => import("../../../../lib/routeErrors"));
vi.mock("@/lib/safeError", () => import("../../../../lib/safeError"));
vi.mock("@/lib/adminAuth", () => ({
  authorizeAdmin: vi.fn(async () => ({ actor: "admin@example.invalid" })),
}));
vi.mock("@/db/client", () => ({ db }));
vi.mock("@/db/adminQueries", () => ({
  cancelStay,
  createInternalStay: vi.fn(),
  createMaintenanceBlock: vi.fn(),
  RANGE_TAKEN_ERROR: "Zeitraum ist inzwischen belegt",
}));
vi.mock("@/lib/email", () => ({ sendGuestDecline }));

import { DELETE } from "./route";

function remove(id: number): Request {
  return new Request(`http://localhost/api/admin/blocked-period?id=${id}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "Wasserschaden" }),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/admin/blocked-period", () => {
  it("storniert eine manuelle Buchung ohne Mail an den Gast", async () => {
    db.query.blockedPeriod.findFirst.mockResolvedValue({ id: 7, bookingRequestId: 3 });
    db.query.bookingRequest.findFirst.mockResolvedValue({ id: 3, source: "manual" });

    const response = await DELETE(remove(7));

    expect(response.status).toBe(200);
    expect(cancelStay).toHaveBeenCalledTimes(1);
    expect(sendGuestDecline).not.toHaveBeenCalled();
  });

  it("schickt bei einer Online-Buchung weiterhin die Storno-Mail", async () => {
    db.query.blockedPeriod.findFirst.mockResolvedValue({ id: 8, bookingRequestId: 4 });
    db.query.bookingRequest.findFirst.mockResolvedValue({ id: 4, source: "online" });

    const response = await DELETE(remove(8));

    expect(response.status).toBe(200);
    expect(sendGuestDecline).toHaveBeenCalledWith({ id: 4, source: "online" }, "Wasserschaden");
  });
});
