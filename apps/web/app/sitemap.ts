import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://avenorfi.xyz";
  const now = new Date();
  return [
    { url: `${baseUrl}/`, lastModified: now },
    { url: `${baseUrl}/portfolio`, lastModified: now },
    { url: `${baseUrl}/activity`, lastModified: now },
    { url: `${baseUrl}/operator`, lastModified: now },
    { url: `${baseUrl}/docs`, lastModified: now },
    { url: `${baseUrl}/transparency`, lastModified: now },
  ];
}
