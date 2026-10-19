import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

// Vitest kennt den Pfad-Alias `@/` nicht (keine vitest-Konfiguration). Die
// echten Module über relative Pfade; Links sind für die Texte unerheblich.
vi.mock("@/lib/pricing", () => import("../../../lib/pricing"));
vi.mock("@/lib/site", () => import("../../../lib/site"));
vi.mock("@/lib/terms", () => import("../../../lib/terms"));
vi.mock("@/lib/rentalTerms", () => import("../../../lib/rentalTerms"));
vi.mock("@/components/RentalTermsMoreLink", () => ({ RentalTermsMoreLink: () => null }));
vi.mock("next/link", () => ({ default: () => null }));

import FaqPage, { metadata } from "./page";

type FaqData = {
  mainEntity: { name: string; acceptedAnswer: { text: string } }[];
};

/** Strukturierte FAQ-Daten (JSON-LD), wie sie im `<script>` der Seite stehen. */
function structuredData(): FaqData {
  const section = FaqPage() as ReactElement<{ children: ReactElement[] }>;
  const script = section.props.children[0] as ReactElement<{
    dangerouslySetInnerHTML: { __html: string };
  }>;
  return JSON.parse(script.props.dangerouslySetInnerHTML.__html) as FaqData;
}

describe("FAQ: Bezeichnung Kurtaxe (BDS-006)", () => {
  it("sagt in Fragen, Antworten und Beschreibung „Kurtaxe“, nie „Gästebeitrag“", () => {
    const data = structuredData();
    const texte = [
      String(metadata.description),
      ...data.mainEntity.flatMap((eintrag) => [eintrag.name, eintrag.acceptedAnswer.text]),
    ];

    expect(data.mainEntity.length).toBeGreaterThan(0);
    for (const text of texte) {
      expect(text).not.toContain("Gästebeitrag");
    }
    expect(data.mainEntity.map((eintrag) => eintrag.name)).toContain("Wie hoch ist die Kurtaxe?");
    expect(String(metadata.description)).toContain("Kurtaxe");
  });
});
