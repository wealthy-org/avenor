import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Avenor — vault USDG",
  description: "Vault ERC-4626 untuk USDG di Robinhood Chain. Setiap angka membawa blok dan sumbernya.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <a className="skip-link" href="#main">
          Langsung ke isi
        </a>
        <div className="shell">
          <header className="masthead">
            <h1>Avenor</h1>
            <nav aria-label="Navigasi utama">
              <a href="/">Vault</a>
              <a href="/transparency">Transparansi</a>
            </nav>
          </header>
          <main id="main">{children}</main>
        </div>
      </body>
    </html>
  );
}