import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map(({ path, priority }) => ({
    url: new URL(path, SITE_URL).href,
    priority,
  }));
}
