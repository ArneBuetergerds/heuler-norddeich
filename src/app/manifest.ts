import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

/**
 * Manifest der öffentlichen Website, ausgeliefert unter /manifest.webmanifest
 * und von Next.js im Root-Layout verlinkt. Der Admin-Bereich überschreibt den
 * Link in seinem Layout mit /admin.webmanifest (eigene `id`, Scope /admin) –
 * Next.js nimmt immer den Wert des tiefsten Layouts. Beide Apps lassen sich
 * deshalb unabhängig voneinander installieren.
 *
 * Farben: Hintergrund `sand` (zinc-50, Seitengrund), Leiste `muschel` (weiß,
 * Header), siehe globals.css.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: SITE_NAME,
    short_name: "Heuler",
    description: SITE_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "de",
    background_color: "#fafafa",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
