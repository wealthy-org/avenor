import Link from "next/link";
import { AvenorLogo } from "./AvenorLogo";

export function Footer({ chainLine }: { chainLine?: string }) {
  return (
    <footer className="bg-[#0b1310]/85 backdrop-blur-sm border-t border-white/[0.08]">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6 py-12">
        {/* Top row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-8 border-b border-white/[0.06]">
          <div className="flex flex-wrap items-center gap-4">
            <AvenorLogo />
            <span className="text-[13px] text-[#b0b7c3]">
              Systematically managed on-chain yield strategies · Capital, Working Smarter.
            </span>
          </div>

          <div className="flex items-center gap-4 sm:gap-6">
            {/* Social Icons */}
            <div className="flex items-center gap-3">
              <a
                href="https://x.com/avenor_fi"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="AVENOR on X (formerly Twitter)"
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#b0b7c3] hover:text-[#f8f9fa] hover:bg-white/[0.08] transition-colors"
                title="Follow @avenor_fi on X"
              >
                <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>

              <a
                href="https://github.com/wealthy-org/avenor"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="AVENOR on GitHub"
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#b0b7c3] hover:text-[#f8f9fa] hover:bg-white/[0.08] transition-colors"
                title="AVENOR GitHub Repository"
              >
                <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>
              </a>
            </div>

            {chainLine ? (
              <span className="font-mono text-[12px] text-[#a3abb8] flex items-center gap-x-1.5 rounded-lg bg-white/[0.04] px-2.5 py-1 border border-white/[0.06]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#6db89b]" />
                <span className="whitespace-nowrap">{chainLine}</span>
              </span>
            ) : null}
          </div>
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
              href="/activity"
              className="hover:text-[#f8f9fa] transition-colors cursor-pointer"
            >
              Activity
            </Link>
            <Link
              href="/operator"
              className="hover:text-[#f8f9fa] transition-colors cursor-pointer"
            >
              Operator
            </Link>
            <Link
              href="/docs"
              className="hover:text-[#f8f9fa] transition-colors cursor-pointer"
            >
              Docs & Disclosures
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
