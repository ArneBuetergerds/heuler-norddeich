"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Start" },
  { href: "/ausstattung", label: "Ausstattung" },
  { href: "/lage", label: "Lage" },
  { href: "/faq", label: "FAQ" },
  { href: "/kontakt", label: "Kontakt" },
] as const;

// Start liegt auf "/" und wäre bei startsWith auf jeder Unterseite aktiv.
function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function NavBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Escape und ein Tipp außerhalb schließen das Menü – so erwartet man es von
  // jedem Ausklappmenü. Bei Escape kehrt der Fokus zum Menüknopf zurück, sonst
  // stünde er für Tastaturnutzer auf einem verschwundenen Element.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointerDown(event: PointerEvent): void {
      if (!headerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <header ref={headerRef} className="sticky top-0 z-50 border-b border-linie bg-muschel">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex flex-col gap-0.5">
          <span className="font-display text-[23px] leading-none text-schlick">
            Heuler
          </span>
          <span className="whitespace-nowrap text-[10px] font-semibold tracking-[0.14em] text-schlick-2 uppercase">
            Ferienwohnung · Norddeich
          </span>
        </Link>

        <nav aria-label="Hauptnavigation" className="hidden items-center gap-8 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={cn(
                "text-klein transition-colors hover:text-priel",
                isActive(pathname, item.href)
                  ? "font-medium text-priel"
                  : "text-schlick",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? "Menü schließen" : "Menü öffnen"}
            aria-expanded={open}
            aria-controls="mobilmenue"
            className="grid size-11 place-items-center text-schlick md:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <Link
            href="/#anfrage"
            className="flex h-11 items-center rounded-pille bg-priel px-5 text-sm font-semibold text-muschel transition-colors hover:bg-priel-tief"
          >
            Anfragen
          </Link>
        </div>
      </div>

      {/* Ausklappmenü statt Overlay: Es schiebt den Inhalt nach unten, sperrt
          also weder Scrollen noch Fokus – bei fünf Einträgen wäre ein
          Vollbild-Overlay unverhältnismäßig. */}
      {open && (
        <nav
          id="mobilmenue"
          aria-label="Hauptnavigation"
          className="border-t border-linie bg-muschel md:hidden"
        >
          <ul className="mx-auto flex max-w-6xl flex-col px-5 py-2">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  className={cn(
                    "block border-b border-linie py-3.5 text-body last:border-0",
                    isActive(pathname, item.href)
                      ? "font-medium text-priel"
                      : "text-schlick",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
