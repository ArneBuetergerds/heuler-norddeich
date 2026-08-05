import { getBlockedPeriods } from "@/db/queries";
import { AvailabilityCalendar } from "@/components/AvailabilityCalendar";
import { BookingRequestForm } from "@/components/BookingRequestForm";

// Ohne dynamische API (cookies/headers) würde Next.js diese Seite beim Build
// statisch vorrendern und die Belegung als Snapshot vom Deploy-Zeitpunkt
// einfrieren – Gäste sähen dann veraltete Verfügbarkeit. Zusätzlich ist beim
// Docker-Build (Coolify) noch keine erreichbare DB vorhanden.
export const dynamic = "force-dynamic";

export default async function VerfuegbarkeitPage() {
  // Bewusst nur die Zeiträume, nicht Notiz oder Gastname: Gäste sehen, dass ein
  // Tag belegt ist – nicht durch wen oder warum.
  const blockedPeriods = await getBlockedPeriods();

  return (
    <section className="mx-auto max-w-[1120px] px-6 pt-14 pb-20">
      <p className="mb-2 text-xs font-bold tracking-[0.06em] text-zinc-500 uppercase">
        Verfügbarkeit &amp; Anfrage
      </p>
      <h1 className="mb-8 text-[32px] leading-tight font-extrabold tracking-[-0.02em]">
        Termin prüfen und anfragen
      </h1>

      <div className="grid items-start gap-8 md:grid-cols-2">
        <AvailabilityCalendar
          blockedPeriods={blockedPeriods.map((period) => ({
            startDate: period.startDate,
            endDate: period.endDate,
          }))}
        />
        <BookingRequestForm />
      </div>

      <div className="mt-8 rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="mb-1 text-[17px] font-bold">Preise</h2>
        <p className="text-[13px] text-zinc-500">
          [Preisinformationen des Betreibers ergänzen, z. B. Preis pro Nacht,
          Nebenkosten, Mindestaufenthaltsdauer.]
        </p>
      </div>
    </section>
  );
}
