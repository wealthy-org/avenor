import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { PwaRegistrar } from "@/components/PwaRegistrar";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://avenorfi.xyz";

export const viewport: Viewport = {
  themeColor: "#0b1310",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AVENOR",
  },
  applicationName: "AVENOR",
  formatDetection: {
    telephone: false,
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
    "PWA",
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
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="bg-[#0b1310] text-[#f8f9fa] antialiased selection:bg-[#6db89b]/25 selection:text-[#f8f9fa] min-h-screen flex flex-col font-sans">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <PwaRegistrar />
        <Navbar />
        <main id="main" className="w-full overflow-x-hidden flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
