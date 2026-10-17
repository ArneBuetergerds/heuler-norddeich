import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { HOME_TITLE, OG_IMAGE, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

// next/font lädt Inter zur Buildzeit herunter und liefert sie von der
// eigenen Domain aus. Kein Request an fonts.googleapis.com – und damit auch
// kein Einwilligungsthema auf einer Seite, die bewusst ohne Cookie-Banner
// auskommt.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

// Grundwerte für Seiten ohne eigene Metadaten (z. B. 404). Die öffentlichen
// Seiten setzen ihre eigenen über `pageMetadata`; der Titel bekommt dabei per
// Vorlage den Namen angehängt.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: HOME_TITLE,
    template: `%s | ${SITE_NAME} Norddeich`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: SITE_NAME,
    title: HOME_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={cn("font-sans", inter.variable)}>
      {/* Header und Footer kommen aus den Bereichs-Layouts: der öffentliche
          Bereich und der Admin-Bereich haben bewusst unterschiedliche Rahmen. */}
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
