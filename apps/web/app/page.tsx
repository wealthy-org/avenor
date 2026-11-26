import { STAGING_VAULT } from "@/config/staging";
import { parseVaultList } from "@/config/vaults";
import { money, percentBps, shortAddress } from "@/lib/format";
import { getDirectVaultDetail } from "@/lib/serverData";
import type { VaultDetail } from "@/lib/vaultLoader";
import type { Live } from "@/lib/vaultView";
import { PrismHero, type HeroMetric } from "@/components/PrismHero";
import { StrategyMarquee, type MarqueeLive } from "@/components/StrategyMarquee";
import { VaultMandates, type MandateLive } from "@/components/VaultMandates";
import { HowItWorks } from "@/components/HowItWorks";
import { SecuritySection } from "@/components/SecuritySection";
import { ContractsSection } from "@/components/ContractsSection";
import { CtaBanner } from "@/components/CtaBanner";
import Link from "next/link";

const MANDATE_FALLBACK =
  "Staging fork of Robinhood Chain state. Every number on this page is read from the node at one named " +
  "block and printed with that block; this deployment has no code on mainnet. Not open for public deposits.";

/**
 * Hero tiles built from the same snapshot read the vault page uses. A figure that cannot be derived
 * from that read does not appear here: there is no APY tile, because no APR is quoted on-chain.
 */
function heroMetricsFrom(live: Live): HeroMetric[] {
  const { totalAssets, totalIdle, totalDebt, depositLimit } = live;
  const idleBps = totalAssets === 0n ? 0 : Number((totalIdle * 10000n) / totalAssets);

  return [
    {
      label: "Total assets in the vault",
      value: `${money(totalAssets)} USDG`,
      detail: `${money(totalDebt)} USDG deployed to strategies; the rest is cash`,
    },
    {
      label: "Idle cash available now",
      value: `${money(totalIdle)} USDG`,
      detail: `${percentBps(idleBps)} of total assets, held as cash`,
    },
    {
      label: "Deposit limit enforced by the vault",
      value: `${money(depositLimit)} USDG`,
      detail: `deposit_limit() at block ${live.blockNumber}`,
    },
    {
      label: "Fees set on the vault",
      value:
        live.performanceFeeBps === null ? "not readable" : `${percentBps(live.performanceFeeBps)} performance`,
      detail:
        live.managementFeeBps === null
          ? "the accountant did not answer"
          : `${percentBps(live.managementFeeBps)} management fee, read from the accountant`,
    },
  ];
}
/** `bigint` → decimal string, so a client component never receives a `bigint` across the boundary. */
const dec = (value: bigint | null) => (value === null ? null : value.toString());

function marqueeLive(live: Live): MarqueeLive {
  return {
    blockNumber: live.blockNumber.toString(),
    totalAssets: live.totalAssets.toString(),
    totalIdle: live.totalIdle.toString(),
    depositLimit: live.depositLimit.toString(),
    performanceFeeBps: live.performanceFeeBps,
    managementFeeBps: live.managementFeeBps,
  };
}

function mandateLive(live: Live, detail: VaultDetail): MandateLive {
  const strategy = detail.allocation?.strategies[0] ?? null;
  return {
    ...marqueeLive(live),
    currentDebt: dec(strategy?.currentDebt ?? null),
    maxDebt: dec(strategy?.maxDebt ?? null),
  };
}

export const dynamic = "force-dynamic";

export default async function Page() {
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

  if (vaults.length === 0) {
    return (
      <div className="shell py-24 text-center">
        <div className="max-w-xl mx-auto rounded-xl bg-[#101b16]/90 border border-white/[0.08] p-8 space-y-4">
          <h2 className="text-2xl font-display font-medium text-white">No Vaults Configured</h2>
          <p className="text-sm text-[#a3abb8] leading-relaxed">
            No vaults are currently configured in the application environment (<code className="font-mono text-[#6db89b]">AVENOR_VAULTS</code>).
          </p>
          <p className="text-xs text-[#6b7280]">
            Please set the <code className="font-mono text-[#6db89b]">AVENOR_VAULTS</code> environment variable to display verified vaults.
          </p>
        </div>
      </div>
    );
  }

  // One snapshot per request. The hero tiles, the ticker, the mandate facts and the block chip all come
  // from the same read, so no figure on this page can disagree with the block printed next to it.
  let detail: VaultDetail;
  try {
    detail = await getDirectVaultDetail(vaults[0].address);
  } catch (error) {
    // A vault the node cannot answer for has no numbers; the page says which read failed and at which
    // block, instead of rendering a stack trace or a zero.
    return (
      <div className="shell">
        <div className="rounded-xl bg-[#14221c] border border-red-500/30 p-6 text-red-300">
          <h2 className="text-xl font-medium text-white mb-2">The vault could not be read</h2>
          <p>{error instanceof Error ? error.message : String(error)}</p>
          <p className="mt-2 text-sm text-[#b0b7c3]">
            No figure is shown instead of the missing one: an empty read is not zero.
          </p>
        </div>
      </div>
    );
  }
  const live = detail.live;
  if (live === null) {
    return (
      <div className="shell">
        <div className="rounded-xl bg-[#14221c] border border-red-500/30 p-6 text-red-300">
          <h2 className="text-xl font-medium text-white mb-2">The vault did not answer</h2>
          <p>{detail.liveError instanceof Error ? detail.liveError.message : String(detail.liveError ?? "the read returned no assets, idle cash or debt")}</p>
          <p className="mt-2 text-sm text-[#b0b7c3]">
            No figure is shown instead of the missing one: an empty read is not zero.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* 1. Hero 3D Monolith Section with Interactive Tilt & 4 Floating Metric Cards */}
      <PrismHero
        blockNumber={live.blockNumber.toString()}
        rpcReachable={live.source === "onchain"}
        metrics={heroMetricsFrom(live)}
      />

      {/* 2. Infinite Continuous Strategy Ticker */}
      <StrategyMarquee live={marqueeLive(live)} />

      {/* 3. Interactive Mandate Explorer ("One vault, one strategy.") */}
      <VaultMandates live={mandateLive(live, detail)} />

      {/* 4. On-Chain Configured Vaults Catalog */}
      <section
        id="vaults"
        className="bg-[#0b1310] py-12 md:py-16 px-4 sm:px-6 border-t border-white/[0.08]"
      >
        <div className="mx-auto max-w-[1200px]">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 pb-6 border-b border-white/[0.08]">
            <div>
              <span className="font-mono text-xs uppercase tracking-wider text-[#6db89b]">
                Configured Vaults
              </span>
              <h3 className="font-display text-2xl font-medium text-[#f8f9fa] mt-1">
                USDG Allocator Vaults
              </h3>
            </div>
            <span className="font-mono text-xs text-[#a3abb8] flex flex-wrap items-center gap-x-1.5">
              <span>{vaults.length} vault configured · Robinhood Chain,</span>
              <span className="whitespace-nowrap">chain ID 4663</span>
            </span>
          </div>

          {/* A four-column table at 390px forced every cell to wrap and clipped the action. Below the
              sm breakpoint the same rows render as stacked cards instead of a scroll region. */}
          <div className="mt-6 grid gap-3 sm:hidden">
            {vaults.map((vault) => (
              <div
                key={vault.address}
                className="rounded-xl bg-[#14221c]/70 border border-white/[0.08] p-4 min-w-0"
              >
                <div className="min-w-0">
                  <div className="font-medium text-[#f8f9fa]">{vault.label}</div>
                  <div className="mt-1">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                        vault.phase === "limited-launch"
                          ? "bg-[#6db89b]/10 text-[#6db89b] border-[#6db89b]/30"
                          : "bg-[#e8c468]/10 text-[#e8c468] border-[#e8c468]/30"
                      }`}
                    >
                      {vault.phase === "limited-launch" ? "Limited Launch" : "Research Staging"}
                    </span>
                  </div>
                  <div className="mt-2 font-mono text-[13px] leading-relaxed text-[#6db89b] break-all">{vault.address}</div>
                </div>
                <Link
                  href={`/vaults/${vault.address}`}
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-[#f8f9fa] border border-white/[0.1] px-4 py-2 text-xs font-medium transition-all"
                >
                  Open Vault
                </Link>
              </div>
            ))}
          </div>

          <div className="mt-6 hidden sm:block rounded-xl bg-[#14221c]/70 border border-white/[0.08] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[#a3abb8] text-xs font-mono uppercase tracking-wider bg-white/[0.02]">
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
                      <td className="py-4.5 px-5 font-mono text-[13px] text-[#6db89b]" title={vault.address}>
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
                            className="w-3.5 h-3.5 text-[#a3abb8]"
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
            <div className="p-5 bg-[#101b16]/90 border-t border-white/[0.08] text-xs text-[#a3abb8] flex items-start gap-3">
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
                All TVL and allocation figures are captured on a local rehearsal fork of Robinhood Chain at pin block {live.blockNumber.toString()}.
                Vault exits strictly enforce an explicit zero loss budget (<code className="font-mono text-[#6db89b]">max_loss = 0</code>).
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
