import { describe, expect, it } from "vitest";
import {
  CANCELLATION_ANCHOR,
  RENTAL_TERMS_VERSION,
  formatTermsVersion,
  rentalTermsHref,
  rentalTermsSections,
  rentalTermsStandLabel,
  sectionText,
} from "./rentalTerms";
import {
  BALANCE_DUE_DAYS,
  CLEANING_FEE,
  DEPOSIT_SHARE,
  EXTRAS,
  EXTRAS_LEAD_DAYS,
  MAX_GUESTS,
  SEASONS,
  SERVICE_FEE,
  guestTaxPerNight,
} from "./pricing";
import {
  CANCELLATION_NOTES,
  CANCELLATION_TIERS,
  CHECK_IN_TIME,
  CHECK_OUT_TIME,
  DEPOSIT_DUE_DAYS,
} from "./terms";
import { SELLER } from "./invoice";

const sections = rentalTermsSections();
const alles = sections.map(sectionText).join("\n");

function abschnitt(id: string): string {
  const section = sections.find((s) => s.id === id);
  if (!section) throw new Error(`Abschnitt ${id} fehlt`);
  return sectionText(section);
}

function nummer(id: string): number {
  return sections.findIndex((s) => s.id === id) + 1;
}

describe("rentalTermsSections", () => {
  it("hat elf Abschnitte mit eindeutigen Ankern, der Storno-Abschnitt heißt #storno", () => {
    expect(sections).toHaveLength(11);
    expect(new Set(sections.map((s) => s.id)).size).toBe(11);
    expect(CANCELLATION_ANCHOR).toBe("storno");
    expect(sections.map((s) => s.id)).toContain("storno");
    expect(rentalTermsHref(CANCELLATION_ANCHOR)).toBe("/mietbedingungen#storno");
  });

  it("nennt die Vermieterin mit Anschrift aus SELLER und die Kontaktadresse", () => {
    const text = abschnitt("vertrag");
    expect(text).toContain(SELLER.name);
    for (const zeile of SELLER.address) {
      expect(text).toContain(zeile);
    }
    expect(text).toContain("kontakt@norddeich-heuler.de");
    expect(text).toContain("unverbindlich");
    expect(text).toContain("Buchungsbestätigung");
  });

  it("nennt Wohnung, Anschrift, Höchstbelegung und Stellplatz", () => {
    const text = abschnitt("mietgegenstand");
    expect(text).toContain("Ankerweg 6, 26506 Norden-Norddeich");
    expect(text).toContain(`höchstens ${MAX_GUESTS} Personen`);
    expect(text).toContain("Kinder zählen dabei mit");
    expect(text).toContain("eigener Stellplatz");
  });

  it("nimmt An- und Abreisezeit aus den Konstanten", () => {
    expect(abschnitt("mietzeit")).toContain(`ab ca. ${CHECK_IN_TIME}`);
    expect(abschnitt("mietzeit")).toContain(`bis ${CHECK_OUT_TIME}`);
    expect(abschnitt("abreise")).toContain(`bis ${CHECK_OUT_TIME} besenrein`);
  });

  it("listet jede Saison mit Preis und Mindestnächten aus SEASONS", () => {
    const text = abschnitt("preise");
    for (const season of SEASONS) {
      expect(text).toContain(
        `${season.name} (${season.label}): ${season.pricePerNight} € je Nacht, mindestens ${season.minNights} Nächte`,
      );
    }
  });

  it("nennt Nebenkosten, Wäsche und Kurtaxe mit den Beträgen aus pricing.ts", () => {
    const text = abschnitt("preise");
    expect(text).toContain(`Endreinigung ${CLEANING_FEE} €`);
    expect(text).toContain(`Servicegebühr ${SERVICE_FEE} €`);
    expect(text).toContain(`${EXTRAS.linens.label} ${EXTRAS.linens.pricePerSet} €`);
    expect(text).toContain(`${EXTRAS.towels.label} ${EXTRAS.towels.pricePerSet} €`);
    expect(text).toContain(`spätestens ${EXTRAS_LEAD_DAYS} Tage vor Anreise`);
    expect(text).toContain("ab 14 Jahren");
    // Beträge und Zeitraum so, wie guestTaxPerNight rechnet.
    expect(text).toContain(`${guestTaxPerNight(new Date("2027-03-15")).toFixed(2).replace(".", ",")} € vom 15.03. bis 31.10.`);
    expect(guestTaxPerNight(new Date("2027-10-31"))).toBe(guestTaxPerNight(new Date("2027-03-15")));
    expect(text).toContain(`in der übrigen Zeit ${guestTaxPerNight(new Date("2027-11-01")).toFixed(2).replace(".", ",")} €`);
    expect(text).toContain("bar bei der Schlüsselübergabe");
  });

  it("nennt die Kurtaxe als Teil von Rechnung und Anzahlung, nicht als Barzahlung (BDS-006)", () => {
    const text = abschnitt("preise");
    expect(text).toContain("Die Kurtaxe steht als eigener Posten auf der Rechnung");
    expect(text).toContain("mit Anzahlung und Restbetrag überwiesen");
    expect(text).toContain("an die Stadt Norden weiter");
    // Kein Satz nennt die Kurtaxe zusammen mit einer Barzahlung.
    for (const satz of alles.split(/(?<=[.!?])\s+|\n/)) {
      if (/\bbar\b/.test(satz)) {
        expect(satz).not.toContain("Kurtaxe");
        expect(satz).not.toContain("Gästebeitrag");
      }
    }
  });

  it("sagt „Kurtaxe“ und nennt „Gästebeitrag“ nur einmal als Begriff der Satzung", () => {
    const satzung = "Kurtaxe (Gästebeitrag nach Satzung der Stadt Norden)";
    expect(alles.split(satzung).length - 1).toBe(1);
    expect(alles.replace(satzung, "")).not.toContain("Gästebeitrag");
  });

  it("sagt im Storno-Abschnitt, dass die Kurtaxe erstattet wird", () => {
    expect(abschnitt("storno")).toContain(
      "Die Kurtaxe der Stadt Norden wird bei einer Stornierung vollständig erstattet; die Stornokosten beziehen sich nur auf den Mietpreis.",
    );
  });

  it("nennt Anzahlung und Restzahlung aus den Konstanten und verweist auf den Storno-Abschnitt", () => {
    const text = abschnitt("zahlung");
    expect(text).toContain(
      `Anzahlung von ${Math.round(DEPOSIT_SHARE * 100)} % des Rechnungsbetrags (Mietpreis und Kurtaxe) innerhalb von ${DEPOSIT_DUE_DAYS} Tagen`,
    );
    expect(text).toContain(`spätestens ${BALANCE_DUE_DAYS} Tage vor Anreise`);
    expect(text).toContain("Überweisung");
    expect(text).toContain(`Abschnitt ${nummer("storno")}`);
  });

  it("übernimmt Staffel und Hinweise zur Stornierung wörtlich aus terms.ts", () => {
    const text = abschnitt("storno");
    for (const tier of CANCELLATION_TIERS) {
      expect(text).toContain(`${tier.label}: ${tier.cost}`);
    }
    for (const note of CANCELLATION_NOTES) {
      expect(text).toContain(note);
    }
  });

  it("verbietet Haustiere und Rauchen", () => {
    const text = abschnitt("haustiere-rauchen");
    expect(text).toContain("Haustiere sind nicht erlaubt");
    expect(text).toContain("auch nicht");
    expect(text).toContain("Nichtraucherwohnung");
    expect(text).toContain("Sonderreinigung");
  });

  it("weist auf das fehlende Widerrufsrecht hin und verweist auf den Rücktritt", () => {
    const text = abschnitt("widerrufsrecht");
    expect(text).toContain("kein gesetzliches Widerrufsrecht");
    expect(text).toContain("§ 312g Abs. 2 Nr. 9 BGB");
    expect(text).toContain(`Abschnitt ${nummer("storno")}`);
  });

  it("enthält eine salvatorische Klausel, aber keinen Gerichtsstand und keine Gebühr für weitere Personen", () => {
    expect(abschnitt("schlussbestimmungen")).toContain("übrigen Bestimmungen wirksam");
    expect(alles).not.toMatch(/Gerichtsstand/i);
    expect(alles).not.toContain("10 €/Tag");
    expect(alles).not.toMatch(/10 € (pro|je) (Tag|Person)/);
    expect(alles).not.toMatch(/weitere Person/i);
  });

  it("nennt keine abweichenden Beträge oder Zeiten aus der Vorlage", () => {
    expect(alles).not.toContain("15 Uhr");
    // Ohne Ziffer oder Komma davor – "3,50 €" (Kurtaxe) ist gemeint.
    expect(alles).not.toMatch(/(?<![\d,])50 €/);
    expect(alles).not.toMatch(/(?<![\d,])25 €/);
  });
});

describe("Stand der Mietbedingungen", () => {
  it("ist ein ISO-Datum von höchstens 20 Zeichen (Spalte terms_version)", () => {
    expect(RENTAL_TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(RENTAL_TERMS_VERSION.length).toBeLessThanOrEqual(20);
  });

  it("wird als deutsches Datum angezeigt", () => {
    expect(formatTermsVersion("2026-10-17")).toBe("17.10.2026");
    expect(rentalTermsStandLabel()).toBe(`Stand: ${formatTermsVersion(RENTAL_TERMS_VERSION)}`);
  });
});
