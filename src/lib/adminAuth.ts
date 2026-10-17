import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Ist die Sitzung wirklich die des Admins?
 *
 * Nicht nur `session !== null`: Bei einer Fehlkonfiguration (fehlendes
 * AUTH_SECRET, nicht vertrauter Host) liefert `auth()` in next-auth v5 ein
 * Fehlerobjekt statt `null` – eine reine Null-Prüfung ließe dann jeden durch.
 */
export async function isAdmin(): Promise<boolean> {
  return (await adminEmail()) !== null;
}

/** E-Mail des angemeldeten Admins aus der Sitzung, sonst `null`. */
async function adminEmail(): Promise<string | null> {
  const session = await auth();
  const expected = process.env.ADMIN_EMAIL;
  const email = session?.user?.email;
  return expected && email === expected ? email : null;
}

/**
 * Schreibende Admin-Requests müssen von der eigenen Seite kommen. Das
 * SameSite-Cookie schützt schon gegen fremde Websites; die Prüfung von
 * `Origin` bzw. `Sec-Fetch-Site` ist die zweite Linie, z. B. gegen
 * Formulare von einer Subdomain.
 */
function isSameOrigin(request: Request): boolean {
  if (request.method === "GET" || request.method === "HEAD") {
    return true;
  }

  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  // Ohne Origin (sehr alte Browser, Skripte): nur, wenn der Browser nicht
  // ausdrücklich eine fremde Herkunft meldet.
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin";
}

/**
 * Für Admin-API-Routen: `null`, wenn der Zugriff erlaubt ist, sonst die
 * fertige Fehlerantwort.
 *
 *   const denied = await requireAdmin(request);
 *   if (denied) return denied;
 */
export async function requireAdmin(request: Request): Promise<NextResponse | null> {
  const result = await authorizeAdmin(request);
  return "denied" in result ? result.denied : null;
}

/**
 * Wie `requireAdmin`, liefert bei Erfolg aber die E-Mail des Admins aus der
 * Sitzung – für das Protokoll administrativer Aktionen.
 *
 *   const auth = await authorizeAdmin(request);
 *   if ("denied" in auth) return auth.denied;
 *   // auth.actor
 */
export async function authorizeAdmin(
  request: Request,
): Promise<{ denied: NextResponse } | { actor: string }> {
  const actor = await adminEmail();
  if (actor === null) {
    return { denied: NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 }) };
  }
  if (!isSameOrigin(request)) {
    return {
      denied: NextResponse.json({ error: "Ungültige Herkunft der Anfrage" }, { status: 403 }),
    };
  }
  return { actor };
}
