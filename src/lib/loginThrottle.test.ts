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
  it("lässt ohne Fehlversuche sofort durch", async () => {
    const { throttle, wait } = setup();

    await expect(throttle.admit("1.1.1.1")).resolves.toBe(true);
    expect(wait).not.toHaveBeenCalled();
  });

  it("sperrt eine IP nach zu vielen Fehlversuchen hart", async () => {
    const { throttle } = setup();
    throttle.recordFailure("1.1.1.1");
    throttle.recordFailure("1.1.1.1");

    await expect(throttle.admit("1.1.1.1")).resolves.toBe(false);
  });

  it("lehnt über dem Gesamtlimit nicht ab, sondern verzögert jeden Versuch", async () => {
    const { throttle, wait } = setup();
    // Drei Fehlversuche von drei IPs: keine einzelne IP ist gesperrt, das
    // Gesamtlimit aber erreicht.
    throttle.recordFailure("1.1.1.1");
    throttle.recordFailure("2.2.2.2");
    throttle.recordFailure("3.3.3.3");

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
      throttle.recordFailure("1.1.1.1");

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

  it("zählt Fehlversuche über dem Gesamtlimit weiter je IP", async () => {
    const { throttle } = setup();
    throttle.recordFailure("1.1.1.1");
    throttle.recordFailure("2.2.2.2");
    throttle.recordFailure("3.3.3.3");
    throttle.recordFailure("3.3.3.3");

    await expect(throttle.admit("3.3.3.3")).resolves.toBe(false);
  });

  it("setzt die Sperre einer IP nach erfolgreicher Anmeldung zurück", async () => {
    const { throttle } = setup();
    throttle.recordFailure("1.1.1.1");
    throttle.recordSuccess("1.1.1.1");
    throttle.recordFailure("1.1.1.1");

    await expect(throttle.admit("1.1.1.1")).resolves.toBe(true);
  });
});
