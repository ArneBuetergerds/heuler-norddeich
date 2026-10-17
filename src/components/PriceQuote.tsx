import { formatEuro } from "@/lib/format";
import { DEPOSIT_SHARE, minNightsMessage, quoteStay } from "@/lib/pricing";

type Props = {
  startDate: Date;
  endDate: Date;
  guests: number;
  linens: number;
  towels: number;
};

/**
 * Unverbindliche Preisvorschau im Anfrageformular. Wer den Gesamtpreis vor
 * dem Absenden sieht, fragt eher an – und muss nicht erst auf die
 * Eingangsbestätigung warten, um zu erfahren, was der Aufenthalt kostet.
 */
export function PriceQuote({ startDate, endDate, guests, linens, towels }: Props) {
  // Unter dem Mindestaufenthalt gibt es keinen gültigen Preis; der Hinweis
  // dazu steht schon im Datumsfeld.
  if (minNightsMessage(startDate, endDate)) {
    return null;
  }

  const quote = quoteStay(startDate, endDate, { guests, linens, towels });

  return (
    <section
      aria-label="Preisvorschau"
      aria-live="polite"
      className="rounded-card border border-linie bg-sand p-4"
    >
      <p className="text-label font-semibold uppercase text-schlick-2">Ihr Aufenthalt</p>

      <dl className="mt-3 flex flex-col gap-1.5 text-klein text-schlick">
        {quote.breakdown.map((posten) => (
          <Zeile
            key={posten.season.label}
            label={`${posten.nights} ${posten.nights === 1 ? "Nacht" : "Nächte"} × ${posten.pricePerNight} € (${posten.season.name})`}
            betrag={posten.total}
          />
        ))}
        <Zeile label="Endreinigung" betrag={quote.cleaning} />
        <Zeile label="Servicegebühr" betrag={quote.service} />
        {quote.extras > 0 && <Zeile label="Bettwäsche & Handtücher" betrag={quote.extras} />}

        <div className="mt-1.5 flex justify-between gap-4 border-t border-linie pt-2.5 text-body font-semibold">
          <dt>Gesamtpreis</dt>
          <dd className="tabular-nums">{formatEuro(quote.total)}</dd>
        </div>
      </dl>

      <p className="mt-3 text-mikro text-schlick-2">
        Unverbindliche Vorschau. Anzahlung bei Buchung {Math.round(DEPOSIT_SHARE * 100)} % der
        Miete ({formatEuro(quote.deposit)}), Endreinigung, Servicegebühr und Wäsche bar vor Ort.
        Dazu kommt der Gästebeitrag der Stadt Norden, höchstens {formatEuro(quote.guestTaxMax)} bei{" "}
        {guests} {guests === 1 ? "Person" : "Personen"} ab 14 Jahren.
      </p>
    </section>
  );
}

function Zeile({ label, betrag }: { label: string; betrag: number }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd className="shrink-0 tabular-nums">{formatEuro(betrag)}</dd>
    </div>
  );
}
