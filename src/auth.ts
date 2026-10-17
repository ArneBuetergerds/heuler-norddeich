import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { clientIp, createRateLimiter } from "@/lib/rateLimit";

// Bremse gegen Passwort-Raten: Gezählt werden nur Fehlversuche. Pro IP 5 in
// 15 Minuten; das Gesamtlimit greift, wenn ein Angreifer viele IPs nutzt.
const FAILED_WINDOW_MS = 15 * 60 * 1000;
const failedPerIp = createRateLimiter({ limit: 5, windowMs: FAILED_WINDOW_MS });
const failedTotal = createRateLimiter({ limit: 30, windowMs: FAILED_WINDOW_MS });

/** Eigener Fehlercode, damit das Login-Formular "zu viele Versuche" anzeigen kann. */
class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
}

// Vergleichswert für falsche E-Mail-Adressen: bcrypt läuft dann trotzdem, und
// die Antwortzeit verrät nicht, ob die Adresse die des Admins ist.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomUUID(), 10);

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

        if (failedPerIp.isLimited(ip) || failedTotal.isLimited("alle")) {
          throw new TooManyAttempts();
        }

        if (typeof email !== "string" || typeof password !== "string" || !adminEmail || !adminPasswordHash) {
          return null;
        }

        const emailMatches = email === adminEmail;
        const valid = await bcrypt.compare(password, emailMatches ? adminPasswordHash : DUMMY_HASH);
        if (!emailMatches || !valid) {
          failedPerIp.hit(ip);
          failedTotal.hit("alle");
          return null;
        }

        failedPerIp.reset(ip);
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
    // immer `true`). Erst dieser Callback sorgt dafür, dass die Middleware
    // fehlende Sessions auf `pages.signIn` umleitet.
    authorized: ({ auth: session }) => !!session?.user,
  },
});
