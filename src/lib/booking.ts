import { rangesOverlap } from "./dateRange";

export function isRangeAvailable(
  blockedPeriods: { startDate: Date; endDate: Date }[],
  start: Date,
  end: Date,
): boolean {
  return !blockedPeriods.some((p) =>
    rangesOverlap(start, end, p.startDate, p.endDate),
  );
}
