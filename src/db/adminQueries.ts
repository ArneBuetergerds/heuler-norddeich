import { eq, type SQL } from "drizzle-orm";
import { bookingRequest, blockedPeriod } from "./schema";

type DbLike = {
  query: {
    bookingRequest: {
      findFirst: (args: { where: SQL<unknown> }) => Promise<
        { id: number; startDate: Date; endDate: Date } | undefined
      >;
    };
  };
  insert: typeof import("./client").db.insert;
  update: typeof import("./client").db.update;
};

export async function confirmBookingRequest(db: DbLike, id: number): Promise<void> {
  const request = await db.query.bookingRequest.findFirst({
    where: eq(bookingRequest.id, id),
  });
  if (!request) {
    throw new Error(`Buchungsanfrage ${id} nicht gefunden`);
  }

  await db
    .insert(blockedPeriod)
    .values({
      startDate: request.startDate,
      endDate: request.endDate,
      note: `Bestätigte Anfrage #${request.id}`,
    })
    .returning();

  await db
    .update(bookingRequest)
    .set({ status: "confirmed" })
    .where(eq(bookingRequest.id, id));
}

export async function declineBookingRequest(db: DbLike, id: number): Promise<void> {
  await db
    .update(bookingRequest)
    .set({ status: "declined" })
    .where(eq(bookingRequest.id, id));
}
