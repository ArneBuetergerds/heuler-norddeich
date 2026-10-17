import type { ReactNode } from "react";
import { GALLERY } from "@/lib/gallery";
import { GalleryGrid } from "@/components/GalleryGrid";
import { pageMetadata } from "@/lib/site";

type Feature = {
  readonly title: string;
  readonly text: string;
  readonly icon: ReactNode;
  readonly wide?: boolean;
};

const ICON_PROPS = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  "aria-hidden": true,
} as const;

const FEATURES: readonly Feature[] = [
  {
    title: "Wohn- und Essbereich",
    text: "Ecksofa mit Schlaffunktion, Couchtisch und Sideboard sowie Esstisch mit 4 Stühlen. Flachbildfernseher mit SAT-TV und Radio (CD/MP3/Kassette).",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M3 12v6a1 1 0 001 1h16a1 1 0 001-1v-6" />
        <path d="M3 12a2 2 0 012-2h14a2 2 0 012 2" />
        <path d="M5 10V8a2 2 0 012-2h10a2 2 0 012 2v2" />
        <path d="M3 18v2M21 18v2" />
      </svg>
    ),
  },
  {
    title: "Küche",
    text: "Spülmaschine, Backofen, Cerankochfeld, Kühlschrank mit Gefrierfach und Mikrowelle. Kapselkaffeemaschine (Nespresso) und Filtermaschine, außerdem Wasserkocher und Mixer.",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M4 3v6a3 3 0 003 3h1v9" />
        <path d="M8 3v6" />
        <path d="M16 3c-1.5 2-1.5 6 0 8v10" />
      </svg>
    ),
  },
  {
    title: "Bad",
    text: "Dusche, WC und Waschbecken, beleuchteter Spiegelschrank, Fön und Ablagemöglichkeiten.",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M9 6a3 3 0 016 0v1" />
        <path d="M4 10h16" />
        <path d="M6 10v9a1 1 0 001 1h10a1 1 0 001-1v-9" />
        <path d="M9 14v3M12 14v3M15 14v3" />
      </svg>
    ),
  },
  {
    title: "Schlafzimmer (klein)",
    text: "2 Betten à 90 cm, Kleiderschrank mit Kleiderstange und Schubladen, großes Fenster.",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M3 18v-6a2 2 0 012-2h14a2 2 0 012 2v6" />
        <path d="M3 18h18" />
        <path d="M3 12v-3a1 1 0 011-1h5a1 1 0 011 1v3" />
      </svg>
    ),
  },
  {
    title: "Schlafzimmer (groß)",
    text: "Bett 180 cm mit Nachttischen und großem Kleiderschrank. Babyreisebett und kleine Abstellkammer vorhanden.",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M3 18v-6a2 2 0 012-2h14a2 2 0 012 2v6" />
        <path d="M3 18h18" />
        <path d="M3 12v-3a1 1 0 011-1h13a1 1 0 011 1v3" />
      </svg>
    ),
  },
  {
    title: "Südwest-Balkon",
    text: "Sonniger Balkon mit Südwest-Ausrichtung, Tisch, Stühlen und Sonnenschirm – perfekt für den Feierabend an der frischen Luft.",
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    title: "Schuppen & Bollerwagen",
    text: "Im Schuppen ist Platz für 2 Fahrräder. Außerdem gehört ein Bollerwagen zur Wohnung – praktisch für Einkäufe und den Weg zum Strand.",
    wide: true,
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="6" cy="17" r="3" />
        <circle cx="18" cy="17" r="3" />
        <path d="M6 17l4-8h5l3 8M10 9l-1-3H7M15 9l-3 8" />
      </svg>
    ),
  },
  {
    title: "Sonstiges",
    text: "Staubsauger und Reinigungsmaterial, Gesellschaftsspiele und Bücher sowie ein Kinderhochstuhl.",
    wide: true,
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M9 6h11M9 12h11M9 18h11" />
        <path d="M4 6h.01M4 12h.01M4 18h.01" />
      </svg>
    ),
  },
];

type Policy = {
  readonly label: string;
  readonly value: string;
};

const POLICIES: readonly Policy[] = [
  { label: "Rauchen", value: "Nichtraucherwohnung" },
  { label: "Haustiere", value: "Nicht erlaubt" },
  { label: "WLAN", value: "Vorhanden, kostenlos" },
  { label: "Parken", value: "Eigener Stellplatz am Haus, kostenlos" },
  { label: "Waschmaschine", value: "Nicht vorhanden" },
];



export const metadata = pageMetadata({
  title: "Ausstattung",
  description:
    "Was die Ferienwohnung Heuler in Norddeich bietet: Wohn- und Essbereich, voll ausgestattete Küche, zwei Schlafzimmer, Duschbad, Südwest-Balkon, kostenloses WLAN, eigener Stellplatz, Fahrradschuppen und Bollerwagen.",
  path: "/ausstattung",
});

export default function AusstattungPage() {
  return (
    <>
      <section className="mx-auto max-w-4xl px-5 py-sektion-m md:py-sektion-l">
        <p className="text-label font-semibold uppercase text-priel">Ausstattung</p>
        <h1 className="mt-4 text-h1 text-schlick">
          Alles für einen entspannten Aufenthalt
        </h1>
        <p className="mt-4 text-body text-schlick-2">
          Die Wohnung ist komplett eingerichtet und bietet Platz für bis zu vier
          Gäste – inklusive Südwest-Balkon für sonnige Abende.
        </p>
      </section>

      <section className="border-y border-linie bg-muschel px-5 py-sektion-m md:py-sektion-l">
        <h2 className="sr-only">Räume und Ausstattung</h2>
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className={`flex gap-4 rounded-card border border-linie bg-sand p-5 ${
                feature.wide ? "sm:col-span-2" : ""
              }`}
            >
              <div className="grid size-11 shrink-0 place-items-center rounded-sm bg-priel-hell text-priel-tief">
                {feature.icon}
              </div>
              <div>
                <h3 className="font-display text-2xl text-schlick">{feature.title}</h3>
                <p className="mt-1.5 text-klein text-schlick-2">{feature.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-sektion-m md:py-sektion-l">
        <h2 className="text-h2 text-schlick">Gut zu wissen</h2>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          {POLICIES.map((policy) => (
            <div
              key={policy.label}
              className="flex items-baseline justify-between gap-4 border-b border-linie pb-3"
            >
              <dt className="text-label font-semibold uppercase text-schlick-2">
                {policy.label}
              </dt>
              <dd className="text-klein font-medium text-schlick">{policy.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Hochformat-Kacheln: Elf der dreizehn Aufnahmen sind hochkant, ein
          Querformat-Raster würde ihnen oben und unten den Inhalt nehmen. */}
      <section className="mx-auto max-w-4xl px-5 pb-sektion-l">
        <h2 className="sr-only">Bilder der Wohnung</h2>
        <GalleryGrid images={GALLERY} />
      </section>
    </>
  );
}
