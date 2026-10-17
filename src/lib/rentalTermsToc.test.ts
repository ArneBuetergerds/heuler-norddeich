import { describe, expect, it } from "vitest";
import { CANCELLATION_ANCHOR, rentalTermsSections } from "./rentalTerms";
import { rentalTermsToc } from "./rentalTermsToc";

describe("rentalTermsToc", () => {
  const sections = rentalTermsSections();
  const toc = rentalTermsToc(sections);

  it("hat für jeden Abschnitt genau einen Eintrag, in derselben Reihenfolge", () => {
    expect(toc.map((entry) => entry.id)).toEqual(sections.map((section) => section.id));
    expect(toc.map((entry) => entry.heading)).toEqual(
      sections.map((section) => section.heading),
    );
  });

  it("nummeriert lückenlos ab 1", () => {
    expect(toc.map((entry) => entry.number)).toEqual(sections.map((_, index) => index + 1));
  });

  it("verlinkt auf den Anker des Abschnitts auf derselben Seite", () => {
    for (const entry of toc) {
      expect(entry.href).toBe(`#${entry.id}`);
    }
    expect(new Set(toc.map((entry) => entry.href)).size).toBe(toc.length);
  });

  it("führt Stornierung und „Kein Widerrufsrecht“ auf", () => {
    expect(toc.find((entry) => entry.id === CANCELLATION_ANCHOR)?.heading).toBe(
      "Rücktritt des Gasts (Stornierung)",
    );
    expect(toc.find((entry) => entry.id === "widerrufsrecht")?.heading).toBe(
      "Kein Widerrufsrecht",
    );
  });

  it("liefert für eine leere Liste ein leeres Verzeichnis", () => {
    expect(rentalTermsToc([])).toEqual([]);
  });
});
