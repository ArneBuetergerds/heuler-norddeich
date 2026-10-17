import type { RentalTermsSection } from "./rentalTerms";

/** Ein Eintrag im Inhaltsverzeichnis der Seite /mietbedingungen. */
export type RentalTermsTocEntry = {
  /** Anker des Abschnitts, z. B. "storno". */
  readonly id: string;
  /** Sprungziel auf derselben Seite, z. B. "#storno". */
  readonly href: string;
  /** Laufende Nummer ab 1 – dieselbe wie vor der Überschrift. */
  readonly number: number;
  readonly heading: string;
};

/**
 * Inhaltsverzeichnis aus den Abschnitten der Mietbedingungen. Nummer und
 * Überschrift kommen aus derselben Liste, die auch die Abschnitte rendert –
 * Verzeichnis, Überschriften und Querverweise („nach Abschnitt 7“) können
 * deshalb nicht auseinanderlaufen.
 */
export function rentalTermsToc(
  sections: readonly RentalTermsSection[],
): RentalTermsTocEntry[] {
  return sections.map((section, index) => ({
    id: section.id,
    href: `#${section.id}`,
    number: index + 1,
    heading: section.heading,
  }));
}
