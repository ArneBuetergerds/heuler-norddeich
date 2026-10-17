import { describe, it, expect, vi } from "vitest";
import { createRateLimiter } from "./rateLimit";
import { createLoginThrottle, GLOBAL_LIMIT_DELAY_MS } from "./loginThrottle";

/** Kleine Limits, damit die Tests die Schwellen mit wenigen Versuchen erreichen. */
function setup() {
  const wait = vi.fn(async () => {});
  const throttle = createLoginThrottle({
    perIp: createRateLimiter({ limit: 2, windowMs: 60_000 }),
    total: createRateLimiter({ limit: 3, windowMs: 60_000 }),
    wait,
  });
  return { throttle, wait };
}

describe("createLoginThrottle", () => {
  it("lässt ohne vorherige Versuche sofort durch", async () => {
    const { throttle, wait } = setup();

    await expect(throttle.admit("1.1.1.1")).resolves.toBe(true);
    expect(wait).not.toHaveBeenCalled();
  });

  it("sperrt eine IP nach zu vielen Versuchen hart", async () => {
    const { throttle } = setup();
    await throttle.admit("1.1.1.1");
    await throttle.admit("1.1.1.1");

    await expect(throttle.admit("1.1.1.1")).resolves.toBe(false);
  });

  it("lässt von parallelen Versuchen derselben IP höchstens das Limit durch", async () => {
    // Echte Standardwerte (5 je IP), Wartefunktion ohne Verzögerung. Alle
    // Aufrufe starten, bevor einer fertig ist – wie gleichzeitig abgeschickte
    // Login-Requests.
    const throttle = createLoginThrottle({ wait: async () => {} });

    const results = await Promise.all(
      Array.from({ length: 20 }, () => throttle.admit("6.6.6.6")),
    );

    expect(results.filter(Boolean)).toHaveLength(5);
  });

  it("zählt parallele Versuche auch dann sofort, wenn über dem Gesamtlimit gewartet wird", async () => {
    // Die Wartefunktion hält jeden Versuch an, bis der Test ihn freigibt –
    // so liegt die Prüfung der übrigen Versuche sicher in der Wartezeit.
    const pending: Array<() => void> = [];
    const throttle = createLoginThrottle({
      perIp: createRateLimiter({ limit: 3, windowMs: 60_000 }),
      total: createRateLimiter({ limit: 1, windowMs: 60_000 }),
      wait: () => new Promise<void>((resolve) => pending.push(resolve)),
    });

    const all = Promise.all(Array.from({ length: 6 }, () => throttle.admit("6.6.6.6")));
    await Promise.resolve();
    pending.forEach((resolve) => resolve());
    const results = await all;

    expect(results.filter(Boolean)).toHaveLength(3);
  });

  it("lehnt über dem Gesamtlimit nicht ab, sondern verzögert jeden Versuch", async () => {
    const { throttle, wait } = setup();
    // Drei Versuche von drei IPs: keine einzelne IP ist gesperrt, das
    // Gesamtlimit aber erreicht.
    await throttle.admit("1.1.1.1");
    await throttle.admit("2.2.2.2");
    await throttle.admit("3.3.3.3");
    expect(wait).not.toHaveBeenCalled();

    // Auch eine bisher unauffällige IP (die Betreiberin) kommt durch.
    await expect(throttle.admit("9.9.9.9")).resolves.toBe(true);
    expect(wait).toHaveBeenCalledWith(GLOBAL_LIMIT_DELAY_MS);
  });

  it("verzögert mit echter Wartezeit, wenn keine Wartefunktion übergeben ist", async () => {
    vi.useFakeTimers();
    try {
      const throttle = createLoginThrottle({
        perIp: createRateLimiter({ limit: 5, windowMs: 60_000 }),
        total: createRateLimiter({ limit: 1, windowMs: 60_000 }),
      });
      await throttle.admit("1.1.1.1");

      let admitted: boolean | undefined;
      void throttle.admit("9.9.9.9").then((result) => {
        admitted = result;
      });

      await vi.advanceTimersByTimeAsync(GLOBAL_LIMIT_DELAY_MS - 1);
      expect(admitted).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(admitted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("zählt Versuche über dem Gesamtlimit weiter je IP", async () => {
    const { throttle } = setup();
    await throttle.admit("1.1.1.1");
    await throttle.admit("2.2.2.2");
    await throttle.admit("3.3.3.3");
    await throttle.admit("3.3.3.3");

    await expect(throttle.admit("3.3.3.3")).resolves.toBe(false);
  });

  it("setzt die Sperre einer IP nach erfolgreicher Anmeldung zurück", async () => {
    const { throttle } = setup();
    await throttle.admit("1.1.1.1");
    throttle.recordSuccess("1.1.1.1");
    await throttle.admit("1.1.1.1");

    await expect(throttle.admit("1.1.1.1")).resolves.toBe(true);
  });
});
