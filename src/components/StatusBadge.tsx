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
    className: "bg-priel-hell text-priel-tief border-priel/30",
  },
  declined: {
    label: "Abgelehnt",
    className: "bg-track text-schlick-2 border-linie",
  },
  conflict: {
    label: "Konflikt",
    className: "bg-destructive/5 text-destructive border-destructive/30",
  },
  pending: {
    label: "Ausstehend",
    className: "bg-duenengras/20 text-schlick border-duenengras",
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
