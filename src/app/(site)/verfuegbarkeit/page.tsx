import { getOccupancy } from "@/db/queries";
import { SEASONS } from "@/lib/pricing";
import { AvailabilityCalendar } from "@/components/AvailabilityCalendar";
import { BookingRequestForm } from "@/components/BookingRequestForm";

// Ohne dynamische API (cookies/headers) würde Next.js diese Seite beim Build
// statisch vorrendern und die Belegung als Snapshot vom Deploy-Zeitpunkt
// einfrieren – Gäste sähen dann veraltete Verfügbarkeit. Zusätzlich ist beim
// Docker-Build (Coolify) noch keine erreichbare DB vorhanden.
export const dynamic = "force-dynamic";

export default async function VerfuegbarkeitPage() {
  // getOccupancy() liefert Gastname/Notiz mit, weil der Admin-Kalender sie
  // braucht – für den öffentlichen Kalender werden beide Listen unten auf
  // {startDate, endDate} zusammengestrichen. Gäste sehen, dass ein Tag belegt
  // ist, nicht durch wen oder warum.
  const occupancy = await getOccupancy();
  const publicOccupancy = {
    stays: occupancy.stays.map(({ startDate, endDate }) => ({ startDate, endDate })),
    maintenance: occupancy.maintenance.map(({ startDate, endDate }) => ({
      startDate,
      endDate,
    })),
  };

  return (
    <section className="mx-auto max-w-[1120px] px-6 pt-14 pb-20">
      <p className="mb-2 text-xs font-bold tracking-[0.06em] text-zinc-500 uppercase">
        Verfügbarkeit &amp; Anfrage
      </p>
      <h1 className="mb-8 text-[32px] leading-tight font-extrabold tracking-[-0.02em]">
        Termin prüfen und anfragen
      </h1>

      <div className="grid items-start gap-8 md:grid-cols-2">
        <AvailabilityCalendar occupancy={publicOccupancy} />
        <BookingRequestForm />
      </div>

      <div className="mt-8 rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="mb-3 text-[17px] font-bold">An- und Abreise</h2>
        <div className="flex gap-8">
          <div>
            <p className="text-[11px] font-bold tracking-[0.06em] text-zinc-400 uppercase">
              Anreise
            </p>
            <p className="text-xl font-extrabold tracking-tight">ab 14 Uhr</p>
          </div>
          <div>
            <p className="text-[11px] font-bold tracking-[0.06em] text-zinc-400 uppercase">
              Abreise
            </p>
            <p className="text-xl font-extrabold tracking-tight">bis 10 Uhr</p>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-[17px] font-bold">Preise</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b text-left text-zinc-500">
                <th className="pb-2 font-semibold">Zeitraum</th>
                <th className="pb-2 font-semibold">Preis/Nacht</th>
                <th className="pb-2 font-semibold">Mindestaufenthalt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {SEASONS.map((season) => (
                <tr key={season.label}>
                  <td className="py-2">{season.label}</td>
                  <td className="py-2 font-semibold">{season.pricePerNight} €</td>
                  <td className="py-2">{season.minNights} Nächte</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-4 border-t pt-4 text-[13px] text-zinc-600 sm:grid-cols-2">
          <div>
            <p className="font-semibold text-zinc-900">
              Einmalige Nebenkosten (bar bei Schlüsselübergabe)
            </p>
            <p>Endreinigung: 55 €</p>
            <p>Servicegebühr: 30 €</p>
          </div>
          <div>
            <p className="font-semibold text-zinc-900">
              Kurtaxe (Gemeindeabgabe, pro Erwachsenem)
            </p>
            <p>Hauptsaison (15.03. – 31.10.): 2,50 €</p>
            <p>Nebensaison (01.01. – 14.03., 01.11. – 31.12.): 1,20 €</p>
            <p className="text-zinc-400">Kinder bis 15 Jahre kostenfrei</p>
          </div>
        </div>

        <p className="mt-4 border-t pt-4 text-[13px] text-zinc-500">
          Bei Buchung werden 30 % des Mietpreises als Anzahlung fällig, der
          Restbetrag spätestens 14 Tage vor Anreise.
        </p>
      </div>

      <div className="mt-6 rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="mb-1 text-[17px] font-bold">Kurkarte</h2>
        <p className="mb-3 text-[13px] text-zinc-500">
          Die Kurtaxe wird von uns eingezogen und an die Stadt Norden
          weitergeleitet. Im Gegenzug erhalten Sie die Kurkarte mit folgenden
          Vorteilen:
        </p>
        <ul className="mb-4 list-disc pl-5 text-[13px] text-zinc-600 marker:text-zinc-400">
          <li>Kostenloser Veranstaltungskalender „Norderland"</li>
          <li>Freier Zugang zum Lesezimmer in Norddeich</li>
          <li>Vergünstigte Busfahrten (2 € pro Strecke, 15.03. – 31.10.)</li>
          <li>Reduzierter Eintritt im Erlebnisbad Ocean Wave</li>
          <li>Ermäßigung bei diversen Veranstaltungen und geführten Touren</li>
        </ul>

        <div className="border-t pt-4 text-[13px] text-zinc-600">
          <p className="font-semibold text-zinc-900">Fragen zur Kurkarte?</p>
          <p>Kurbeitragskasse</p>
          <p>Telefon: (0 49 31) 98 6-2 16</p>
          <p>Fax: (0 49 31) 98 6-92 16</p>
          <p>E-Mail: kurbeitragskasse@norddeich.de</p>
          <p>
            <a
              href="http://www.norddeich.de/service/nordsee-urlaub-planen/kurkarte/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline"
            >
              norddeich.de – Service: Kurkarte
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
