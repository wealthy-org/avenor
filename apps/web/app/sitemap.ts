import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://avenor-kappa.vercel.app";
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
