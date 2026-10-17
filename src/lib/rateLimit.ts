/**
 * Einfacher Rate-Limiter im Arbeitsspeicher (gleitendes Fenster).
 *
 * Reicht hier aus, weil die App als ein einzelner Container läuft. Nach einem
 * Neustart sind die Zähler leer – das ist in Kauf genommen: Es geht darum,
 * Bots und Passwort-Rater auszubremsen, nicht um exakte Abrechnung.
 */
export type RateLimiter = {
  /** Zählt einen Versuch; `false`, wenn das Limit schon erreicht war. */
  hit(key: string, now?: number): boolean;
  /** Prüft ohne zu zählen. */
  isLimited(key: string, now?: number): boolean;
  reset(key: string): void;
};

export function createRateLimiter({
  limit,
  windowMs,
}: {
  limit: number;
  windowMs: number;
}): RateLimiter {
  const hits = new Map<string, number[]>();

  function recent(key: string, now: number): number[] {
    const list = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
    if (list.length === 0) {
      hits.delete(key);
    } else {
      hits.set(key, list);
    }
    return list;
  }

  // Aufräumen, damit die Map bei vielen verschiedenen IPs nicht wächst.
  // `unref`, damit der Timer Tests und Skripte nicht am Beenden hindert.
  setInterval(() => {
    const now = Date.now();
    for (const key of hits.keys()) recent(key, now);
  }, windowMs).unref?.();

  return {
    hit(key, now = Date.now()) {
      const list = recent(key, now);
      if (list.length >= limit) {
        return false;
      }
      hits.set(key, [...list, now]);
      return true;
    },
    isLimited(key, now = Date.now()) {
      return recent(key, now).length >= limit;
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

/**
 * IP des Besuchers hinter dem Reverse Proxy (Traefik in Coolify). Traefik
 * setzt `X-Real-Ip` auf die tatsächliche Gegenstelle. Bei `X-Forwarded-For`
 * zählt der letzte Eintrag – der ist vom Proxy angehängt, alle davor kann der
 * Client selbst mitschicken und damit fälschen.
 */
export function clientIp(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  return last || "unbekannt";
}
