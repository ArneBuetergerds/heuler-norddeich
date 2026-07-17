"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Start" },
  { href: "/ausstattung", label: "Ausstattung" },
  { href: "/lage", label: "Lage" },
  { href: "/verfuegbarkeit", label: "Verfügbarkeit" },
  { href: "/kontakt", label: "Kontakt" },
] as const;

// Start liegt auf "/" und wäre bei startsWith auf jeder Unterseite aktiv.
function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function NavBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-zinc-50/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-4 px-6 py-3.5">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-extrabold tracking-tight">Heuler</span>
          <span className="text-xs font-medium text-muted-foreground">
            Ferienwohnung · Norddeich
          </span>
        </Link>

        <nav className="flex flex-wrap items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
                isActive(pathname, item.href)
                  ? "bg-zinc-100 text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-900",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Button asChild size="lg" className="whitespace-nowrap">
          <Link href="/verfuegbarkeit">Jetzt anfragen</Link>
        </Button>
      </div>
    </header>
  );
}
