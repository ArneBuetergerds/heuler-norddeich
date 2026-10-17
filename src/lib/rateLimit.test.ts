import { describe, it, expect } from "vitest";
import { clientIp, createRateLimiter } from "./rateLimit";

describe("createRateLimiter", () => {
  it("lässt bis zum Limit durch und sperrt danach", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(limiter.hit("a", 0)).toBe(true);
    expect(limiter.hit("a", 10)).toBe(true);
    expect(limiter.hit("a", 20)).toBe(false);
    expect(limiter.isLimited("a", 20)).toBe(true);
  });

  it("zählt Schlüssel unabhängig voneinander", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.hit("a", 0)).toBe(true);
    expect(limiter.hit("b", 0)).toBe(true);
  });

  it("gibt nach Ablauf des Fensters wieder frei", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.hit("a", 0)).toBe(true);
    expect(limiter.hit("a", 999)).toBe(false);
    expect(limiter.hit("a", 1000)).toBe(true);
  });

  it("setzt einen Schlüssel auf Wunsch zurück", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    limiter.hit("a", 0);
    limiter.reset("a");
    expect(limiter.hit("a", 1)).toBe(true);
  });
});

describe("clientIp", () => {
  it("bevorzugt X-Real-Ip", () => {
    const headers = new Headers({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" });
    expect(clientIp(headers)).toBe("1.2.3.4");
  });

  it("nimmt den letzten, vom Proxy angehängten X-Forwarded-For-Eintrag", () => {
    const headers = new Headers({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" });
    expect(clientIp(headers)).toBe("1.2.3.4");
  });

  it("fällt ohne Header auf einen festen Schlüssel zurück", () => {
    expect(clientIp(new Headers())).toBe("unbekannt");
  });
});
