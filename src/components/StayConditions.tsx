import { formatEuro } from "@/lib/format";
import { CANCELLATION_ANCHOR, rentalTermsHref } from "@/lib/rentalTerms";
import { RentalTermsMoreLink } from "./RentalTermsMoreLink";
import {
  CANCELLATION_NOTES,
  CANCELLATION_TIERS,
  CHECK_IN_TIME,
  CHECK_OUT_TIME,
  DEPOSIT_DUE_DAYS,
} from "@/lib/terms";
import {
  BALANCE_DUE_DAYS,
  CLEANING_FEE,
  DEPOSIT_SHARE,
  EXTRAS,
  EXTRAS_LEAD_DAYS,
  GUEST_TAX,
  GUEST_TAX_SEASON_LABELS,
  GUEST_TAX_SEASON_NAMES,
  SEASONS,
  SERVICE_FEE,
  quoteStay,
} from "@/lib/pricing";

const NEBENKOSTEN = [
  { posten: "Endreinigung", betrag: `${CLEANING_FEE} €` },
  { posten: "Servicegebühr", betrag: `${SERVICE_FEE} €` },
] as const;

/**
 * Gesamtpreis-Beispiele. Die Saisons wiederholen sich jährlich, das Jahr der
 * Beispieldaten ist deshalb beliebig; gerechnet wird mit denselben Funktionen
 * wie in der Preisvorschau des Formulars. Ohne Gästebeitrag („zzgl.“), weil er
 * vom Alter der Gäste abhängt: Seit BDS-006 enthält `quote.total` ihn, er wird
 * hier wieder abgezogen.
 */
const BEISPIELE = [
  { titel: "1 Woche Hauptsaison", start: "2027-07-10", ende: "2027-07-17" },
  { titel: "4 Nächte im Frühling", start: "2027-05-03", ende: "2027-05-07" },
  { titel: "3 Nächte Nebensaison", start: "2027-02-01", ende: "2027-02-04" },
].map(({ titel, start, ende }) => ({
  titel,
  total: ohneGaestebeitrag(
    quoteStay(new Date(start), new Date(ende), { guests: 4, linens: 0, towels: 0 }),
  ),
}));

function ohneGaestebeitrag(quote: { total: number; guestTax: number }): number {
  return Math.round((quote.total - quote.guestTax) * 100) / 100;
}

const KURKARTE_VORTEILE = [
  "Kostenloser Veranstaltungskalender „Norderland“",
  "Freier Zugang zum Lesezimmer in Norddeich",
  "Vergünstigte Busfahrten (2 € pro Strecke, 15.03. – 31.10.)",
  "Reduzierter Eintritt im Erlebnisbad Ocean Wave",
  "Ermäßigung bei diversen Veranstaltungen und geführten Touren",
] as const;

/** An- und Abreisezeiten als zwei gleichrangige Karten. */
export function ArrivalTimes() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[
        { was: "Anreise", wann: `ab ${CHECK_IN_TIME}` },
        { was: "Abreise", wann: `bis ${CHECK_OUT_TIME}` },
      ].map(({ was, wann }) => (
        <div key={was} className="rounded-card border border-linie bg-muschel p-5">
          <p className="text-label font-semibold uppercase text-schlick-2">{was}</p>
          <p className="mt-1.5 font-display text-[34px] leading-none text-schlick">
            {wann}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * Preistabelle. Der Mindestaufenthalt steht pro Saison, nicht als eine Zahl
 * über der Tabelle – er reicht bei uns von drei bis sieben Nächten.
 */
export function PriceTable() {
  return (
    <>
      <table className="w-full border-collapse">
        <caption className="sr-only">
          Übernachtungspreise und Mindestaufenthalt nach Saison
        </caption>
        <thead className="hidden md:table-header-group">
          <tr>
            <th className="pb-3 text-left text-label font-semibold uppercase text-schlick-2">
              Saison
            </th>
            <th className="pb-3 text-left text-label font-semibold uppercase text-schlick-2">
              Zeitraum
            </th>
            <th className="pb-3 text-left text-label font-semibold uppercase text-schlick-2">
              Mindestens
            </th>
            <th className="pb-3 text-right text-label font-semibold uppercase text-schlick-2">
              pro Nacht
            </th>
          </tr>
        </thead>
        <tbody>
          {SEASONS.map((season) => (
            // Mobil als Zeile mit gestapelter linker Spalte, ab Tablet echte
            // Tabellenzeile – so scrollt nichts quer.
            <tr
              key={season.label}
              className="flex items-baseline justify-between gap-4 border-t border-linie py-4 md:table-row md:py-0"
            >
              <th
                scope="row"
                className="text-left text-klein font-medium text-schlick md:border-t md:border-linie md:py-4 md:align-baseline md:text-body"
              >
                {season.name}
                <span className="mt-1 block text-mikro font-normal text-schlick-2 md:hidden">
                  {season.label} · ab {season.minNights} Nächte
                </span>
              </th>
              <td className="hidden text-klein text-schlick-2 md:table-cell md:border-t md:border-linie md:py-4 md:align-baseline">
                {season.label}
              </td>
              <td className="hidden text-klein text-schlick-2 md:table-cell md:border-t md:border-linie md:py-4 md:align-baseline">
                {season.minNights} Nächte
              </td>
              <td className="text-right md:border-t md:border-linie md:py-4 md:align-baseline">
                <span className="font-display text-2xl whitespace-nowrap text-schlick tabular-nums">
                  {season.pricePerNight} €
                </span>
                <span className="mt-0.5 block text-mikro text-schlick-2 md:hidden">
                  pro Nacht
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6">
        <p className="text-label font-semibold uppercase text-schlick-2">
          Beispiele Gesamtpreis, inkl. Endreinigung und Servicegebühr
        </p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-3">
          {BEISPIELE.map(({ titel, total }) => (
            <li
              key={titel}
              className="flex items-baseline justify-between gap-4 rounded-card border border-linie bg-sand px-4 py-3 sm:block sm:p-4"
            >
              <p className="text-klein text-schlick-2">{titel}</p>
              <p className="font-display text-2xl text-schlick tabular-nums sm:mt-1">
                {formatEuro(total)}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-mikro text-schlick-2">
          Für bis zu 4 Personen, zzgl. Gästebeitrag. Ihren genauen Preis sehen Sie
          im Anfrageformular, sobald Sie einen Zeitraum wählen.
        </p>
      </div>

      {/* Bewusst abgesetzt: Diese Posten fallen einmalig an, nicht pro Nacht.
          Das ist die häufigste Rückfrage. */}
      <div className="mt-6 rounded-card bg-priel-hell p-5">
        <p className="text-label font-semibold uppercase text-priel-tief">
          Einmalig dazu, bar bei der Schlüsselübergabe
        </p>
        <dl className="mt-3 grid gap-2.5 sm:grid-cols-2 sm:gap-x-8">
          {NEBENKOSTEN.map(({ posten, betrag }) => (
            <div key={posten} className="flex justify-between gap-4 text-klein text-schlick">
              <dt>{posten}</dt>
              <dd className="font-medium tabular-nums">{betrag}</dd>
            </div>
          ))}
          {(["linens", "towels"] as const).map((key) => (
            <div
              key={key}
              className="flex justify-between gap-4 text-klein text-schlick"
            >
              <dt>{EXTRAS[key].label} je Person</dt>
              <dd className="font-medium tabular-nums">
                {EXTRAS[key].pricePerSet} €
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-4 border-t border-priel/20 pt-3 text-mikro text-priel-tief">
          Bettwäsche und Handtücher bitte spätestens {EXTRAS_LEAD_DAYS} Tage vor
          Anreise mitbestellen – direkt im Anfrageformular.
        </p>
      </div>

      {/* Seit BDS-006 nicht mehr bar: Der Gästebeitrag steht auf der Rechnung
          und zählt zur Anzahlung. Aufbau wie der Bar-Block darüber, aber auf
          heller Fläche mit Rahmen – so sind die beiden Zahlungswege auf einen
          Blick verschieden. Was die Gästekarte bringt, steht weiter unten
          (`KurkarteInfo`), hier nur Sätze und Bezahlung. */}
      <div className="mt-4 rounded-card border border-linie bg-sand p-5">
        <p className="text-label font-semibold uppercase text-schlick-2">
          Gästebeitrag der Stadt Norden, mit der Rechnung
        </p>
        <p className="mt-1.5 text-mikro text-schlick-2">
          Je Person ab 14 Jahren und Nacht. Kinder bis einschließlich 13 Jahre zahlen
          keinen Gästebeitrag.
        </p>
        <dl className="mt-3 grid gap-2.5 sm:grid-cols-2 sm:gap-x-8">
          {(["main", "off"] as const).map((saison) => (
            <div key={saison} className="flex justify-between gap-4 text-klein text-schlick">
              <dt>
                {GUEST_TAX_SEASON_NAMES[saison]}
                <span className="block text-mikro text-schlick-2">
                  {GUEST_TAX_SEASON_LABELS[saison]}
                </span>
              </dt>
              <dd className="font-medium tabular-nums">{formatEuro(GUEST_TAX[saison])}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 border-t border-linie pt-3 text-mikro text-schlick-2">
          Steht als eigener Posten auf der Rechnung und zählt zur Anzahlung; wir
          leiten ihn an die Stadt Norden weiter. Wie Haupt- und Nebensaison
          gerechnet werden, erklärt die Stadt Norden:{" "}
          <a
            href="https://www.norddeich.de/vermieterportal/informationen/faq-gaestebeitrag"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-schlick underline underline-offset-2 hover:no-underline"
          >
            Fragen und Antworten zum Gästebeitrag
            <span className="sr-only"> (öffnet in neuem Tab)</span>
          </a>
          .
        </p>
      </div>

      <p className="mt-5 text-klein text-schlick-2">
        Nach der Buchungsbestätigung überweisen Sie innerhalb von {DEPOSIT_DUE_DAYS} Tagen{" "}
        {Math.round(DEPOSIT_SHARE * 100)} % des Rechnungsbetrags (Mietpreis und Gästebeitrag)
        als Anzahlung, den Restbetrag
        spätestens {BALANCE_DUE_DAYS} Tage vor Anreise.
      </p>

      <CancellationTerms />
    </>
  );
}

/** Kurkarte: was sie bringt und wer dafür zuständig ist. */
export function KurkarteInfo() {
  return (
    <>
      <p className="mt-4 text-body text-priel-tief">
        Für den Gästebeitrag erhalten Sie bei der Schlüsselübergabe die
        Nordsee-ServiceCard, die Gästekarte für Norden-Norddeich. Was er kostet
        und wie Sie ihn bezahlen, steht bei den{" "}
        <a href="#preise" className="font-medium underline underline-offset-2 hover:no-underline">
          Preisen
        </a>
        .
      </p>
      <ul className="mt-5 flex flex-col gap-3">
        {KURKARTE_VORTEILE.map((vorteil) => (
          <li key={vorteil} className="flex items-start gap-3">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-1.5 shrink-0 text-priel-tief"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <span className="text-body text-schlick">{vorteil}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 rounded-card bg-muschel p-5">
        <p className="text-label font-semibold uppercase text-schlick-2">
          Fragen zum Gästebeitrag
        </p>
        <p className="mt-2 text-body font-medium text-schlick">Gästebeitragskasse</p>
        <p className="mt-1 text-klein text-schlick-2">
          Telefon: (0 49 31) 98 6-2 16
          <br />
          E-Mail: kurbeitragskasse@norddeich.de
        </p>
        <p className="mt-2">
          <a
            href="https://www.norddeich.de/service/nordsee-urlaub-planen/nordsee-service-card-ostfriesland/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-klein font-medium text-priel underline-offset-2 hover:underline"
          >
            norddeich.de – Nordsee-ServiceCard
          </a>
        </p>
      </div>
    </>
  );
}

/**
 * Stornobedingungen, mit eigenem Anker `#storno` auf der Startseite. Formular
 * und FAQ verlinken seit BDS-005 auf den Storno-Abschnitt der Mietbedingungen
 * (/mietbedingungen#storno); dieser Block verweist ebenfalls dorthin.
 */
export function CancellationTerms() {
  return (
    <div id="storno" className="mt-6 scroll-mt-24 rounded-card border border-linie bg-sand p-5">
      <h3 className="text-label font-semibold uppercase text-schlick-2">Stornobedingungen</h3>
      <dl className="mt-3 flex flex-col gap-2.5">
        {CANCELLATION_TIERS.map((tier) => (
          <div
            key={tier.label}
            className="flex flex-col gap-0.5 text-klein text-schlick sm:flex-row sm:justify-between sm:gap-4"
          >
            <dt>{tier.label}</dt>
            <dd className="font-medium sm:text-right">{tier.cost}</dd>
          </div>
        ))}
      </dl>
      <ul className="mt-4 flex flex-col gap-1 border-t border-linie pt-3 text-mikro text-schlick-2">
        {CANCELLATION_NOTES.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      {/* Neuer Tab: Diese Box steht in der Preistabelle der Startseite, auf
          der auch das Anfrageformular liegt – ein Sprung im selben Tab ließe
          dort begonnene Eingaben verloren gehen. */}
      <p className="mt-3">
        <RentalTermsMoreLink
          href={rentalTermsHref(CANCELLATION_ANCHOR)}
          thema="Stornierung"
          target="_blank"
          rel="noopener"
        />
      </p>
    </div>
  );
}
