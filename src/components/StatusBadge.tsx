import { cn } from "@/lib/utils";

/**
 * "conflict" ist kein gespeicherter Status, sondern wird aus dem aktuellen
 * Belegungsstand abgeleitet (siehe lib/occupancy.ts) – deshalb steht er hier
 * gleichberechtigt neben den Enum-Werten der Datenbank.
 */
export type BadgeStatus = "pending" | "confirmed" | "declined" | "conflict";

const BADGES: Record<BadgeStatus, { label: string; className: string }> = {
  confirmed: {
    label: "Bestätigt",
    className: "bg-green-50 text-green-800 border-green-200",
  },
  declined: {
    label: "Abgelehnt",
    className: "bg-zinc-100 text-zinc-600 border-zinc-200",
  },
  conflict: {
    label: "Konflikt",
    className: "bg-red-50 text-red-700 border-red-200",
  },
  pending: {
    label: "Ausstehend",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
};

export function StatusBadge({ status }: { status: BadgeStatus }) {
  const { label, className } = BADGES[status];

  return (
    <span
      className={cn(
        "inline-block rounded-full border px-2.5 py-[3px] text-[11px] font-bold whitespace-nowrap",
        className,
      )}
    >
      {label}
    </span>
  );
}
