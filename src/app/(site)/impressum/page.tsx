import type { ReactNode } from "react";
import { pageMetadata } from "@/lib/site";

type LegalSection = {
  readonly heading: string;
  readonly body: ReactNode;
};

const SECTIONS: readonly LegalSection[] = [
  {
    heading: "Angaben gemäß § 5 DDG",
    body: (
      <>
        Sabrina Rönne
        <br />
        Am Tannenkamp 1
        <br />
        48465 Schüttorf
      </>
    ),
  },
  {
    heading: "Kontakt",
    body: <>E-Mail: kontakt@norddeich-heuler.de</>,
  },
  {
    heading: "Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV",
    body: (
      <>
        Sabrina Rönne
        <br />
        Am Tannenkamp 1, 48465 Schüttorf
      </>
    ),
  },
];

export const metadata = pageMetadata({
  title: "Impressum",
  description:
    "Impressum der Ferienwohnung Heuler in Norddeich.",
  path: "/impressum",
});

export default function ImpressumPage() {
  return (
    <section className="mx-auto max-w-2xl px-5 py-sektion-m md:py-sektion-l">
      <h1 className="text-h1 text-schlick">Impressum</h1>
      <div className="mt-8 flex flex-col gap-6">
        {SECTIONS.map((section) => (
          <div key={section.heading}>
            <h2 className="text-label font-semibold uppercase text-schlick-2">
              {section.heading}
            </h2>
            <p className="mt-2 text-body text-schlick">{section.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
