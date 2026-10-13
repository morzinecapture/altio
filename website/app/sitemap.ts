import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://altio.app";
  return [
    "",
    "/proprietaires",
    "/prestataires",
    "/contact",
    "/support",
    "/confidentialite",
  ].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: "monthly",
    priority: path ? 0.7 : 1,
  }));
}
