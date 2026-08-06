import Link from "next/link";

type ContactEntry = {
  readonly label: string;
  readonly value: string;
};

// Telefonnummer noch als Platzhalter, bis sie vorliegt.
const CONTACT_ENTRIES: readonly ContactEntry[] = [
  { label: "Ansprechpartner", value: "Sabrina Rönne" },
  { label: "Telefon", value: "[Telefonnummer]" },
  { label: "E-Mail", value: "kontakt@norddeich-heuler.de" },
];

export default function KontaktPage() {
  return (
    <section className="mx-auto max-w-[640px] px-6 pt-14 pb-20">
      <p className="mb-2 text-xs font-bold tracking-wider text-muted-foreground uppercase">
        Kontakt
      </p>
      <h1 className="mb-6 text-[32px] font-extrabold tracking-tight">
        Sprechen Sie uns an
      </h1>

      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-7">
        {CONTACT_ENTRIES.map((entry) => (
          <div key={entry.label}>
            <p className="mb-[3px] text-xs font-semibold tracking-wide text-zinc-400 uppercase">
              {entry.label}
            </p>
            <p className="text-[15px]">{entry.value}</p>
          </div>
        ))}
      </div>

      <p className="mt-5 text-[13px] text-muted-foreground">
        Für eine konkrete Terminanfrage nutzen Sie bitte direkt das
        Anfrageformular unter{" "}
        <Link href="/verfuegbarkeit" className="font-semibold hover:underline">
          Verfügbarkeit &amp; Anfrage
        </Link>
        .
      </p>
    </section>
  );
}
