import Link from "next/link";
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
} from "@/lib/pricing";
import { pageMetadata } from "@/lib/site";
import {
  CANCELLATION_TIERS,
  CHECK_IN_TIME,
  CHECK_OUT_TIME,
  DEPOSIT_DUE_DAYS,
  PARKING,
  RESPONSE_HOURS,
} from "@/lib/terms";
import { CANCELLATION_ANCHOR, rentalTermsHref } from "@/lib/rentalTerms";
import { RentalTermsMoreLink } from "@/components/RentalTermsMoreLink";

/**
 * Verweis unter einer Antwort auf den passenden Abschnitt der Mietbedingungen.
 * `thema` hört nur der Screenreader („Mehr in den Mietbedingungen: Zahlung“).
 */
type Verweis = { readonly href: string; readonly thema: string };

const minNights = SEASONS.map((season) => season.minNights);
const euro = (betrag: number) => betrag.toLocaleString("de-DE", { minimumFractionDigits: 2 });

/**
 * Häufige Fragen. Jede Antwort speist sich aus denselben Konstanten wie
 * Preistabelle, Formular und Mails – ändert sich ein Betrag oder eine Frist,
 * stimmt die FAQ automatisch mit.
 */
const FAQ: readonly { frage: string; antwort: string; verweis?: Verweis }[] = [
  {
    frage: "Für wie viele Personen ist die Wohnung geeignet?",
    antwort: `Für bis zu ${MAX_GUESTS} Personen: ein Schlafzimmer mit 180-cm-Bett, eines mit zwei Einzelbetten à 90 cm. Das Ecksofa im Wohnbereich hat zusätzlich eine Schlaffunktion.`,
  },
  {
    frage: "Wie lange muss ich mindestens bleiben?",
    antwort: `Je nach Saison der Anreise ${Math.min(...minNights)} bis ${Math.max(...minNights)} Nächte, in der Hauptsaison (Juli und August) eine Woche. Den Mindestaufenthalt für Ihren Zeitraum zeigt das Anfrageformular direkt an.`,
  },
  {
    frage: "Wie schnell bekomme ich eine Antwort?",
    antwort: `Innerhalb von ${RESPONSE_HOURS} Stunden, persönlich von der Vermieterin – Zusage oder Absage per E-Mail. Die Anfrage selbst ist unverbindlich.`,
  },
  {
    frage: "Wie und wann bezahle ich?",
    antwort: `Nach der Zusage überweisen Sie innerhalb von ${DEPOSIT_DUE_DAYS} Tagen ${Math.round(DEPOSIT_SHARE * 100)} % des Mietpreises als Anzahlung, den Rest spätestens ${BALANCE_DUE_DAYS} Tage vor Anreise. Endreinigung (${CLEANING_FEE} €), Servicegebühr (${SERVICE_FEE} €), bestellte Wäsche und der Gästebeitrag werden bar bei der Schlüsselübergabe bezahlt.`,
    verweis: { href: rentalTermsHref("zahlung"), thema: "Zahlung" },
  },
  {
    frage: "Was kostet eine Stornierung?",
    antwort: `${CANCELLATION_TIERS.map((tier) => `${tier.label[0].toUpperCase()}${tier.label.slice(1)}: ${tier.cost}`).join(". ")}. Gelingt eine Weitervermietung, erstatten wir die Stornokosten. Eine Reiserücktrittsversicherung empfehlen wir.`,
    verweis: { href: rentalTermsHref(CANCELLATION_ANCHOR), thema: "Stornierung" },
  },
  {
    frage: "Gibt es einen Parkplatz?",
    antwort: `Ja. ${PARKING}.`,
  },
  {
    frage: "Muss ich Bettwäsche und Handtücher mitbringen?",
    antwort: `Sie können sie mitbringen oder mitbestellen: Bettwäsche ${EXTRAS.linens.pricePerSet} €, Handtücher ${EXTRAS.towels.pricePerSet} € je Person und Aufenthalt. Bitte spätestens ${EXTRAS_LEAD_DAYS} Tage vor Anreise im Anfrageformular angeben.`,
  },
  {
    frage: "Gibt es WLAN?",
    antwort: "Ja, kostenlos.",
  },
  {
    frage: "Wann kann ich anreisen, wann muss ich abreisen?",
    antwort: `Anreise ab ${CHECK_IN_TIME}, Abreise bis ${CHECK_OUT_TIME}. Eine spätere Anreise ist nach Absprache möglich – schreiben Sie es einfach in die Anfrage.`,
  },
  {
    frage: "Ist die Wohnung für Kinder geeignet?",
    antwort:
      "Ja. Ein Babyreisebett und ein Kinderhochstuhl sind vorhanden, Spielplatz und Seehundstation liegen wenige Gehminuten entfernt. Kinder bis einschließlich 13 Jahre zahlen keinen Gästebeitrag.",
  },
  {
    frage: "Wie hoch ist der Gästebeitrag (Kurtaxe)?",
    antwort: `Die Stadt Norden erhebt ${euro(GUEST_TAX.main)} € je Person ab 14 Jahren und Nacht vom 15.03. bis 31.10., in der übrigen Zeit ${euro(GUEST_TAX.off)} €. Er wird bei der Schlüsselübergabe bar bezahlt; dafür erhalten Sie die Gästekarte mit Vergünstigungen.`,
  },
  {
    frage: "Sind Haustiere erlaubt? Darf geraucht werden?",
    antwort: "Nein, Haustiere sind nicht erlaubt, und die Wohnung ist eine Nichtraucherwohnung.",
    verweis: { href: rentalTermsHref("haustiere-rauchen"), thema: "Haustiere und Rauchen" },
  },
  {
    frage: "Gibt es eine Waschmaschine?",
    antwort: "Nein, eine Waschmaschine ist nicht vorhanden.",
  },
  {
    frage: "Kann ich Fahrräder mitbringen?",
    antwort:
      "Ja. Im Schuppen ist Platz für zwei Fahrräder. Außerdem gehört ein Bollerwagen zur Wohnung – praktisch für Einkäufe und den Weg zum Strand.",
  },
];

export const metadata = pageMetadata({
  title: "Häufige Fragen",
  description:
    "Antworten zur Ferienwohnung Heuler in Norddeich: Mindestaufenthalt, Anzahlung, Stornierung, Parken, Bettwäsche, WLAN, Kinder und Gästebeitrag.",
  path: "/faq",
});

export default function FaqPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(({ frage, antwort }) => ({
      "@type": "Question",
      name: frage,
      acceptedAnswer: { "@type": "Answer", text: antwort },
    })),
  };

  return (
    <section className="mx-auto max-w-2xl px-5 py-sektion-m md:py-sektion-l">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />

      <p className="text-label font-semibold uppercase text-priel">FAQ</p>
      <h1 className="mt-4 text-h1 text-schlick">Häufige Fragen</h1>

      <div className="mt-8 flex flex-col divide-y divide-linie border-y border-linie">
        {FAQ.map(({ frage, antwort, verweis }) => (
          <details key={frage} className="group py-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-body font-medium text-schlick [&::-webkit-details-marker]:hidden">
              <h2>{frage}</h2>
              <span
                aria-hidden="true"
                className="shrink-0 text-xl text-schlick-2 transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-2 text-klein text-schlick-2">{antwort}</p>
            {verweis && (
              <p className="mt-1 sm:mt-2">
                <RentalTermsMoreLink href={verweis.href} thema={verweis.thema} />
              </p>
            )}
          </details>
        ))}
      </div>

      <div className="mt-10 rounded-card border border-linie bg-muschel p-6">
        <p className="text-body font-medium text-schlick">Ihre Frage war nicht dabei?</p>
        <p className="mt-1 text-klein text-schlick-2">
          Schreiben Sie sie einfach in Ihre Anfrage oder an kontakt@norddeich-heuler.de.
        </p>
        <Link
          href="/#anfrage"
          className="mt-5 flex h-13 items-center justify-center rounded-pille bg-priel px-8 text-base font-semibold text-muschel hover:bg-priel-tief sm:inline-flex"
        >
          Freie Termine prüfen
        </Link>
      </div>
    </section>
  );
}
