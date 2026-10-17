// Seit Next.js 16 heißt die Datei `proxy.ts` statt `middleware.ts`, der Export
// `proxy` statt `middleware` (node_modules/next/dist/docs/01-app/
// 03-api-reference/03-file-conventions/proxy.md, „Migration to Proxy“).
// Verhalten unverändert: next-auth prüft die Sitzung für alles unter /admin.
export { auth as proxy } from "@/auth";

export const config = {
  matcher: ["/admin/:path*"],
};
