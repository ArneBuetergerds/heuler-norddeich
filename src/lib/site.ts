import type { Metadata } from "next";

/**
 * Stammdaten der Website für Suchmaschinen: kanonische Adresse, Sitemap,
 * OpenGraph und strukturierte Daten greifen alle hierauf zu.
 */
export const SITE_URL = "https://norddeich-heuler.de";

export const SITE_NAME = "Ferienwohnung Heuler";

/** Titel der Startseite: Suchbegriff vorn, Markenname hinten. */
export const HOME_TITLE = "Ferienwohnung Norddeich für 4 Personen nahe Seehundstation | Heuler";

export const SITE_DESCRIPTION =
  "Ferienwohnung in Norddeich für bis zu 4 Personen: zwei Schlafzimmer, Südwest-Balkon, wenige Gehminuten zur Seehundstation. Verfügbarkeit prüfen und direkt beim Vermieter anfragen.";

export const ADDRESS = {
  street: "Ankerweg 6",
  postalCode: "26506",
  locality: "Norden",
  district: "Norddeich",
  region: "Niedersachsen",
  country: "DE",
} as const;

// Quelle: OpenStreetMap/Nominatim für "Ankerweg 6, 26506 Norden".
export const GEO = { latitude: 53.6126862, longitude: 7.1614085 } as const;

/** Vorschaubild für geteilte Links (WhatsApp, Facebook, …), 1200 × 630. */
export const OG_IMAGE = {
  url: "/og-image.jpg",
  width: 1200,
  height: 630,
  alt: "Wohn- und Essbereich der Ferienwohnung Heuler in Norddeich",
} as const;

/** Öffentliche Seiten mit Priorität für die Sitemap. */
export const PUBLIC_PAGES = [
  { path: "/", priority: 1 },
  { path: "/ausstattung", priority: 0.8 },
  { path: "/lage", priority: 0.8 },
  { path: "/faq", priority: 0.6 },
  { path: "/kontakt", priority: 0.5 },
  { path: "/mietbedingungen", priority: 0.3 },
  { path: "/impressum", priority: 0.1 },
  { path: "/datenschutz", priority: 0.1 },
] as const;

type PageMetadataInput = {
  /** Seitentitel ohne Namenszusatz, `null` für die Startseite. */
  title: string | null;
  description: string;
  path: string;
};

/**
 * Metadaten einer Seite. Next.js ersetzt `openGraph` einer Unterseite
 * komplett statt es mit dem Root-Layout zu verschmelzen – deshalb setzt jede
 * Seite den vollständigen Block über diese Funktion – sonst zeigte die
 * Link-Vorschau einer geteilten Unterseite Titel und URL der Startseite.
 */
export function pageMetadata({ title, description, path }: PageMetadataInput): Metadata {
  const ogTitle = title ? `${title} | ${SITE_NAME} Norddeich` : HOME_TITLE;
  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "de_DE",
      siteName: SITE_NAME,
      url: path,
      title: ogTitle,
      description,
      images: [OG_IMAGE],
    },
  };
}
