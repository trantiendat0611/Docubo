import type { MetadataRoute } from "next";

/**
 * Only the public homepage is worth indexing. /app and /login have nothing
 * for Google to show a searcher — the first requires a session and just
 * redirects, the second is a bare auth form — so disallowing them keeps the
 * index from filling up with pages that offer no reason to click through.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/login"],
    },
    sitemap: "https://docubo.vercel.app/sitemap.xml",
  };
}
