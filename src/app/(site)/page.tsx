import Image from "next/image";
import Link from "next/link";
import { getPublicOccupancy } from "@/db/queries";
import { GALLERY } from "@/lib/gallery";
import { BALANCE_DUE_DAYS, DEPOSIT_SHARE, SEASONS } from "@/lib/pricing";
import { DEPOSIT_DUE_DAYS, RESPONSE_HOURS } from "@/lib/terms";
import { HeroGallery } from "@/components/HeroGallery";
import { AvailabilityRequest } from "@/components/AvailabilityRequest";
import {
  ArrivalTimes,
  KurkarteInfo,
  PriceTable,
} from "@/components/StayConditions";
import { pageMetadata } from "@/lib/site";
import { lodgingStructuredData } from "@/lib/structuredData";

// Ohne dynamische API (cookies/headers) würde Next.js diese Seite beim Build
// statisch vorrendern und die Belegung als Snapshot vom Deploy-Zeitpunkt
// einfrieren – Gäste sähen dann veraltete Verfügbarkeit. Zusätzlich ist beim
// Docker-Build (Coolify) noch keine erreichbare DB vorhanden.
export const dynamic = "force-dynamic";

const TEASER = [
  {
    href: "/ausstattung",
    titel: "Ausstattung",
    text: "Was da ist, und was nicht – ehrlich aufgelistet.",
    bild: GALLERY[4],
  },
  {
    href: "/lage",
    titel: "Lage",
    text: "Entfernungen zu Seehundstation, Strand, Schwimmbad und Einkauf.",
    bild: GALLERY[0],
  },
] as const;

const LOWEST_PRICE = Math.min(...SEASONS.map((season) => season.pricePerNight));

// Die Galerie beginnt innen: Die Außenaufnahme (geschlossene Rollläden, Auto
// im Bild) ist als erster Eindruck schwach und wandert ans Ende.
const HERO_IMAGES = [
  ...GALLERY.filter((bild) => !bild.src.includes("/haus-garten/")),
  ...GALLERY.filter((bild) => bild.src.includes("/haus-garten/")),
];

/** Die Fakten, nach denen Gäste zuerst suchen – ohne Scrollen sichtbar. */
const FACTS = [
  "Bis 4 Personen · 2 Schlafzimmer",
  "Südwest-Balkon · WLAN kostenlos",
  "Eigener Stellplatz am Haus",
  "Seehundstation 2, Strand 10 Gehminuten",
] as const;

/**
 * Der Ablauf nach dem Absenden. Nimmt die häufigste Unsicherheit vor einer
 * Anfrage: "Was passiert dann, und bin ich schon gebunden?"
 */
const ABLAUF = [
  { titel: "Anfrage senden", text: "Unverbindlich, ohne Zahlung." },
  {
    titel: "Persönliche Antwort",
    text: `Innerhalb von ${RESPONSE_HOURS} Stunden – Zusage oder Absage per E-Mail.`,
  },
  {
    titel: "Anzahlung",
    text: `${Math.round(DEPOSIT_SHARE * 100)} % innerhalb von ${DEPOSIT_DUE_DAYS} Tagen nach der Zusage.`,
  },
  {
    titel: "Anreise",
    text: `Rest bis ${BALANCE_DUE_DAYS} Tage vorher, Schlüssel persönlich vor Ort.`,
  },
] as const;

export const metadata = pageMetadata({
  title: null,
  description:
    "Ferienwohnung in Norddeich für bis zu 4 Personen: zwei Schlafzimmer, Südwest-Balkon, wenige Gehminuten zur Seehundstation. Freie Termine im Kalender prüfen und direkt anfragen.",
  path: "/",
});

export default async function HomePage() {
  // Nur Zeiträume, die heute oder später noch sperren, ohne Gastname oder
  // Notiz: Gäste sehen, dass ein Tag belegt ist, nicht durch wen oder warum.
  // "Heute" in UTC wie Kalender und Validierung (die `date`-Spalten sind
  // UTC-Mitternacht).
  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const publicOccupancy = await getPublicOccupancy(todayUtc);

  return (
    <>
      {/* Strukturierte Daten für Suchmaschinen. "<" wird escaped, damit ein
          Wert nie das Script-Tag beenden kann. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(lodgingStructuredData()).replace(/</g, "\\u003c"),
        }}
      />

      {/* --- Einstieg ----------------------------------------------------- */}
      {/* Mobil: erst die Bilder, dann Überschrift, Buttons und Fakten – der
          erste Bildschirm zeigt die Wohnung und den Weg zur Anfrage. Ab md
          stehen Text und Galerie nebeneinander. */}
      <section className="mx-auto grid max-w-5xl gap-6 px-5 pt-8 pb-sektion-m md:grid-cols-[1fr_minmax(0,440px)] md:items-center md:gap-12 md:pt-sektion-m md:pb-sektion-l">
        <div className="md:order-2">
          <HeroGallery images={HERO_IMAGES} />
        </div>

        <div className="md:order-1">
          <p className="text-label font-semibold uppercase text-priel">
            Ferienwohnung Heuler · Norddeich
          </p>
          <h1 className="mt-3 text-h1 text-schlick md:text-display">
            Ferienwohnung in Norddeich für bis zu 4 Personen
          </h1>
          <p className="mt-4 text-body text-schlick-2">
            Direkt bei der Vermieterin buchen, ohne Portalaufschlag. Sie fragen
            unverbindlich an und bekommen eine persönliche Antwort.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href="#anfrage"
              className="flex h-13 items-center justify-center rounded-pille bg-priel px-8 text-base font-semibold text-muschel transition-colors hover:bg-priel-tief"
            >
              Freie Termine prüfen
            </a>
            <a
              href="#preise"
              className="flex h-13 items-center justify-center rounded-pille border border-linie px-8 text-base font-semibold text-schlick transition-colors hover:bg-priel-hell"
            >
              Preise ab {LOWEST_PRICE} € / Nacht
            </a>
          </div>

          <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {FACTS.map((fact) => (
              <li key={fact} className="flex items-center gap-2 text-klein text-schlick">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 text-priel-tief"
                  aria-hidden="true"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {fact}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* --- Verfügbarkeit & Anfrage --------------------------------------- */}
      {/* scroll-mt: Der Sprung aus der Navigation darf nicht unter der
          sticky Kopfzeile landen. */}
      <section
        id="anfrage"
        className="scroll-mt-20 border-y border-linie bg-muschel px-5 py-sektion-m md:py-sektion-xl"
      >
        <div className="mx-auto max-w-6xl">
          <p className="text-label font-semibold uppercase text-priel">Verfügbarkeit</p>
          <h2 className="mt-3 text-h2 text-schlick">Ist Ihr Termin frei?</h2>

          <ol className="mt-6 grid gap-4 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
            {ABLAUF.map(({ titel, text }, i) => (
              // Mobil ohne Kästen, damit der Kalender nicht zu weit nach unten rutscht.
              <li
                key={titel}
                className="flex gap-3 sm:rounded-card sm:border sm:border-linie sm:bg-sand sm:p-4"
              >
                <span
                  aria-hidden="true"
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-priel text-mikro font-semibold text-muschel"
                >
                  {i + 1}
                </span>
                <span>
                  <span className="block text-klein font-semibold text-schlick">{titel}</span>
                  <span className="block text-mikro text-schlick-2">{text}</span>
                </span>
              </li>
            ))}
          </ol>

          <AvailabilityRequest occupancy={publicOccupancy} />
        </div>
      </section>

      {/* --- An- und Abreise ------------------------------------------------ */}
      <section className="mx-auto max-w-4xl px-5 py-sektion-m md:py-sektion-l">
        <h2 className="text-h2 text-schlick">An- und Abreise</h2>
        <div className="mt-5">
          <ArrivalTimes />
        </div>
        <p className="mt-5 text-klein text-schlick-2">
          Schlüsselübergabe persönlich. Spätere Anreise nach Absprache –
          schreiben Sie es einfach in die Anfrage.
        </p>
      </section>

      {/* --- Preise --------------------------------------------------------- */}
      <section
        id="preise"
        className="scroll-mt-20 border-y border-linie bg-muschel px-5 py-sektion-m md:py-sektion-xl"
      >
        <div className="mx-auto max-w-4xl">
          <h2 className="text-h2 text-schlick">Preise</h2>
          <p className="mt-2 text-klein text-schlick-2">
            pro Nacht, bis vier Personen. Der Mindestaufenthalt richtet sich
            nach der Saison Ihrer Anreise.
          </p>
          <div className="mt-6">
            <PriceTable />
          </div>
        </div>
      </section>

      {/* --- Kurkarte -------------------------------------------------------- */}
      <section className="bg-priel-hell px-5 py-sektion-m md:py-sektion-l">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-h2 text-schlick">Gästebeitrag und Gästekarte</h2>
          <KurkarteInfo />
        </div>
      </section>

      {/* --- Teaser ---------------------------------------------------------- */}
      <section className="mx-auto max-w-4xl px-5 py-sektion-m md:py-sektion-l">
        <div className="grid gap-4 sm:grid-cols-2">
          {TEASER.map(({ href, titel, text, bild }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-4 rounded-card border border-linie bg-muschel p-4 transition-colors hover:border-priel"
            >
              <span className="relative h-40 w-30 shrink-0 overflow-hidden rounded-sm bg-track">
                <Image
                  src={bild.src}
                  alt=""
                  fill
                  sizes="120px"
                  className="object-cover"
                />
              </span>
              <span className="flex flex-col gap-2">
                <span className="font-display text-2xl text-schlick">{titel}</span>
                <span className="text-mikro text-schlick-2">{text}</span>
                <span className="text-mikro font-semibold text-priel">Ansehen</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* --- Vermieterin ------------------------------------------------------ */}
      <section className="bg-schlick px-5 py-sektion-m md:py-sektion-l">
        <div className="mx-auto flex max-w-2xl flex-col">
          <p className="text-label font-semibold uppercase text-duenengras">
            Ihre Vermieterin
          </p>
          <h2 className="mt-4 text-h2 text-muschel">Sabrina Rönne</h2>
          <p className="mt-4 text-body text-priel-hell">
            Ich vermiete die Wohnung selbst – keine Agentur, keine Provision,
            keine automatische Bestätigung. Jede Anfrage beantworte ich
            persönlich, in der Regel innerhalb von {RESPONSE_HOURS} Stunden.
          </p>
          <Link
            href="/kontakt"
            className="mt-8 flex h-13 items-center justify-center rounded-pille bg-duenengras px-8 text-base font-semibold text-schlick sm:self-start"
          >
            Kontakt aufnehmen
          </Link>
        </div>
      </section>
    </>
  );
}
