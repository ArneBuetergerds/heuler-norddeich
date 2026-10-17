import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy. Die Seite lädt fast alles von der eigenen Domain;
 * einzige Ausnahme ist die Google-Maps-Karte (iframe, erst nach Klick).
 *
 * `'unsafe-inline'` bei Skripten ist nötig, weil Next.js seine Hydrations-
 * daten als Inline-Skripte ausliefert und die Seiten teils statisch gebaut
 * werden (Nonces gingen nur mit durchgehend dynamischem Rendering). Die
 * übrigen Direktiven – keine fremden Skriptquellen, kein Einbetten der Seite,
 * keine Formularziele und kein <base> von außen – bleiben trotzdem wirksam.
 * `'unsafe-eval'` braucht nur der Entwicklungsserver.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "frame-src https://www.google.com https://maps.google.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Zwei Jahre HTTPS erzwingen. Greift nur über HTTPS, lokal also wirkungslos.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Doppelt zu frame-ancestors, für ältere Browser.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  // Der Build legt unter .next/standalone einen eigenständigen Server
  // (server.js) mit nur den tatsächlich gebrauchten node_modules ab. Das
  // Docker-Image enthält nur diesen, nicht das komplette node_modules.
  // public/ und .next/static kopiert das Dockerfile selbst dazu – der
  // Standalone-Build tut das nicht.
  output: "standalone",

  // Verrät sonst per "X-Powered-By: Next.js", welche Software läuft.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  // /verfuegbarkeit ist in der Startseite aufgegangen. Der Redirect hält alte
  // Links am Leben - gedruckte Unterlagen, Lesezeichen, Suchmaschinen-Index.
  // `permanent` sendet 308 (nicht 301): Für den GET dieser Seite ist das
  // gleichbedeutend, und Suchmaschinen behandeln beide als dauerhaft.
  async redirects() {
    return [
      {
        source: "/verfuegbarkeit",
        destination: "/#anfrage",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
