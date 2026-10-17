"use client";

import { useState } from "react";
import Image from "next/image";
import { Lightbox } from "./Lightbox";

type GalleryImage = {
  readonly src: string;
  readonly alt: string;
};

/** Bilderraster; ein Tipp öffnet das Bild groß in der Lightbox. */
export function GalleryGrid({ images }: { images: readonly GalleryImage[] }) {
  const [openAt, setOpenAt] = useState<number | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {images.map((image, i) => (
          <button
            key={image.src}
            type="button"
            onClick={() => setOpenAt(i)}
            aria-label={`Bild vergrößern: ${image.alt}`}
            className="relative aspect-[4/5] cursor-zoom-in overflow-hidden rounded-sm bg-track"
          >
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes="(max-width: 640px) 50vw, 280px"
              className="object-cover transition-transform duration-300 hover:scale-[1.03]"
            />
          </button>
        ))}
      </div>

      <Lightbox images={images} startIndex={openAt} onClose={() => setOpenAt(null)} />
    </>
  );
}
