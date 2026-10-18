import { useId, type ReactNode } from "react";
import { formatEuro } from "@/lib/format";
import { BALANCE_DUE_DAYS, DEPOSIT_SHARE, minNightsMessage, quoteStay } from "@/lib/pricing";
import { guestTaxLineLabel, paymentOverview } from "@/lib/quoteView";
import { DEPOSIT_DUE_DAYS } from "@/lib/terms";
import { cn } from "@/lib/utils";

type Props = {
  startDate: Date;
  endDate: Date;
  guests: number;
  guestsUnder14: number;
  linens: number;
  towels: number;
};

/**
 * Unverbindliche Preisvorschau im Anfrageformular. Wer den Gesamtpreis vor
 * dem Absenden sieht, fragt eher an – und muss nicht erst auf die
 * Eingangsbestätigung warten, um zu erfahren, was der Aufenthalt kostet.
 *
 * Gegliedert nach Zahlungsweg (BDS-006): Mietpreis und Gästebeitrag stehen auf
 * der Rechnung und werden in Anzahlung und Rest überwiesen; Endreinigung,
 * Servicegebühr und Wäsche werden bar bei der Schlüsselübergabe bezahlt. Der
 * Bar-Block hat dieselbe Fläche wie der Bar-Block in der Preistabelle der
 * Startseite.
 */
export function PriceQuote({ startDate, endDate, guests, guestsUnder14, linens, towels }: Props) {
  const id = useId();

  // Unter dem Mindestaufenthalt gibt es keinen gültigen Preis; der Hinweis
  // dazu steht schon im Datumsfeld.
  if (minNightsMessage(startDate, endDate)) {
    return null;
  }

  const quote = quoteStay(startDate, endDate, { guests, guestsUnder14, linens, towels });
  const { transfer, onSite } = paymentOverview(quote);

  return (
    <section
      aria-label="Preisvorschau"
      aria-live="polite"
      className="flex flex-col gap-4 rounded-card border border-linie bg-sand p-4"
    >
      <p className="text-label font-semibold uppercase text-schlick-2">Ihr Aufenthalt</p>

      {/* Überweisung: alles, was auf der Rechnung steht. */}
      <div className="flex flex-col gap-2">
        <p id={`${id}-rechnung`} className="text-label font-semibold uppercase text-schlick-2">
          Überweisen, laut Rechnung
        </p>
        <div
          role="group"
          aria-labelledby={`${id}-rechnung`}
          className="flex flex-col gap-3 rounded-sm border border-linie bg-muschel p-3"
        >
          <dl aria-label="Miete" className="flex flex-col gap-1.5 text-klein text-schlick">
            {quote.breakdown.map((posten) => (
              <Zeile
                key={posten.season.label}
                label={`${posten.nights} ${posten.nights === 1 ? "Nacht" : "Nächte"} × ${posten.pricePerNight} € (${posten.season.name})`}
                betrag={posten.total}
              />
            ))}
          </dl>

          <div className="flex flex-col gap-1.5">
            <p id={`${id}-gaestebeitrag`} className="text-mikro font-semibold text-schlick-2">
              Gästebeitrag der Stadt Norden
            </p>
            <dl
              aria-labelledby={`${id}-gaestebeitrag`}
              className="flex flex-col gap-1.5 text-klein text-schlick"
            >
              {quote.guestTaxLines.map((posten) => (
                <Zeile key={posten.season} label={guestTaxLineLabel(posten)} betrag={posten.total} />
              ))}
            </dl>
          </div>

          <dl className="flex flex-col gap-1.5 border-t border-linie pt-2.5 text-klein text-schlick">
            <Zeile
              label="Mietpreis und Gästebeitrag"
              betrag={transfer.total}
              className="font-semibold"
            />
            <Zeile
              label={`Anzahlung ${Math.round(DEPOSIT_SHARE * 100)} %`}
              hinweis={`innerhalb von ${DEPOSIT_DUE_DAYS} Tagen nach der Bestätigung`}
              betrag={transfer.deposit}
            />
            <Zeile
              label="Restbetrag"
              hinweis={`bis ${BALANCE_DUE_DAYS} Tage vor Anreise`}
              betrag={transfer.balance}
            />
          </dl>
        </div>
      </div>

      {/* Bar vor Ort: wie „Einmalig dazu, bar bei der Schlüsselübergabe“ auf
          der Startseite. */}
      <div className="flex flex-col gap-2">
        <p id={`${id}-bar`} className="text-label font-semibold uppercase text-priel-tief">
          Bar bei der Schlüsselübergabe
        </p>
        <dl
          aria-labelledby={`${id}-bar`}
          className="flex flex-col gap-1.5 rounded-sm bg-priel-hell p-3 text-klein text-schlick"
        >
          {onSite.lines.map((posten) => (
            <Zeile key={posten.label} label={posten.label} betrag={posten.amount} />
          ))}
          <Zeile
            label="Zusammen bar"
            betrag={onSite.total}
            className="mt-1 border-t border-priel/20 pt-2 font-semibold"
          />
        </dl>
      </div>

      <dl className="border-t border-linie pt-3">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-body font-semibold text-schlick">Gesamtpreis</dt>
          <dd className="font-display text-2xl text-schlick tabular-nums">
            {formatEuro(quote.total)}
          </dd>
        </div>
      </dl>

      <p className="text-mikro text-schlick-2">
        Unverbindliche Vorschau. Kinder bis 13 Jahre zahlen keinen Gästebeitrag.
      </p>
    </section>
  );
}

function Zeile({
  label,
  hinweis,
  betrag,
  className,
}: {
  label: ReactNode;
  /** Zweite, kleinere Zeile unter dem Posten, z. B. die Fälligkeit. */
  hinweis?: string;
  betrag: number;
  className?: string;
}) {
  return (
    <div className={cn("flex justify-between gap-4", className)}>
      <dt className="min-w-0">
        {label}
        {hinweis && <span className="block text-mikro text-schlick-2">{hinweis}</span>}
      </dt>
      <dd className="shrink-0 tabular-nums">{formatEuro(betrag)}</dd>
    </div>
  );
}
