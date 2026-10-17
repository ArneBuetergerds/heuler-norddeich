import { describe, it, expect, vi, afterEach } from "vitest";
import type { BookingRequest } from "../db/schema";
import {
  OPERATOR_DIGEST_INTERVAL_MS,
  createOperatorDigest,
  notifyAboutBookingRequest,
} from "./bookingNotifications";

const request: BookingRequest = {
  id: 1,
  name: "Erika Musterfrau",
  email: "erika@example.invalid",
  phone: null,
  street: null,
  postalCode: null,
  city: null,
  country: null,
  startDate: new Date("2027-05-01"),
  endDate: new Date("2027-05-08"),
  message: null,
  guests: 2,
  linens: 0,
  towels: 0,
  status: "pending",
  source: "online",
  reasonNote: null,
  createdAt: new Date("2027-01-01"),
  decidedAt: null,
  anonymizedAt: null,
};

function digest() {
  return { record: vi.fn() };
}

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

    const d = digest();

    await notifyAboutBookingRequest(request, { withinGlobalLimit: true }, n, d);

    expect(n.pushAdmins).toHaveBeenCalledWith(request);
    expect(n.notifyOperator).toHaveBeenCalledWith(request);
    expect(n.confirmToGuest).toHaveBeenCalledWith(request);
    expect(d.record).not.toHaveBeenCalled();
  });

  it("schickt über dem Gesamtlimit keine Einzelmeldungen, sondern merkt die Anfrage für die Sammelmeldung vor", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const n = notifiers();
    const d = digest();

    await notifyAboutBookingRequest(request, { withinGlobalLimit: false }, n, d);

    expect(n.pushAdmins).not.toHaveBeenCalled();
    expect(n.notifyOperator).not.toHaveBeenCalled();
    expect(n.confirmToGuest).not.toHaveBeenCalled();
    expect(d.record).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("schreibt keine personenbezogenen Daten ins Log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await notifyAboutBookingRequest(request, { withinGlobalLimit: false }, notifiers(), digest());

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(request.name);
    expect(logged).not.toContain(request.email);
  });

  it("verschickt die übrigen Benachrichtigungen, wenn eine fehlschlägt, und wirft nicht", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const n = notifiers();
    n.notifyOperator.mockRejectedValue(new Error("SMTP down"));

    await expect(
      notifyAboutBookingRequest(request, { withinGlobalLimit: true }, n, digest()),
    ).resolves.toBeUndefined();

    expect(n.pushAdmins).toHaveBeenCalled();
    expect(n.confirmToGuest).toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      "Benachrichtigung des Betreibers fehlgeschlagen",
      "Error: SMTP down",
    );
  });
});

describe("createOperatorDigest", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function setup() {
    vi.useFakeTimers();
    const notifiers = {
      mail: vi.fn().mockResolvedValue(undefined),
      push: vi.fn().mockResolvedValue(undefined),
    };
    return { notifiers, digest: createOperatorDigest({ notifiers }) };
  }

  it("meldet erst nach Ablauf der Stunde, dann einmal mit der Gesamtzahl", async () => {
    const { notifiers, digest } = setup();

    digest.record();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    digest.record();
    digest.record();

    await vi.advanceTimersByTimeAsync(OPERATOR_DIGEST_INTERVAL_MS - 10 * 60 * 1000 - 1);
    expect(notifiers.mail).not.toHaveBeenCalled();
    expect(notifiers.push).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(notifiers.mail).toHaveBeenCalledExactlyOnceWith(3);
    expect(notifiers.push).toHaveBeenCalledExactlyOnceWith(3);
  });

  it("schickt höchstens eine Sammelmeldung je Stunde, auch bei anhaltendem Ansturm", async () => {
    const { notifiers, digest } = setup();

    // Drei Stunden lang jede Minute eine Anfrage.
    for (let minute = 0; minute < 180; minute++) {
      digest.record();
      await vi.advanceTimersByTimeAsync(60 * 1000);
    }
    await vi.advanceTimersByTimeAsync(OPERATOR_DIGEST_INTERVAL_MS);

    expect(notifiers.mail).toHaveBeenCalledTimes(3);
    const gemeldet = notifiers.mail.mock.calls.reduce((summe, [count]) => summe + count, 0);
    expect(gemeldet).toBe(180);
  });

  it("schickt nichts, solange nichts vorgemerkt ist", async () => {
    const { notifiers } = setup();

    await vi.advanceTimersByTimeAsync(3 * OPERATOR_DIGEST_INTERVAL_MS);

    expect(notifiers.mail).not.toHaveBeenCalled();
    expect(notifiers.push).not.toHaveBeenCalled();
  });

  it("startet nach einer Meldung erst mit der nächsten Anfrage ein neues Intervall", async () => {
    const { notifiers, digest } = setup();

    digest.record();
    await vi.advanceTimersByTimeAsync(OPERATOR_DIGEST_INTERVAL_MS);
    expect(notifiers.mail).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5 * 60 * 60 * 1000);
    digest.record();
    await vi.advanceTimersByTimeAsync(OPERATOR_DIGEST_INTERVAL_MS - 1);
    expect(notifiers.mail).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(notifiers.mail).toHaveBeenLastCalledWith(1);
  });

  it("verschickt den Push auch, wenn die Mail fehlschlägt, und loggt den Fehler", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { notifiers, digest } = setup();
    notifiers.mail.mockRejectedValue(new Error("SMTP down"));

    digest.record();
    await vi.advanceTimersByTimeAsync(OPERATOR_DIGEST_INTERVAL_MS);

    expect(notifiers.push).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith(
      "Sammelmeldung per Mail an die Betreiberin fehlgeschlagen",
      "Error: SMTP down",
    );
  });
});
