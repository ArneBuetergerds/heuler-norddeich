import { describe, it, expect, vi, afterEach } from "vitest";
import type { BookingRequest } from "../db/schema";
import { notifyAboutBookingRequest } from "./bookingNotifications";

const request: BookingRequest = {
  id: 1,
  name: "Erika Musterfrau",
  email: "erika@example.invalid",
  phone: null,
  startDate: new Date("2027-05-01"),
  endDate: new Date("2027-05-08"),
  message: null,
  guests: 2,
  linens: 0,
  towels: 0,
  status: "pending",
  reasonNote: null,
  createdAt: new Date("2027-01-01"),
};

function notifiers() {
  return {
    pushAdmins: vi.fn().mockResolvedValue(undefined),
    notifyOperator: vi.fn().mockResolvedValue(undefined),
    confirmToGuest: vi.fn().mockResolvedValue(undefined),
  };
}

describe("notifyAboutBookingRequest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("benachrichtigt Betreiberin und Gast, solange das Gesamtlimit nicht überschritten ist", async () => {
    const n = notifiers();

    await notifyAboutBookingRequest(request, { withinGlobalLimit: true }, n);

    expect(n.pushAdmins).toHaveBeenCalledWith(request);
    expect(n.notifyOperator).toHaveBeenCalledWith(request);
    expect(n.confirmToGuest).toHaveBeenCalledWith(request);
  });

  it("schickt über dem Gesamtlimit keine Mail an den Gast, benachrichtigt die Betreiberin aber weiter", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const n = notifiers();

    await notifyAboutBookingRequest(request, { withinGlobalLimit: false }, n);

    expect(n.pushAdmins).toHaveBeenCalledWith(request);
    expect(n.notifyOperator).toHaveBeenCalledWith(request);
    expect(n.confirmToGuest).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("schreibt keine personenbezogenen Daten ins Log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await notifyAboutBookingRequest(request, { withinGlobalLimit: false }, notifiers());

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(request.name);
    expect(logged).not.toContain(request.email);
  });

  it("verschickt die übrigen Benachrichtigungen, wenn eine fehlschlägt, und wirft nicht", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const n = notifiers();
    n.notifyOperator.mockRejectedValue(new Error("SMTP down"));

    await expect(
      notifyAboutBookingRequest(request, { withinGlobalLimit: true }, n),
    ).resolves.toBeUndefined();

    expect(n.pushAdmins).toHaveBeenCalled();
    expect(n.confirmToGuest).toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      "Benachrichtigung des Betreibers fehlgeschlagen",
      expect.any(Error),
    );
  });
});
