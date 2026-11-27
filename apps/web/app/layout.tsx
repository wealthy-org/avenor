import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://avenorfi.xyz";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/icon.svg",
  },
  title: "AVENOR — Systematically Managed On-Chain Yield Strategies",
  description:
    "Access systematically managed on-chain investment strategies through transparent, risk-bounded ERC-4626 vaults engineered for Robinhood Chain.",
  keywords: [
    "Avenor",
    "ERC-4626",
    "Robinhood Chain",
    "USDG",
    "DeFi",
    "Yield",
    "Managed Vaults",
  ],
  openGraph: {
    title: "AVENOR — Systematically Managed On-Chain Yield",
    description:
      "Access systematically managed on-chain investment strategies through transparent, risk-bounded ERC-4626 vaults engineered for Robinhood Chain.",
    type: "website",
    url: siteUrl,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400..600;1,9..40,400..500&family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#0b1310] text-[#f8f9fa] antialiased selection:bg-[#6db89b]/25 selection:text-[#f8f9fa] min-h-screen flex flex-col font-sans">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Navbar />
        <main id="main" className="w-full overflow-x-hidden flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
