/**
 * Einträge mit Kalendertag (`date`, UTC-Mitternacht wie die `date`-Spalten)
 * nach Tag gruppieren, z. B. die anstehenden Löschungen auf der Seite
 * „Löschfristen“. Reine Funktion ohne Datenbank.
 */

export type DayGroup<T> = {
  /** Kalendertag der Gruppe, UTC-Mitternacht. */
  date: Date;
  /** Ob die Gruppe auf `today` fällt – die Oberfläche hebt sie hervor. */
  isToday: boolean;
  entries: T[];
};

/** Tagesschlüssel unabhängig von der Uhrzeit, nach UTC. */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Gruppen in aufsteigender Tagesfolge; innerhalb eines Tages bleibt die
 * Reihenfolge der Eingabe erhalten. Leere Eingabe ergibt keine Gruppen.
 */
export function groupByDay<T extends { date: Date }>(entries: T[], today: Date): DayGroup<T>[] {
  const todayKey = dayKey(today);
  const groups = new Map<string, DayGroup<T>>();

  for (const entry of entries) {
    const key = dayKey(entry.date);
    let group = groups.get(key);
    if (!group) {
      group = {
        date: new Date(`${key}T00:00:00Z`),
        isToday: key === todayKey,
        entries: [],
      };
      groups.set(key, group);
    }
    group.entries.push(entry);
  }

  return [...groups.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}
