import Link from "next/link";
import { pageMetadata } from "@/lib/site";

type ContactEntry = {
  readonly label: string;
  readonly value: string;
};

const CONTACT_ENTRIES: readonly ContactEntry[] = [
  { label: "Ansprechpartner", value: "Sabrina Rönne" },
  { label: "E-Mail", value: "kontakt@norddeich-heuler.de" },
];

export const metadata = pageMetadata({
  title: "Kontakt",
  description:
    "Fragen zur Ferienwohnung Heuler in Norddeich? So erreichen Sie uns direkt – ohne Agentur.",
  path: "/kontakt",
});

export default function KontaktPage() {
  return (
    <section className="mx-auto max-w-2xl px-5 py-sektion-m md:py-sektion-l">
      <p className="text-label font-semibold uppercase text-priel">Kontakt</p>
      <h1 className="mt-4 text-h1 text-schlick">Sprechen Sie uns an</h1>

      <dl className="mt-8 flex flex-col gap-5 rounded-card border border-linie bg-muschel p-6">
        {CONTACT_ENTRIES.map((entry) => (
          <div key={entry.label}>
            <dt className="text-label font-semibold uppercase text-schlick-2">
              {entry.label}
            </dt>
            <dd className="mt-1 text-body text-schlick">
              {entry.value.includes("@") ? (
                <a
                  href={`mailto:${entry.value}`}
                  className="underline underline-offset-2 hover:no-underline"
                >
                  {entry.value}
                </a>
              ) : (
                entry.value
              )}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-6 text-klein text-schlick-2">
        Für eine konkrete Terminanfrage nutzen Sie bitte direkt das
        Anfrageformular unter{" "}
        <Link
          href="/#anfrage"
          className="font-medium text-priel underline-offset-2 hover:underline"
        >
          Verfügbarkeit &amp; Anfrage
        </Link>
        .
      </p>
    </section>
  );
}
