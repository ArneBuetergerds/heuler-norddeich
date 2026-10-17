import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { clientIp } from "@/lib/rateLimit";
import { createLoginThrottle } from "@/lib/loginThrottle";

// Bremse gegen Passwort-Raten: Jeder Versuch wird beim Eintritt gezählt, eine
// erfolgreiche Anmeldung setzt den Zähler ihrer IP zurück. Pro IP 5 in
// 15 Minuten (danach gesperrt); über dem Gesamtlimit, wenn ein Angreifer viele
// IPs nutzt, wird jeder Versuch nur verzögert – sonst könnte er die
// Betreiberin vom Login aussperren.
const throttle = createLoginThrottle();

/** Eigener Fehlercode, damit das Login-Formular "zu viele Versuche" anzeigen kann. */
class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
}

// Vergleichswert für falsche E-Mail-Adressen: bcrypt läuft dann trotzdem, und
// die Antwortzeit verrät nicht, ob die Adresse die des Admins ist. Cost 12 wie
// bei den echten Hashes (scripts/hash-password.ts), sonst wäre die Antwort bei
// falscher Adresse messbar schneller.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomUUID(), 12);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-Mail", type: "email" },
        password: { label: "Passwort", type: "password" },
      },
      authorize: async (credentials, request) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
        const ip = clientIp(request.headers);

        if (!(await throttle.admit(ip))) {
          throw new TooManyAttempts();
        }

        if (typeof email !== "string" || typeof password !== "string" || !adminEmail || !adminPasswordHash) {
          return null;
        }

        const emailMatches = email === adminEmail;
        const valid = await bcrypt.compare(password, emailMatches ? adminPasswordHash : DUMMY_HASH);
        // Kein eigenes Zählen hier: Der Versuch ist schon in `admit` verbucht.
        if (!emailMatches || !valid) {
          return null;
        }

        throttle.recordSuccess(ip);
        return { id: "admin", email: adminEmail };
      },
    }),
  ],
  pages: {
    signIn: "/admin/login",
  },
  // 12 Stunden statt der voreingestellten 30 Tage: Ein verlorenes oder
  // geteiltes Gerät bleibt nicht wochenlang angemeldet.
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  callbacks: {
    // In diesem next-auth-Beta ist ein nicht angemeldeter Zugriff ohne
    // diesen Callback NICHT automatisch geschützt (authorized ist sonst
    // immer `true`). Erst dieser Callback sorgt dafür, dass der Proxy
    // fehlende Sessions auf `pages.signIn` umleitet.
    authorized: ({ auth: session }) => !!session?.user,
  },
});
