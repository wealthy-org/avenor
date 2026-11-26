import Link from "next/link";
import { AvenorLogo } from "./AvenorLogo";

export function Footer({ chainLine }: { chainLine?: string }) {
  return (
    <footer className="bg-[#0b1310]/85 backdrop-blur-sm border-t border-white/[0.08]">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-12">
        {/* Top row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-8 border-b border-white/[0.06]">
          <div className="flex flex-wrap items-center gap-4">
            <AvenorLogo />
            <span className="text-[13px] text-[#b0b7c3]">
              Institutional on-chain investment strategies · Capital, Working Smarter.
            </span>
          </div>
          {chainLine ? (
            <span className="font-mono text-[13px] text-[#a3abb8] flex flex-wrap items-center gap-x-1.5">
              <span className="whitespace-nowrap">{chainLine}</span>
            </span>
          ) : null}
        </div>

        {/* Bottom row */}
        <div className="pt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-[13px] text-[#a3abb8]">
          <span>© 2026 AVENOR. All rights reserved.</span>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:flex sm:flex-wrap sm:items-center sm:gap-6">
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
