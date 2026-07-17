import type { ReactNode } from "react";
import Image from "next/image";

type Feature = {
  readonly title: string;
  readonly text: string;
  readonly icon: ReactNode;
  readonly wide?: boolean;
};

type GalleryImage = {
  readonly src: string;
  readonly alt: string;
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
    text: "Gemütliches Ecksofa und ein Essplatz für gemeinsame Mahlzeiten.",
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
    text: "Herd, Backofen, Geschirrspüler und Mikrowelle – vollausgestattet zum Selberkochen.",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M4 3v6a3 3 0 003 3h1v9" />
        <path d="M8 3v6" />
        <path d="M16 3c-1.5 2-1.5 6 0 8v10" />
      </svg>
    ),
  },
  {
    title: "Zwei Schlafzimmer",
    text: "Ruhige Schlafzimmer bieten Platz für bis zu vier Personen.",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M3 18v-6a2 2 0 012-2h14a2 2 0 012 2v6" />
        <path d="M3 18h18" />
        <path d="M3 12v-3a1 1 0 011-1h5a1 1 0 011 1v3" />
      </svg>
    ),
  },
  {
    title: "Unterhaltung",
    text: "TV mit DVD/Blu-ray-Player sowie Gesellschaftsspiele und Bücher für Regentage.",
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="3" y="5" width="18" height="13" rx="2" />
        <path d="M9 21h6M12 18v3" />
      </svg>
    ),
  },
  {
    title: "Südwest-Balkon",
    text: "Sonniger Balkon mit Südwest-Ausrichtung – perfekt für den Feierabend an der frischen Luft.",
    wide: true,
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
];

const GALLERY: readonly GalleryImage[] = [
  {
    src: "/images/wohnen-essen/wohnen-essen-03.jpg",
    alt: "Wohnbereich mit Ecksofa und Couchtisch",
  },
  {
    src: "/images/wohnen-essen/wohnen-essen-10.jpg",
    alt: "Küche mit Herd, Backofen und Geschirrspüler",
  },
  {
    src: "/images/schlafzimmer-gross/schlafzimmer-gross-01.jpg",
    alt: "Großes Schlafzimmer mit Doppelbett",
  },
];

export default function AusstattungPage() {
  return (
    <section className="mx-auto max-w-[1120px] px-6 pt-14 pb-20">
      <p className="mb-2 text-xs font-bold tracking-wider text-muted-foreground uppercase">
        Ausstattung
      </p>
      <h1 className="mb-3 text-[32px] font-extrabold tracking-tight">
        Alles für einen entspannten Aufenthalt
      </h1>
      <p className="mb-10 max-w-[640px] text-[15px] text-zinc-600">
        Die Wohnung ist komplett eingerichtet und bietet Platz für bis zu vier
        Gäste – inklusive Südwest-Balkon für sonnige Abende.
      </p>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className={`flex gap-4 rounded-xl border bg-card p-6 ${
              feature.wide ? "sm:col-span-2" : ""
            }`}
          >
            <div className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-zinc-100 text-zinc-700">
              {feature.icon}
            </div>
            <div>
              <h3 className="mb-1.5 text-base font-bold">{feature.title}</h3>
              <p className="text-sm text-zinc-600">{feature.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {GALLERY.map((image) => (
          <div
            key={image.src}
            className="relative h-40 overflow-hidden rounded-xl"
          >
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes="(max-width: 640px) 100vw, 360px"
              className="object-cover"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
