import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Admin und API sind per Login geschützt; sie auszuschließen hält sie nur aus
// dem Suchindex heraus. Das Admin-Layout setzt zusätzlich "noindex".
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
