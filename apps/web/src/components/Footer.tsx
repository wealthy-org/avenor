import Link from "next/link";
import { AvenorLogo } from "./AvenorLogo";

export function Footer() {
  return (
    <footer className="bg-[#0b1310]/85 backdrop-blur-sm border-t border-white/[0.08]">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-12">
        {/* Top row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-8 border-b border-white/[0.06]">
          <div className="flex flex-wrap items-center gap-4">
            <AvenorLogo />
            <span className="text-xs text-[#9ca3af]">
              Institutional On-Chain Investment Strategies · Capital, Working Smarter.
            </span>
          </div>
          <span className="font-mono text-xs text-[#8b929e]">
            Robinhood Chain Mainnet · Chain ID 4663
          </span>
        </div>

        {/* Bottom row */}
        <div className="pt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-[#8b929e]">
          <span>© 2026 AVENOR. All rights reserved.</span>
          <div className="flex flex-wrap items-center gap-6">
            <a
              href="/#vaults"
              className="hover:text-[#f8f9fa] transition-colors cursor-pointer"
            >
              Strategy Documentation
            </a>
            <a
              href="/#contracts"
              className="hover:text-[#f8f9fa] transition-colors cursor-pointer"
            >
              Smart Contracts
            </a>
            <Link
              href="/portfolio"
              className="hover:text-[#f8f9fa] transition-colors cursor-pointer"
            >
              Portfolio
            </Link>
            <Link
              href="/transparency"
              className="hover:text-[#f8f9fa] transition-colors cursor-pointer"
            >
              Terms & Risk Disclosures
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
