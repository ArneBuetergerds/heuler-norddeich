import Link from "next/link";

const NAV_ITEMS = [
  { href: "/", label: "Start" },
  { href: "/ausstattung", label: "Ausstattung" },
  { href: "/lage", label: "Lage" },
  { href: "/verfuegbarkeit", label: "Verfügbarkeit & Anfrage" },
  { href: "/kontakt", label: "Kontakt" },
];

export function NavBar() {
  return (
    <header className="border-b border-slate-200">
      <nav className="mx-auto flex max-w-5xl items-center justify-between p-4">
        <Link href="/" className="text-lg font-semibold">
          Ferienwohnung Heuler, Norddeich
        </Link>
        <ul className="flex flex-wrap gap-4 text-sm">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="hover:underline">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
