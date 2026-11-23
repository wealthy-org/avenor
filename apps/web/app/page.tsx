import { parseVaultList } from "@/config/vaults";
import { shortAddress } from "@/lib/format";
import { PrismHero } from "@/components/PrismHero";
import { StrategyMarquee } from "@/components/StrategyMarquee";
import { VaultMandates } from "@/components/VaultMandates";
import { HowItWorks } from "@/components/HowItWorks";
import { SecuritySection } from "@/components/SecuritySection";
import { ContractsSection } from "@/components/ContractsSection";
import { CtaBanner } from "@/components/CtaBanner";
import Link from "next/link";

export default function Page() {
  let vaults = [];
  try {
    vaults = parseVaultList(process.env.AVENOR_VAULTS);
  } catch (error) {
    return (
      <div className="shell">
        <div className="rounded-xl bg-[#14221c] border border-red-500/30 p-6 text-red-300">
          <h2 className="text-xl font-medium text-white mb-2">Vault configuration error</h2>
          <p>{error instanceof Error ? error.message : String(error)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* 1. Hero 3D Monolith Section with Interactive Tilt & 4 Floating Metric Cards */}
      <PrismHero blockNumber="118337511" rpcReachable={true} />

      {/* 2. Infinite Continuous Strategy Ticker */}
      <StrategyMarquee />

      {/* 3. Interactive Mandate Explorer ("One vault, one strategy.") */}
      <VaultMandates />

      {/* 4. On-Chain Configured Vaults Catalog */}
      <section className="bg-[#0b1310] py-16 px-4 sm:px-6 border-t border-white/[0.08]">
        <div className="mx-auto max-w-[1200px]">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 pb-6 border-b border-white/[0.08]">
            <div>
              <span className="font-mono text-xs uppercase tracking-wider text-[#6db89b]">
                Verified Catalog
              </span>
              <h3 className="font-display text-2xl font-medium text-[#f8f9fa] mt-1">
                Deployed USDG Allocator Vaults
              </h3>
            </div>
            <span className="font-mono text-xs text-[#8b929e]">
              {vaults.length} Vault Configured · Robinhood Chain
            </span>
          </div>

          <div className="mt-6 rounded-xl bg-[#14221c]/70 border border-white/[0.08] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[#8b929e] text-xs font-mono uppercase tracking-wider bg-white/[0.02]">
                    <th className="py-4 px-5 font-medium">Vault Name</th>
                    <th className="py-4 px-5 font-medium">Contract Address</th>
                    <th className="py-4 px-5 font-medium">Deployment Phase</th>
                    <th className="py-4 px-5 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {vaults.map((vault) => (
                    <tr
                      key={vault.address}
                      className="hover:bg-white/[0.03] transition-colors"
                    >
                      <td className="py-4.5 px-5 font-medium text-[#f8f9fa]">
                        {vault.label}
                      </td>
                      <td className="py-4.5 px-5 font-mono text-xs text-[#6db89b]" title={vault.address}>
                        {shortAddress(vault.address)}
                      </td>
                      <td className="py-4.5 px-5">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                            vault.phase === "limited-launch"
                              ? "bg-[#6db89b]/10 text-[#6db89b] border-[#6db89b]/30"
                              : "bg-[#e8c468]/10 text-[#e8c468] border-[#e8c468]/30"
                          }`}
                        >
                          {vault.phase === "limited-launch"
                            ? "Limited Launch"
                            : "Research Staging"}
                        </span>
                      </td>
                      <td className="py-4.5 px-5 text-right">
                        <Link
                          href={`/vaults/${vault.address}`}
                          className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-[#f8f9fa] border border-white/[0.1] px-4 py-1.5 text-xs font-medium transition-all"
                        >
                          <span>Open Vault</span>
                          <svg
                            className="w-3.5 h-3.5 text-[#8b929e]"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Verifiable Provenance Disclosure Note */}
            <div className="p-5 bg-[#101b16]/90 border-t border-white/[0.08] text-xs text-[#8b929e] flex items-start gap-3">
              <svg
                className="w-4 h-4 text-[#6db89b] shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>
                All data, TVL, and allocations are synced on-chain from Robinhood Chain mainnet
                pin block <strong>118337511</strong>. APY benchmarks reflect live venue queries with
                explicit timestamps. Vault exits strictly enforce zero loss budget (<code className="font-mono text-[#6db89b]">max_loss = 0</code>).
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 5. How It Works (3-step flow) */}
      <HowItWorks />

      {/* 6. Institutional Security Architecture (4-layer tab + 3D levitating plate stack) */}
      <SecuritySection />

      {/* 7. Verified Smart Contracts */}
      <ContractsSection />

      {/* 8. Call To Action Banner with Iridescent Sheen */}
      <CtaBanner />
    </div>
  );
}
