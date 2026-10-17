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

const { buildBookingRequestPush, sendPushToAdmins, testPushResponse, TEST_PUSH } = await import(
  "./push"
);
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

  it("meldet ohne VAPID-Schlüssel 'nicht eingerichtet', versendet nichts und wirft nicht", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    await expect(sendPushToAdmins(TEST_PUSH)).resolves.toEqual({ configured: false });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("beliefert jedes angemeldete Gerät und meldet die Zustellungen", async () => {
    const result = await sendPushToAdmins(TEST_PUSH);

    expect(result).toEqual({
      configured: true,
      devices: 2,
      sent: 2,
      failed: 0,
      removedEndpoints: [],
    });

    expect(sendNotification).toHaveBeenCalledTimes(2);
    const [target, body] = sendNotification.mock.calls[0];
    expect(target).toEqual({
      endpoint: "https://fcm.googleapis.com/fcm/send/1",
      keys: { p256dh: "k1", auth: "a1" },
    });
    expect(JSON.parse(body)).toEqual(TEST_PUSH);
  });

  it("räumt abgelaufene Abos auf, beliefert die übrigen trotzdem und meldet das gelöschte", async () => {
    sendNotification.mockRejectedValueOnce(goneError(410));

    const result = await sendPushToAdmins(TEST_PUSH);

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(deletedWhere).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      configured: true,
      devices: 2,
      sent: 1,
      failed: 0,
      removedEndpoints: ["https://fcm.googleapis.com/fcm/send/1"],
    });
  });

  it("behält Abos bei vorübergehenden Fehlern und meldet sie als fehlgeschlagen", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    sendNotification.mockRejectedValue(goneError(500));

    await expect(sendPushToAdmins(TEST_PUSH)).resolves.toEqual({
      configured: true,
      devices: 2,
      sent: 0,
      failed: 2,
      removedEndpoints: [],
    });

    expect(deletedWhere).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("zählt ein Abo mit fremdem Host als fehlgeschlagen, ohne zu senden", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    subscriptions.length = 0;
    subscriptions.push({ id: 3, endpoint: "https://10.0.0.5/x", p256dh: "k", auth: "a" });

    await expect(sendPushToAdmins(TEST_PUSH)).resolves.toMatchObject({ sent: 0, failed: 1 });
    expect(sendNotification).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("meldet ohne eingetragene Geräte null Geräte", async () => {
    subscriptions.length = 0;

    await expect(sendPushToAdmins(TEST_PUSH)).resolves.toEqual({
      configured: true,
      devices: 0,
      sent: 0,
      failed: 0,
      removedEndpoints: [],
    });
  });
});

describe("testPushResponse", () => {
  const ENDPOINT = "https://fcm.googleapis.com/fcm/send/1";
  const current = { endpoint: ENDPOINT, registered: true };

  it("meldet Erfolg, wenn mindestens ein Gerät beliefert wurde", () => {
    const response = testPushResponse(
      { configured: true, devices: 2, sent: 1, failed: 1, removedEndpoints: [] },
      current,
    );
    expect(response).toEqual({ status: 200, body: { ok: true, currentDeviceActive: true } });
  });

  it("meldet ohne VAPID-Schlüssel einen Fehler", () => {
    const response = testPushResponse({ configured: false }, current);
    expect(response.status).toBe(503);
    expect(response.body.ok).toBe(false);
  });

  it("unterscheidet 'kein Gerät eingetragen'", () => {
    const response = testPushResponse(
      { configured: true, devices: 0, sent: 0, failed: 0, removedEndpoints: [] },
      { endpoint: ENDPOINT, registered: false },
    );
    expect(response.status).toBe(409);
    expect(response.body.error).toContain("kein Gerät für Push eingetragen");
    expect(response.body.currentDeviceActive).toBe(false);
  });

  it("meldet 'Versand fehlgeschlagen', wenn kein Gerät erreicht wurde", () => {
    const response = testPushResponse(
      { configured: true, devices: 2, sent: 0, failed: 2, removedEndpoints: [] },
      current,
    );
    expect(response.status).toBe(502);
    expect(response.body.error).toContain("Versand ist fehlgeschlagen");
    expect(response.body.currentDeviceActive).toBe(true);
  });

  it("meldet abgelaufene Abos und dass das aktuelle Gerät nicht mehr angemeldet ist", () => {
    const response = testPushResponse(
      { configured: true, devices: 1, sent: 0, failed: 0, removedEndpoints: [ENDPOINT] },
      current,
    );
    expect(response.status).toBe(502);
    expect(response.body.error).toContain("abgelaufen");
    expect(response.body.currentDeviceActive).toBe(false);
  });

  it("meldet das aktuelle Gerät als abgemeldet, auch wenn andere beliefert wurden", () => {
    const response = testPushResponse(
      { configured: true, devices: 2, sent: 1, failed: 0, removedEndpoints: [ENDPOINT] },
      current,
    );
    expect(response).toEqual({ status: 200, body: { ok: true, currentDeviceActive: false } });
  });

  it("lässt den Gerätestatus offen, wenn das Gerät sich nicht zu erkennen gibt", () => {
    const response = testPushResponse(
      { configured: true, devices: 1, sent: 1, failed: 0, removedEndpoints: [] },
      null,
    );
    expect(response.body.currentDeviceActive).toBeNull();
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
