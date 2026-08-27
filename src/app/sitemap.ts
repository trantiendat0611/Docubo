import type { MetadataRoute } from "next";

// Hardcoded, not read from an env var: the project only ever runs one
// public deployment (README's "Chỉ bật environment Production"), and a
// sitemap has no reason to point anywhere but the real domain even when
// built locally.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://docubo.vercel.app",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
