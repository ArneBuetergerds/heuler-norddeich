import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMetadata } from "@/lib/site";
import {
  RENTAL_TERMS_FILE_NAME,
  RENTAL_TERMS_PATH,
  RENTAL_TERMS_PDF_PATH,
  rentalTermsSections,
  rentalTermsStandLabel,
} from "@/lib/rentalTerms";
import { rentalTermsToc } from "@/lib/rentalTermsToc";

export const metadata = pageMetadata({
  title: "Mietbedingungen",
  description:
    "Mietbedingungen der Ferienwohnung Heuler in Norddeich: Preise, Zahlung, Stornierung, An- und Abreise, Haustiere und Rauchen.",
  path: RENTAL_TERMS_PATH,
});

/**
 * Vollständige Mietbedingungen. Text und Reihenfolge kommen aus
 * `rentalTermsSections` (src/lib/rentalTerms.ts) – dieselbe Quelle wie das
 * PDF. Jeder Abschnitt hat einen Anker, der Storno-Abschnitt `#storno`.
 * Gestaltung wie Datenschutz und Impressum; `scroll-mt-24` hält die
 * Überschrift beim Sprung über einen Anker unter der festen Kopfzeile (h-16)
 * frei.
 */
export default function MietbedingungenPage() {
  const sections = rentalTermsSections();
  const toc = rentalTermsToc(sections);

  return (
    <section className="mx-auto max-w-2xl px-5 py-sektion-m md:py-sektion-l">
      <h1 className="text-h1 text-schlick">Mietbedingungen</h1>

      <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-klein text-schlick-2">{rentalTermsStandLabel()}</p>
        <Button asChild variant="outline" className="h-11 px-4">
          <a href={RENTAL_TERMS_PDF_PATH} download={RENTAL_TERMS_FILE_NAME}>
            <Download data-icon="inline-start" aria-hidden="true" />
            Als PDF herunterladen
          </a>
        </Button>
      </div>

      <nav
        aria-labelledby="mietbedingungen-inhalt"
        className="mt-8 rounded-card border border-linie bg-muschel p-5"
      >
        <h2
          id="mietbedingungen-inhalt"
          className="text-label font-semibold uppercase text-schlick-2"
        >
          Inhalt
        </h2>
        <ol className="mt-2 grid sm:grid-cols-2 sm:gap-x-6">
          {toc.map((entry) => (
            <li key={entry.id}>
              <a
                href={entry.href}
                className="flex min-h-11 items-center gap-2 text-klein text-schlick underline-offset-2 hover:text-priel hover:underline sm:min-h-9"
              >
                <span className="w-5 shrink-0 text-right text-schlick-2 tabular-nums">
                  {entry.number}.
                </span>
                <span className="min-w-0">{entry.heading}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 flex flex-col gap-8">
        {toc.map((entry, index) => (
          <div key={entry.id} id={entry.id} className="scroll-mt-24">
            <h2 className="font-display text-2xl text-schlick">
              {entry.number}. {entry.heading}
            </h2>
            <div className="mt-2 flex flex-col gap-2">
              {sections[index].blocks.map((block, blockIndex) =>
                block.kind === "paragraph" ? (
                  <p key={blockIndex} className="text-klein text-schlick-2">
                    {block.text}
                  </p>
                ) : (
                  <ul
                    key={blockIndex}
                    className="flex list-disc flex-col gap-1 pl-5 text-klein text-schlick-2 marker:text-schlick-3"
                  >
                    {block.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
