import { createRateLimiter, type RateLimiter } from "./rateLimit";

/** Fenster, in dem Login-Versuche gezählt werden (erfolgreiche setzen die IP zurück). */
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
   * Vor der Passwortprüfung aufrufen. Zählt den Versuch sofort – je IP und
   * insgesamt –, noch bevor gewartet oder das Passwort geprüft wird. Nur so
   * kommen parallel abgeschickte Versuche einer IP nicht gemeinsam an der
   * Sperre vorbei: Zählen und Prüfen geschehen in einem synchronen Schritt,
   * zwischen dem kein anderer Request dazwischenkommt.
   *
   * `false`: Diese IP ist gesperrt, der Versuch wird abgelehnt. Über dem
   * Gesamtlimit wird nur verzögert, nie abgelehnt – sonst könnte ein Angreifer
   * die Betreiberin aussperren.
   */
  admit(ip: string): Promise<boolean>;
  /** Nach erfolgreicher Anmeldung: Die Versuche dieser IP verfallen. */
  recordSuccess(ip: string): void;
};

/**
 * Bremse gegen Passwort-Raten: pro IP 5 Versuche in 15 Minuten (harte Sperre),
 * insgesamt 30 (danach nur Verzögerung). Gezählt wird jeder Versuch beim
 * Eintritt; eine erfolgreiche Anmeldung setzt den Zähler ihrer IP zurück, so
 * dass im Ergebnis nur Fehlversuche die Sperre auslösen. Limiter und
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
      // Kein `await` vor diesen beiden Zeilen: `hit` prüft und zählt in einem
      // Zug, damit ist der Versuch verbucht, bevor ein paralleler Request
      // derselben IP an die Reihe kommt.
      if (!perIp.hit(ip)) {
        return false;
      }
      if (!total.hit("alle")) {
        await wait(delayMs);
      }
      return true;
    },
    recordSuccess(ip) {
      perIp.reset(ip);
    },
  };
}
