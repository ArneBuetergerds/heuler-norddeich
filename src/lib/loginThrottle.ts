import { createRateLimiter, type RateLimiter } from "./rateLimit";

/** Fenster, in dem Fehlversuche gezählt werden. */
export const FAILED_WINDOW_MS = 15 * 60 * 1000;

/**
 * Künstliche Verzögerung je Login-Versuch, solange das Gesamtlimit der
 * Fehlversuche überschritten ist. Kurz genug, dass die Betreiberin sich
 * trotzdem anmelden kann; lang genug, dass ein Angreifer mit vielen IPs
 * deutlich weniger Passwörter je Minute probieren kann.
 */
export const GLOBAL_LIMIT_DELAY_MS = 1500;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type LoginThrottle = {
  /**
   * Vor der Passwortprüfung aufrufen. `false`: Diese IP ist gesperrt, der
   * Versuch wird abgelehnt. Über dem Gesamtlimit wird nur verzögert, nie
   * abgelehnt – sonst könnte ein Angreifer die Betreiberin aussperren.
   */
  admit(ip: string): Promise<boolean>;
  recordFailure(ip: string): void;
  recordSuccess(ip: string): void;
};

/**
 * Bremse gegen Passwort-Raten. Gezählt werden nur Fehlversuche: pro IP 5 in
 * 15 Minuten (harte Sperre), insgesamt 30 (danach nur Verzögerung). Limiter und
 * Wartefunktion sind übergebbar, damit Tests ohne echte Wartezeit auskommen.
 */
export function createLoginThrottle({
  perIp = createRateLimiter({ limit: 5, windowMs: FAILED_WINDOW_MS }),
  total = createRateLimiter({ limit: 30, windowMs: FAILED_WINDOW_MS }),
  delayMs = GLOBAL_LIMIT_DELAY_MS,
  wait = sleep,
}: {
  perIp?: RateLimiter;
  total?: RateLimiter;
  delayMs?: number;
  wait?: (ms: number) => Promise<void>;
} = {}): LoginThrottle {
  return {
    async admit(ip) {
      if (perIp.isLimited(ip)) {
        return false;
      }
      if (total.isLimited("alle")) {
        await wait(delayMs);
      }
      return true;
    },
    recordFailure(ip) {
      perIp.hit(ip);
      total.hit("alle");
    },
    recordSuccess(ip) {
      perIp.reset(ip);
    },
  };
}
