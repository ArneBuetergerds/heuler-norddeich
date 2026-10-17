import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BookingRequest } from "../db/schema";

// push.ts importiert den echten DB-Client, der ohne DATABASE_URL beim Import
// wirft. Gebraucht wird nur select().from() und delete().where().
const { subscriptions, deletedWhere, sendNotification } = vi.hoisted(() => ({
  subscriptions: [] as { id: number; endpoint: string; p256dh: string; auth: string }[],
  deletedWhere: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("../db/client", () => ({
  db: {
    select: () => ({ from: async () => subscriptions }),
    delete: () => ({ where: async (condition: unknown) => deletedWhere(condition) }),
  },
}));

vi.mock("web-push", async (importOriginal) => {
  const actual = await importOriginal<typeof import("web-push")>();
  // push.ts nutzt nur sendNotification (über den Default-Export) und die
  // echte Fehlerklasse.
  return {
    default: { sendNotification },
    WebPushError: actual.WebPushError,
  };
});

const { buildBookingRequestPush, sendPushToAdmins, TEST_PUSH } = await import("./push");
const { WebPushError } = await import("web-push");

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

function goneError(statusCode: number) {
  return new WebPushError("gone", statusCode, {}, "", "https://push.example.invalid/1");
}

describe("buildBookingRequestPush", () => {
  it("nennt Gast, Zeitraum und Personenzahl und führt in den Admin", () => {
    expect(buildBookingRequestPush(request)).toEqual({
      title: "Neue Buchungsanfrage",
      body: "Erika Musterfrau · 01.05.2027 bis 08.05.2027 · 2 Personen",
      url: "/admin",
    });
  });

  it("schreibt eine einzelne Person im Singular", () => {
    expect(buildBookingRequestPush({ ...request, guests: 1 }).body).toContain("1 Person");
  });
});

describe("sendPushToAdmins", () => {
  beforeEach(() => {
    subscriptions.length = 0;
    subscriptions.push(
      { id: 1, endpoint: "https://fcm.googleapis.com/fcm/send/1", p256dh: "k1", auth: "a1" },
      { id: 2, endpoint: "https://fcm.googleapis.com/fcm/send/2", p256dh: "k2", auth: "a2" },
    );
    deletedWhere.mockReset();
    sendNotification.mockReset();
    vi.stubEnv("VAPID_PUBLIC_KEY", "public");
    vi.stubEnv("VAPID_PRIVATE_KEY", "private");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("tut ohne VAPID-Schlüssel nichts und wirft nicht", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    await sendPushToAdmins(TEST_PUSH);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("beliefert jedes angemeldete Gerät", async () => {
    await sendPushToAdmins(TEST_PUSH);

    expect(sendNotification).toHaveBeenCalledTimes(2);
    const [target, body] = sendNotification.mock.calls[0];
    expect(target).toEqual({
      endpoint: "https://fcm.googleapis.com/fcm/send/1",
      keys: { p256dh: "k1", auth: "a1" },
    });
    expect(JSON.parse(body)).toEqual(TEST_PUSH);
  });

  it("räumt abgelaufene Abos auf und beliefert die übrigen trotzdem", async () => {
    sendNotification.mockRejectedValueOnce(goneError(410));

    await sendPushToAdmins(TEST_PUSH);

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(deletedWhere).toHaveBeenCalledTimes(1);
  });

  it("behält Abos bei vorübergehenden Fehlern", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    sendNotification.mockRejectedValue(goneError(500));

    await expect(sendPushToAdmins(TEST_PUSH)).resolves.toBeUndefined();

    expect(deletedWhere).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("isAllowedPushEndpoint", () => {
  it("erlaubt die Push-Dienste der Browserhersteller", async () => {
    const { isAllowedPushEndpoint } = await import("./push");
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/QG9")).toBe(true);
    expect(isAllowedPushEndpoint("https://wns2-db5p.notify.windows.com/w/?token=x")).toBe(true);
  });

  it("lehnt interne und fremde Adressen ab (SSRF)", async () => {
    const { isAllowedPushEndpoint } = await import("./push");
    expect(isAllowedPushEndpoint("https://10.0.0.5:8443/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://localhost/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com.evil.example/x")).toBe(false);
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("kein-url")).toBe(false);
  });
});
