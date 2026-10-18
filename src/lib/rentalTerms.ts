/**
 * Mietbedingungen der Ferienwohnung Heuler – eine Quelle für die Seite
 * /mietbedingungen, das PDF (Download und Anhang der Bestätigungsmail) und
 * den Stand, den ein Gast mit seiner Anfrage bestätigt.
 *
 * Alle Zahlen, Fristen und Uhrzeiten kommen aus denselben Konstanten wie
 * Preistabelle, Formular, Mails und Rechnung (`pricing.ts`, `terms.ts`,
 * `invoice.ts`, `site.ts`). Ändert sich dort etwas, ändert sich der Text hier
 * mit – dann aber auch `RENTAL_TERMS_VERSION` neu setzen, damit an jeder
 * Anfrage erkennbar bleibt, welcher Stand bestätigt wurde.
 *
 * Bewusst ohne Server-Imports: Die Seite rendert auf dem Server, Formular und
 * Admin (Client) brauchen aber Pfad, Dateiname und Stand.
 */
import {
  BALANCE_DUE_DAYS,
  CLEANING_FEE,
  DEPOSIT_SHARE,
  EXTRAS,
  EXTRAS_LEAD_DAYS,
  GUEST_TAX,
  MAX_GUESTS,
  SEASONS,
  SERVICE_FEE,
} from "./pricing";
import {
  CANCELLATION_NOTES,
  CANCELLATION_TIERS,
  CHECK_IN_TIME,
  CHECK_OUT_TIME,
  DEPOSIT_DUE_DAYS,
  PARKING,
  RESPONSE_HOURS,
} from "./terms";
import { SELLER } from "./invoice";
import { ADDRESS, SITE_URL } from "./site";

/**
 * Stand der Mietbedingungen, ISO "YYYY-MM-DD". Wird mit jeder Anfrage
 * gespeichert (`booking_request.terms_version`) – bei jeder inhaltlichen
 * Änderung neu setzen. Höchstens 20 Zeichen (Spaltenlänge).
 */
export const RENTAL_TERMS_VERSION = "2026-10-18";

/** Öffentliche Seite und PDF-Download. */
export const RENTAL_TERMS_PATH = "/mietbedingungen";
export const RENTAL_TERMS_PDF_PATH = "/mietbedingungen/pdf";

/** Vollständige Adresse des PDFs, für Mails und Hinweise an den Admin. */
export const RENTAL_TERMS_PDF_URL = `${SITE_URL}${RENTAL_TERMS_PDF_PATH}`;

/** Dateiname des PDFs, für Download und Mailanhang. */
export const RENTAL_TERMS_FILE_NAME = "Mietbedingungen-Heuler.pdf";

/** Anker des Abschnitts zum Rücktritt des Gasts (Stornierung). */
export const CANCELLATION_ANCHOR = "storno";

/** Kontakt der Vermieterin, wie im Impressum. */
const CONTACT_EMAIL = "kontakt@norddeich-heuler.de";

/**
 * Angaben zur Wohnung, die sonst nirgends im Code stehen. Quelle: Auftrag
 * BDS-005 (2026-10-17); vor dem Release von der Vermieterin zu prüfen.
 */
const APARTMENT = {
  size: "ca. 55 m²",
  floor: "1. Obergeschoss",
  unit: "Wohnung Nr. 7",
} as const;

/** Anschrift der Wohnung, wie im Footer: „Ankerweg 6, 26506 Norden-Norddeich“. */
const APARTMENT_ADDRESS = `${ADDRESS.street}, ${ADDRESS.postalCode} ${ADDRESS.locality}-${ADDRESS.district}`;

/** Ein Absatz oder eine Aufzählung innerhalb eines Abschnitts. */
export type RentalTermsBlock =
  | { readonly kind: "paragraph"; readonly text: string }
  | { readonly kind: "list"; readonly items: readonly string[] };

export type RentalTermsSection = {
  /** Anker auf der Seite, z. B. "storno" für /mietbedingungen#storno. */
  readonly id: string;
  /** Ohne Nummer – sie ergibt sich aus der Reihenfolge. */
  readonly heading: string;
  readonly blocks: readonly RentalTermsBlock[];
};

/** "17.10.2026" aus "2026-10-17". */
export function formatTermsVersion(version: string): string {
  const [jahr, monat, tag] = version.split("-");
  return `${tag}.${monat}.${jahr}`;
}

/** „Stand: 17.10.2026“ – oben auf Seite und PDF. */
export function rentalTermsStandLabel(): string {
  return `Stand: ${formatTermsVersion(RENTAL_TERMS_VERSION)}`;
}

/** 55 → "55 €", 3.5 → "3,50 €" – ganze Beträge ohne Nachkommastellen wie auf der Website. */
function euro(betrag: number): string {
  const text = betrag.toLocaleString("de-DE", {
    minimumFractionDigits: Number.isInteger(betrag) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${text} €`;
}

function absatz(text: string): RentalTermsBlock {
  return { kind: "paragraph", text };
}

function liste(items: readonly string[]): RentalTermsBlock {
  return { kind: "list", items };
}

/**
 * Reihenfolge der Abschnitte. Querverweise („nach Abschnitt 7“) werden
 * daraus berechnet, damit sie beim Umsortieren nicht falsch werden.
 */
const SECTION_ORDER = [
  "vertrag",
  "mietgegenstand",
  "mietzeit",
  "preise",
  "zahlung",
  "haustiere-rauchen",
  CANCELLATION_ANCHOR,
  "abreise",
  "ruecktritt-vermieterin",
  "widerrufsrecht",
  "schlussbestimmungen",
] as const;

export type RentalTermsSectionId = (typeof SECTION_ORDER)[number];
type SectionId = RentalTermsSectionId;

/** Link auf einen Abschnitt, z. B. "/mietbedingungen#storno". */
export function rentalTermsHref(id: RentalTermsSectionId): string {
  return `${RENTAL_TERMS_PATH}#${id}`;
}

function abschnitt(id: SectionId): string {
  return `Abschnitt ${SECTION_ORDER.indexOf(id) + 1}`;
}

/**
 * Die Mietbedingungen als Daten: Überschrift und Absätze je Abschnitt, in der
 * Reihenfolge von `SECTION_ORDER`. Seite und PDF rendern ausschließlich das.
 */
export function rentalTermsSections(): RentalTermsSection[] {
  const sections: Record<SectionId, Omit<RentalTermsSection, "id">> = {
    vertrag: {
      heading: "Vertragsparteien und Zustandekommen des Vertrags",
      blocks: [
        absatz(
          `Vermieterin ist ${SELLER.name}, ${SELLER.address.join(", ")}, E-Mail: ${CONTACT_EMAIL}. Mieterin oder Mieter ist, wer die Buchung anfragt (im Folgenden „Gast“).`,
        ),
        absatz(
          `Die Anfrage – über das Formular der Website, per E-Mail oder telefonisch – ist unverbindlich. Die Vermieterin antwortet in der Regel innerhalb von ${RESPONSE_HOURS} Stunden. Der Mietvertrag kommt erst mit der schriftlichen Buchungsbestätigung der Vermieterin per E-Mail zustande.`,
        ),
        absatz(
          "Diese Mietbedingungen sind Bestandteil des Mietvertrags. Bei einer Anfrage über die Website bestätigt der Gast vor dem Absenden, sie gelesen zu haben; mit der Buchungsbestätigung erhält er sie zusätzlich als PDF.",
        ),
      ],
    },
    mietgegenstand: {
      heading: "Mietgegenstand",
      blocks: [
        absatz(
          `Vermietet wird die Ferienwohnung „Heuler“, ${APARTMENT.size}, im ${APARTMENT.floor} (${APARTMENT.unit}), ${APARTMENT_ADDRESS}, ausschließlich zur Nutzung als Ferienunterkunft.`,
        ),
        absatz(
          `Die Wohnung darf von höchstens ${MAX_GUESTS} Personen bewohnt werden; Kinder zählen dabei mit.`,
        ),
        absatz(`Zur Wohnung gehört ein ${PARKING.charAt(0).toLowerCase()}${PARKING.slice(1)}.`),
      ],
    },
    mietzeit: {
      heading: "Mietzeit",
      blocks: [
        absatz(
          `Am Anreisetag steht die Wohnung ab ca. ${CHECK_IN_TIME} bereit. Am Abreisetag ist sie bis ${CHECK_OUT_TIME} zu räumen.`,
        ),
        absatz(
          "Eine spätere Anreise ist nach Absprache möglich – bitte in der Anfrage oder rechtzeitig vorher mitteilen.",
        ),
      ],
    },
    preise: {
      heading: "Mietpreis und Nebenkosten",
      blocks: [
        absatz(
          "Der Mietpreis ist die Summe der Übernachtungspreise. Er gilt je Nacht für die ganze Wohnung, nicht je Person. Jede Nacht kostet den Preis der Saison, in die sie fällt; der Mindestaufenthalt richtet sich nach der Saison des Anreisetags:",
        ),
        liste(
          SEASONS.map(
            (season) =>
              `${season.name} (${season.label}): ${euro(season.pricePerNight)} je Nacht, mindestens ${season.minNights} Nächte`,
          ),
        ),
        absatz("Zusätzlich fallen an:"),
        liste([
          `Endreinigung ${euro(CLEANING_FEE)} und Servicegebühr ${euro(SERVICE_FEE)}, einmalig je Aufenthalt`,
          `auf Wunsch ${EXTRAS.linens.label} ${euro(EXTRAS.linens.pricePerSet)} und ${EXTRAS.towels.label} ${euro(EXTRAS.towels.pricePerSet)}, je Satz und Aufenthalt; bitte spätestens ${EXTRAS_LEAD_DAYS} Tage vor Anreise mitbestellen`,
          `der Gästebeitrag der Stadt Norden je Person ab 14 Jahren und Nacht: ${euro(GUEST_TAX.main)} vom 15.03. bis 31.10., in der übrigen Zeit ${euro(GUEST_TAX.off)}; Kinder bis einschließlich 13 Jahre zahlen keinen Gästebeitrag`,
        ]),
        absatz(
          "Der Gästebeitrag steht als eigener Posten auf der Rechnung und wird mit Anzahlung und Restbetrag überwiesen; die Vermieterin leitet ihn an die Stadt Norden weiter. Dafür gibt der Gast in der Anfrage an, wie viele Personen unter 14 Jahre alt sind.",
        ),
        absatz(
          "Endreinigung, Servicegebühr und bestellte Wäsche werden bar bei der Schlüsselübergabe bezahlt. Strom, Wasser und Heizung sind im Mietpreis enthalten.",
        ),
      ],
    },
    zahlung: {
      heading: "Zahlung",
      blocks: [
        absatz(
          `Nach der Buchungsbestätigung ist eine Anzahlung von ${Math.round(DEPOSIT_SHARE * 100)} % des Rechnungsbetrags (Mietpreis und Gästebeitrag) innerhalb von ${DEPOSIT_DUE_DAYS} Tagen fällig, der Restbetrag spätestens ${BALANCE_DUE_DAYS} Tage vor Anreise – jeweils per Überweisung. Beträge und Bankverbindung stehen in der Buchungsbestätigung und der Rechnung.`,
        ),
        absatz(
          `Gehen Anzahlung oder Restbetrag nicht fristgerecht ein, kann die Vermieterin nach erfolgloser Mahnung vom Vertrag zurücktreten und Stornokosten nach ${abschnitt(CANCELLATION_ANCHOR)} verlangen.`,
        ),
      ],
    },
    "haustiere-rauchen": {
      heading: "Haustiere und Rauchen",
      blocks: [
        absatz(
          "Haustiere sind nicht erlaubt, auch nicht vorübergehend oder zu Besuch. Die Wohnung ist eine Nichtraucherwohnung.",
        ),
        absatz(
          "Wird dagegen verstoßen, trägt der Gast die Kosten einer dadurch nötigen Sonderreinigung und einen dadurch entstehenden Mietausfall.",
        ),
      ],
    },
    [CANCELLATION_ANCHOR]: {
      heading: "Rücktritt des Gasts (Stornierung)",
      blocks: [
        absatz(
          "Der Gast kann vor der Anreise jederzeit vom Vertrag zurücktreten. Dann fallen, bezogen auf den Mietpreis, folgende Stornokosten an:",
        ),
        liste(CANCELLATION_TIERS.map((tier) => `${tier.label}: ${tier.cost}`)),
        ...CANCELLATION_NOTES.map((note) => absatz(note)),
      ],
    },
    abreise: {
      heading: "Abreise",
      blocks: [
        absatz(
          `Am Abreisetag ist die Wohnung bis ${CHECK_OUT_TIME} besenrein zu übergeben. Dazu gehört:`,
        ),
        liste([
          "Müll und Altglas entsorgen",
          "Bettwäsche abziehen",
          "Geschirr spülen bzw. die Spülmaschine ausräumen",
        ]),
        absatz(
          "Schäden an Wohnung oder Inventar bitte sofort, spätestens bei der Abreise melden. Die Endreinigung ersetzt diese Pflichten nicht; Mehraufwand, der darüber hinausgeht, kann berechnet werden.",
        ),
      ],
    },
    "ruecktritt-vermieterin": {
      heading: "Rücktritt und Kündigung durch die Vermieterin",
      blocks: [
        absatz(
          "Die Vermieterin kann vor oder während der Mietzeit aus wichtigem Grund vom Vertrag zurücktreten oder ihn fristlos kündigen – etwa wenn der Gast erheblich gegen den Vertrag oder diese Mietbedingungen verstößt oder es zu Vorkommnissen kommt, die der Vermieterin eine Fortsetzung des Vertrags unzumutbar machen.",
        ),
        absatz("Die gesetzlichen Rechte beider Vertragsparteien bleiben unberührt."),
      ],
    },
    widerrufsrecht: {
      heading: "Kein Widerrufsrecht",
      blocks: [
        absatz(
          "Für Verträge über die Vermietung von Ferienwohnungen für einen bestimmten Zeitraum besteht kein gesetzliches Widerrufsrecht (§ 312g Abs. 2 Nr. 9 BGB) – auch dann nicht, wenn der Vertrag per E-Mail, über die Website oder telefonisch geschlossen wird.",
        ),
        absatz(
          `Der Gast kann aber nach ${abschnitt(CANCELLATION_ANCHOR)} vom Vertrag zurücktreten; es gelten die dort genannten Stornokosten.`,
        ),
      ],
    },
    schlussbestimmungen: {
      heading: "Unwirksame Bestimmungen",
      blocks: [
        absatz(
          "Ist eine Bestimmung dieser Mietbedingungen unwirksam oder wird sie es, bleiben die übrigen Bestimmungen wirksam. An die Stelle der unwirksamen Bestimmung tritt die gesetzliche Regelung.",
        ),
      ],
    },
  };

  return SECTION_ORDER.map((id) => ({ id, ...sections[id] }));
}

/** Alle Texte eines Abschnitts als Zeichenketten, z. B. für Tests und Suche. */
export function sectionText(section: RentalTermsSection): string {
  return section.blocks
    .flatMap((block) => (block.kind === "paragraph" ? [block.text] : block.items))
    .join("\n");
}
