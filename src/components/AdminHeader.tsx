"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

const ADMIN_NAV = [
  { href: "/admin", label: "Anfragen" },
  { href: "/admin/sperrzeitraeume", label: "Sperrzeiträume" },
] as const;

/**
 * Der Admin-Bereich trägt bewusst einen dunklen Rahmen: er soll sich auf einen
 * Blick von der öffentlichen Seite unterscheiden.
 */
export function AdminHeader({ loggedIn }: { loggedIn: boolean }) {
  const pathname = usePathname();

  return (
    <header className="bg-schlick text-muschel">
      {/* Mobil zweizeilig: Logo und Knöpfe oben, Navigation darunter. In eine
          Zeile passt das auf 390px nicht. */}
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 sm:py-3.5">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-xl leading-none">Heuler</span>
          <span className="text-mikro font-medium text-duenengras">Admin-Bereich</span>
        </div>

        {loggedIn && (
          <nav className="order-last -mx-3 flex w-full items-center gap-1 sm:order-none sm:mx-0 sm:w-auto">
            {ADMIN_NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center rounded-md px-3 text-sm transition-colors sm:min-h-0 sm:py-2",
                    active
                      ? "font-semibold text-muschel"
                      : "font-medium text-track hover:text-muschel",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="hidden rounded-pille border border-muschel/30 px-4 py-2 text-mikro text-track transition-colors hover:bg-muschel/10 sm:inline-block"
          >
            Zur Website
          </Link>
          {loggedIn && (
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="min-h-11 cursor-pointer rounded-pille bg-duenengras px-4 text-mikro font-semibold text-schlick transition-colors hover:opacity-90 sm:min-h-0 sm:py-2"
            >
              Abmelden
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
