import Link from "next/link";

const PAGE_LINKS = [
  { href: "/ausstattung", label: "Ausstattung" },
  { href: "/lage", label: "Lage" },
  { href: "/verfuegbarkeit", label: "Verfügbarkeit" },
  { href: "/kontakt", label: "Kontakt" },
] as const;

const LEGAL_LINKS = [
  { href: "/impressum", label: "Impressum" },
  { href: "/datenschutz", label: "Datenschutz" },
] as const;

const HEADING_CLASS =
  "mb-2.5 text-xs font-bold tracking-wide text-zinc-400 uppercase";
const LINK_CLASS = "text-[13px] hover:underline";

export function Footer() {
  return (
    <footer className="border-t border-border bg-white">
      <div className="mx-auto grid max-w-[1120px] grid-cols-1 gap-8 px-6 py-10 sm:grid-cols-[2fr_1fr_1fr]">
        <div>
          <p className="mb-2 text-base font-extrabold">Heuler</p>
          <p className="max-w-[280px] text-[13px] text-muted-foreground">
            Ferienwohnung in Norddeich, nahe der Seehundstation.
          </p>
        </div>

        <div>
          <p className={HEADING_CLASS}>Seiten</p>
          <div className="flex flex-col gap-2">
            {PAGE_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={LINK_CLASS}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <p className={HEADING_CLASS}>Rechtliches</p>
          <div className="flex flex-col gap-2">
            {LEGAL_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={LINK_CLASS}>
                {link.label}
              </Link>
            ))}
            <Link
              href="/admin/login"
              className="text-[13px] text-zinc-400 hover:underline"
            >
              Admin-Login
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
