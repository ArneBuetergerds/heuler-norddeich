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
    <header className="bg-zinc-900 text-white">
      <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-6 py-3.5">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-extrabold">Heuler</span>
          <span className="text-xs font-medium text-zinc-400">Admin-Bereich</span>
        </div>

        {loggedIn && (
          <nav className="flex items-center gap-1">
            {ADMIN_NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "font-semibold text-zinc-50"
                      : "font-medium text-zinc-400 hover:text-zinc-200",
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
            className="rounded-md border border-zinc-700 px-3.5 py-2 text-[13px] text-zinc-200 transition-colors hover:bg-zinc-800"
          >
            Zur Website
          </Link>
          {loggedIn && (
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="cursor-pointer rounded-md bg-zinc-700 px-3.5 py-2 text-[13px] text-white transition-colors hover:bg-zinc-600"
            >
              Abmelden
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
