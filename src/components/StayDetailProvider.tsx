"use client";

import { createContext, use, useState, type ReactNode } from "react";
import type { BookingRequest } from "@/db/schema";
import type { InvoiceSummary } from "@/db/invoiceQueries";
import type { Stay } from "@/lib/occupancy";
import { StayDetailDialog } from "./StayDetailDialog";

const StayDetailContext = createContext<((stay: Stay) => void) | null>(null);

/**
 * Hält den einen Detaildialog der Belegungsübersicht. Liste und Kalender
 * öffnen ihn beide über `useOpenStayDetail` – so gibt es genau einen Dialog
 * und einen Zustand, egal von wo aus geklickt wird.
 */
export function StayDetailProvider({
  requests,
  invoices,
  children,
}: {
  /**
   * Die Anfragen zu den angezeigten Aufenthalten, vom Server mitgeladen.
   * Daraus wird für die Detailansicht die passende herausgesucht – eine eigene
   * Abfrage bräuchte es dafür nicht.
   */
  requests: BookingRequest[];
  invoices: InvoiceSummary[];
  children: ReactNode;
}) {
  const [detail, setDetail] = useState<Stay | null>(null);

  return (
    <StayDetailContext value={setDetail}>
      {children}
      <StayDetailDialog
        stay={detail}
        request={requests.find((entry) => entry.id === detail?.bookingRequestId)}
        invoice={invoices.find(
          (entry) => entry.bookingRequestId === detail?.bookingRequestId,
        )}
        onOpenChange={(open) => !open && setDetail(null)}
      />
    </StayDetailContext>
  );
}

/** Öffnet den Detaildialog zu einem Aufenthalt. Nur innerhalb von `StayDetailProvider`. */
export function useOpenStayDetail(): (stay: Stay) => void {
  const open = use(StayDetailContext);
  if (!open) {
    throw new Error("useOpenStayDetail braucht einen umgebenden StayDetailProvider.");
  }
  return open;
}
