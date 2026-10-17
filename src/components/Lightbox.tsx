"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

type LightboxImage = {
  readonly src: string;
  readonly alt: string;
};

type Props = {
  images: readonly LightboxImage[];
  /** Index des Bilds, mit dem die Ansicht öffnet; `null` = geschlossen. */
  startIndex: number | null;
  onClose: () => void;
};

/**
 * Vollbildansicht der Fotos. Wischen (Scroll-Snap) auf dem Handy, Pfeiltasten
 * und -knöpfe am Desktop. Radix übernimmt Fokusfalle, Escape und das Sperren
 * des Seiten-Scrollens.
 */
export function Lightbox({ images, startIndex, onClose }: Props) {
  return (
    <DialogPrimitive.Root
      open={startIndex !== null}
      onOpenChange={(value) => !value && onClose()}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-zinc-950" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col outline-none"
        >
          {/* Der Inhalt existiert nur, solange die Ansicht offen ist – er
              startet also bei jedem Öffnen frisch mit dem gewählten Bild. */}
          {startIndex !== null && <Slides images={images} initialIndex={startIndex} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Slides({
  images,
  initialIndex,
}: {
  images: readonly LightboxImage[];
  initialIndex: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(initialIndex);

  // Beim Öffnen ohne Animation zum gewählten Bild springen. Im ersten Frame
  // hat der Track im Portal noch keine Breite.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const track = trackRef.current;
      if (track) track.scrollLeft = initialIndex * track.clientWidth;
    });
    return () => cancelAnimationFrame(frame);
  }, [initialIndex]);

  function scrollToIndex(next: number): void {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(next, images.length - 1));
    track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
  }

  function handleScroll(): void {
    const track = trackRef.current;
    if (track) setIndex(Math.round(track.scrollLeft / track.clientWidth));
  }

  function handleKeyDown(event: React.KeyboardEvent): void {
    if (event.key === "ArrowRight") scrollToIndex(index + 1);
    if (event.key === "ArrowLeft") scrollToIndex(index - 1);
  }

  return (
    <div onKeyDown={handleKeyDown} className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <DialogPrimitive.Title className="text-sm tabular-nums">
          Bild {index + 1} von {images.length}
        </DialogPrimitive.Title>
        <DialogPrimitive.Close
          aria-label="Bilder schließen"
          className="grid size-11 place-items-center rounded-full hover:bg-white/10"
        >
          <X className="size-6" />
        </DialogPrimitive.Close>
      </div>

      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {images.map((image, i) => (
          <div key={image.src} className="relative h-full w-full shrink-0 snap-center">
            <Image
              src={image.src}
              alt={image.alt}
              fill
              // Nur das aktuelle Bild und seine Nachbarn sofort laden.
              loading={Math.abs(i - index) <= 1 ? "eager" : "lazy"}
              sizes="100vw"
              className="object-contain"
            />
          </div>
        ))}
      </div>

      <p className="min-h-12 px-4 py-3 text-center text-sm text-white/80">
        {images[index]?.alt}
      </p>

      <LightboxButton
        side="left"
        label="Vorheriges Bild"
        disabled={index === 0}
        onClick={() => scrollToIndex(index - 1)}
      >
        <ChevronLeft className="size-6" />
      </LightboxButton>
      <LightboxButton
        side="right"
        label="Nächstes Bild"
        disabled={index === images.length - 1}
        onClick={() => scrollToIndex(index + 1)}
      >
        <ChevronRight className="size-6" />
      </LightboxButton>
    </div>
  );
}

function LightboxButton({
  side,
  label,
  disabled,
  onClick,
  children,
}: {
  side: "left" | "right";
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        // Mobil wird gewischt; die Knöpfe sind für Maus und Tastatur.
        "absolute top-1/2 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 disabled:opacity-0 sm:grid",
        side === "left" ? "left-4" : "right-4",
      )}
    >
      {children}
    </button>
  );
}
