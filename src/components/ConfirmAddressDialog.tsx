"use client";

import { useEffect, useRef, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ADDRESS_LIMITS } from "@/lib/invoice";
import { FELD, Feld, type Fehler } from "./FormFields";

export type ConfirmAddress = {
  street: string;
  postalCode: string;
  city: string;
  country?: string;
};

type Props = {
  /** Für eindeutige Feld-IDs, wenn mehrere Anfragen auf der Seite stehen. */
  requestId: number;
  guestName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  /** Meldung des Servers, `feld` = Name des Anschriftsfelds oder `null`. */
  fehler: Fehler | null;
  onConfirm: (address: ConfirmAddress) => void;
};

type FieldName = keyof typeof ADDRESS_LIMITS;

/**
 * Fragt beim Bestätigen die Rechnungsanschrift ab, wenn die Anfrage keine hat
 * (eingegangen vor dem Pflichtfeld im Formular). Erst mit ihr wird bestätigt:
 * Die Rechnung geht mit der Bestätigungsmail an den Gast.
 *
 * Feldbausteine wie im Eintragen-Formular des Admins (`FormFields`), damit die
 * Felder am Handy dieselben großen Tippziele haben.
 */
export function ConfirmAddressDialog({
  requestId,
  guestName,
  open,
  onOpenChange,
  pending,
  fehler,
  onConfirm,
}: Props) {
  const streetRef = useRef<HTMLInputElement>(null);
  const id = (name: string) => `confirm-${requestId}-${name}`;

  // Meldung des Servers zu einem Feld: dorthin springen, wie in den Formularen.
  useEffect(() => {
    if (fehler?.feld) {
      document.getElementById(`confirm-${requestId}-${fehler.feld}`)?.focus();
    }
  }, [fehler, requestId]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const text = (name: string) => String(formData.get(name) ?? "").trim();
    onConfirm({
      street: text("street"),
      postalCode: text("postalCode"),
      city: text("city"),
      country: text("country") || undefined,
    });
  }

  /** Meldung auf die Feld-ID dieses Dialogs umschreiben, damit `Feld` sie zuordnet. */
  function fehlerFuer(name: FieldName): Fehler | null {
    return fehler?.feld === name ? { feld: id(name), text: fehler.text } : null;
  }

  /** aria-Attribute für ein Eingabefeld, falls die aktuelle Meldung zu ihm gehört. */
  function fehlerAttribute(name: FieldName) {
    return fehler?.feld === name
      ? { "aria-invalid": true as const, "aria-describedby": `${id(name)}-fehler` }
      : {};
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain sm:max-w-[460px]"
        onOpenAutoFocus={(event) => {
          // Direkt ins erste Feld statt auf den ersten Knopf.
          event.preventDefault();
          streetRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Anschrift für die Rechnung</DialogTitle>
          <DialogDescription>
            Die Anfrage von {guestName} hat noch keine Anschrift. Sie wird für die Rechnung
            gebraucht, die mit der Bestätigung als PDF an den Gast geht. Erst danach wird
            bestätigt.
          </DialogDescription>
        </DialogHeader>

        <form id={id("form")} onSubmit={handleSubmit}>
          {/* Während des Bestätigens gesperrt: Was jetzt noch geändert würde,
              käme nicht mehr auf die Rechnung. */}
          <fieldset disabled={pending} className="flex min-w-0 flex-col gap-4">
            <legend className="sr-only">Rechnungsanschrift von {guestName}</legend>

            <Feld id={id("street")} fehler={fehlerFuer("street")} label="Straße und Hausnummer">
              <input
                ref={streetRef}
                id={id("street")}
                name="street"
                {...fehlerAttribute("street")}
                type="text"
                required
                maxLength={ADDRESS_LIMITS.street}
                autoComplete="off"
                placeholder="Musterstraße 1"
                className={FELD}
              />
            </Feld>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <Feld id={id("postalCode")} fehler={fehlerFuer("postalCode")} label="PLZ">
                <input
                  id={id("postalCode")}
                  name="postalCode"
                  {...fehlerAttribute("postalCode")}
                  type="text"
                  required
                  maxLength={ADDRESS_LIMITS.postalCode}
                  autoComplete="off"
                  className={FELD}
                />
              </Feld>

              <Feld id={id("city")} fehler={fehlerFuer("city")} label="Ort">
                <input
                  id={id("city")}
                  name="city"
                  {...fehlerAttribute("city")}
                  type="text"
                  required
                  maxLength={ADDRESS_LIMITS.city}
                  autoComplete="off"
                  className={FELD}
                />
              </Feld>
            </div>

            <Feld id={id("country")} fehler={fehlerFuer("country")} label="Land" optional>
              <input
                id={id("country")}
                name="country"
                {...fehlerAttribute("country")}
                type="text"
                maxLength={ADDRESS_LIMITS.country}
                autoComplete="off"
                placeholder="Deutschland"
                className={FELD}
              />
            </Feld>

            {fehler && fehler.feld === null && (
              <p
                role="alert"
                className="rounded-sm border border-destructive/30 bg-destructive/5 px-4 py-3 text-klein text-destructive"
              >
                {fehler.text}
              </p>
            )}
          </fieldset>
        </form>

        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button type="submit" form={id("form")} disabled={pending} className="h-11">
            {pending ? "Wird bestätigt …" : "Bestätigen und Rechnung senden"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
