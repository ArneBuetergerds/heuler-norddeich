import type { ReactNode } from "react";

type LegalSection = {
  readonly heading: string;
  readonly body: ReactNode;
};

// Telefonnummer noch als Platzhalter, bis sie vorliegt.
const SECTIONS: readonly LegalSection[] = [
  {
    heading: "Angaben gemäß § 5 TMG",
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
    body: (
      <>
        Telefon: [Telefonnummer]
        <br />
        E-Mail: kontakt@norddeich-heuler.de
      </>
    ),
  },
  {
    heading: "Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV",
    body: (
      <>
        Sabrina Rönne
        <br />
        Am Tannenkamp 1, 48465 Schüttorf
      </>
    ),
  },
];

export default function ImpressumPage() {
  return (
    <section className="mx-auto max-w-[640px] px-6 pt-14 pb-20">
      <h1 className="mb-6 text-[28px] font-extrabold tracking-tight">
        Impressum
      </h1>
      <div className="flex flex-col gap-5 text-sm text-zinc-700">
        {SECTIONS.map((section) => (
          <div key={section.heading}>
            <h2 className="mb-1.5 text-sm font-bold text-zinc-900">
              {section.heading}
            </h2>
            <p>{section.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
