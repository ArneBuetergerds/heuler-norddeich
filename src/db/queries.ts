import { db } from "./client";
import { blockedPeriod, type BlockedPeriod } from "./schema";

export async function getBlockedPeriods(): Promise<BlockedPeriod[]> {
  return db.select().from(blockedPeriod);
}
