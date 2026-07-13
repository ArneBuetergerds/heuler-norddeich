import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-Mail", type: "email" },
        password: { label: "Passwort", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

        if (!email || !password || !adminEmail || !adminPasswordHash) {
          return null;
        }
        if (email !== adminEmail) {
          return null;
        }
        const valid = await bcrypt.compare(password, adminPasswordHash);
        if (!valid) {
          return null;
        }
        return { id: "admin", email: adminEmail };
      },
    }),
  ],
  pages: {
    signIn: "/admin/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    // In diesem next-auth-Beta ist ein nicht angemeldeter Zugriff ohne
    // diesen Callback NICHT automatisch geschützt (authorized ist sonst
    // immer `true`). Erst dieser Callback sorgt dafür, dass die Middleware
    // fehlende Sessions auf `pages.signIn` umleitet.
    authorized: ({ auth: session }) => !!session?.user,
  },
});
