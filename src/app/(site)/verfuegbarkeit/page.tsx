import { getBlockedPeriods } from "@/db/queries";
import { AvailabilityCalendar } from "@/components/AvailabilityCalendar";
import { BookingRequestForm } from "@/components/BookingRequestForm";

export default async function VerfuegbarkeitPage() {
  const blockedPeriods = await getBlockedPeriods();

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-bold">Verfügbarkeit</h1>
        <AvailabilityCalendar
          blockedPeriods={blockedPeriods.map((p) => ({
            startDate: p.startDate,
            endDate: p.endDate,
          }))}
        />
      </section>
      <section>
        <h2 className="text-2xl font-semibold">Preise</h2>
        <p>[Preisinformationen des Betreibers ergänzen, z. B. Preis pro Nacht,
          Nebenkosten, Mindestaufenthaltsdauer.]</p>
      </section>
      <section>
        <h2 className="text-2xl font-semibold">Anfrage senden</h2>
        <BookingRequestForm />
      </section>
    </div>
  );
}
