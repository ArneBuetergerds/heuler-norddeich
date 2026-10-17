import Link from "next/link";

const LINKS = [
  { href: "/ausstattung", label: "Ausstattung" },
  { href: "/lage", label: "Lage" },
  { href: "/faq", label: "FAQ" },
  { href: "/kontakt", label: "Kontakt" },
  { href: "/impressum", label: "Impressum" },
  { href: "/datenschutz", label: "Datenschutz" },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-linie px-5 py-sektion-s">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-[22px] leading-none text-schlick">
            Heuler
          </span>
          <span className="whitespace-nowrap text-[10px] font-semibold tracking-[0.14em] text-schlick-2 uppercase">
            Ferienwohnung · Norddeich
          </span>
        </div>

        {/* Anschrift der Wohnung, nicht die der Anbieterin: Letztere steht im
            Impressum und ist dort auch die rechtlich maßgebliche. */}
        <address className="text-klein text-schlick-2 not-italic">
          Ankerweg 6
          <br />
          26506 Norden-Norddeich
        </address>

        <nav aria-label="Weitere Seiten" className="flex flex-wrap gap-x-6 gap-y-2">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-klein text-priel underline-offset-2 hover:underline"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Die Karte auf "Lage" lädt Google Maps – aber nur auf Klick. Der
              frühere Satz "keine externen Dienste" stimmte deshalb nicht ganz. */}
          <p className="text-mikro text-schlick-2">
            Keine Cookies, kein Tracking. Die Karte lädt erst auf Klick.
          </p>
        </div>
      </div>
    </footer>
  );
}
