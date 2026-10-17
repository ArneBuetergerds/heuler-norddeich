"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Lightbox } from "./Lightbox";

type GalleryImage = {
  readonly src: string;
  readonly alt: string;
};

/**
 * Horizontal scrollende Galerie auf Basis von CSS Scroll-Snap: Auf dem Handy
 * wischt man, am Desktop klickt man die Pfeile. Kein Timer, kein Autoplay –
 * das Bild wechselt nur, wenn jemand es will.
 *
 * Die Höhe kommt aus einem Seitenverhältnis statt aus einem festen Pixelwert.
 * Keins ist Querformat, weil elf der dreizehn Aufnahmen Hochformat sind (siehe
 * `gallery.ts`). Mobil quadratisch, damit Überschrift und Button noch auf den
 * ersten Bildschirm passen; ab md 4:5 in der rechten Spalte.
 */
export function HeroGallery({ images }: { images: readonly GalleryImage[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [openAt, setOpenAt] = useState<number | null>(null);

  function scrollToIndex(next: number): void {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    const clamped = Math.max(0, Math.min(next, images.length - 1));
    track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
  }

  // Den Index aus der Scroll-Position ableiten statt ihn beim Klick zu setzen:
  // So stimmt er auch nach einer Wischgeste.
  function handleScroll(): void {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    setIndex(Math.round(track.scrollLeft / track.clientWidth));
  }

  return (
    <div className="relative">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex aspect-square w-full md:aspect-[4/5] snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-card [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {images.map((image, i) => (
          // Antippen öffnet die Vollbildansicht; Wischen bleibt Wischen, weil
          // der Browser eine Wischgeste nicht als Klick meldet.
          <button
            key={image.src}
            type="button"
            onClick={() => setOpenAt(i)}
            aria-label={`Bild vergrößern: ${image.alt}`}
            className="relative h-full w-full shrink-0 cursor-zoom-in snap-center"
          >
            <Image
              src={image.src}
              alt={image.alt}
              fill
              // Nur das erste Bild ist beim Laden sichtbar und damit das LCP-
              // Element; der Rest liegt außerhalb des Viewports.
              priority={i === 0}
              // Mobil volle Breite, ab md eine von zwei Spalten.
              sizes="(max-width: 768px) 100vw, 480px"
              className="object-cover"
            />
          </button>
        ))}
      </div>

      <Lightbox images={images} startIndex={openAt} onClose={() => setOpenAt(null)} />

      <GalleryButton
        side="left"
        label="Vorheriges Bild"
        disabled={index === 0}
        onClick={() => scrollToIndex(index - 1)}
      >
        <ChevronLeft className="size-5" />
      </GalleryButton>
      <GalleryButton
        side="right"
        label="Nächstes Bild"
        disabled={index === images.length - 1}
        onClick={() => scrollToIndex(index + 1)}
      >
        <ChevronRight className="size-5" />
      </GalleryButton>

      <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
        {images.map((image, i) => (
          <button
            key={image.src}
            type="button"
            onClick={() => scrollToIndex(i)}
            aria-label={`Bild ${i + 1} von ${images.length}`}
            aria-current={i === index ? "true" : undefined}
            className={cn(
              "h-1.5 rounded-full bg-white transition-all",
              i === index ? "w-5 opacity-95" : "w-1.5 opacity-60 hover:opacity-80",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function GalleryButton({
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
        "absolute top-1/2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-schlick transition-opacity hover:bg-white disabled:opacity-0 sm:flex",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      {children}
    </button>
  );
}
