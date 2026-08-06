import { getOccupancy } from "@/db/queries";
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

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="mb-1 text-[17px] font-bold">Preise</h2>
          <p className="text-[13px] text-zinc-500">
            [Preisinformationen des Betreibers ergänzen, z. B. Preis pro Nacht,
            Nebenkosten, Mindestaufenthaltsdauer.]
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
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
      </div>
    </section>
  );
}
