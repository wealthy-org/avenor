import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AVENOR — Systematically Managed Yield Strategies",
    short_name: "AVENOR",
    description:
      "Access systematically managed on-chain investment strategies through transparent, risk-bounded ERC-4626 allocator vaults on Robinhood Chain.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1310",
    theme_color: "#0b1310",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
    categories: ["finance", "utilities"],
    prefer_related_applications: false,
  };
}
