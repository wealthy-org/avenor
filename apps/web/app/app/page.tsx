// /app — Dedicated Vault Application & Allocator Catalogue page.
//
// Shows the active USDG Allocator Vaults on Robinhood Chain, real-time liquidity
// metrics read from the node, and direct execution pathways.
// Every figure is read from the node at one named block.

import Link from "next/link";
import { parseVaultList, DEFAULT_TESTNET_VAULT, type VaultConfig } from "@/config/vaults";
import { money, percentBps, shortAddress } from "@/lib/format";
import { getDirectVaultDetail } from "@/lib/serverData";
import { chainSummary, readChainFacts } from "@/lib/chainFacts";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Avenor App — USDG Allocator Vaults",
  description: "Direct on-chain interface to Avenor ERC-4626 USDG allocator vaults on Robinhood Chain.",
};

const EXPLORER_BASE = "https://testnet.robinhoodchain.com";

export default async function AppPage() {
  let vaults: VaultConfig[] = [];
  try {
    vaults = parseVaultList(process.env.AVENOR_VAULTS);
  } catch (error) {
    console.warn("AVENOR_VAULTS configuration error, using default fallback:", error);
    vaults = [];
  }

  if (vaults.length === 0) {
    vaults = [DEFAULT_TESTNET_VAULT];
  }

  // Every catalogue card carries its own read: reusing vaults[0]'s snapshot across N configured
  // vaults would print one vault's numbers on all of them.
  const details = await Promise.all(
    vaults.map(async (vault) => {
      try {
        return { detail: await getDirectVaultDetail(vault.address), error: null as string | null };
      } catch (error) {
        return { detail: null, error: error instanceof Error ? error.message : String(error) };
      }
    }),
  );

  const readable = details.filter((entry) => entry.detail?.live != null);
  const live = readable[0]?.detail?.live ?? null;
  if (live === null) {
    const first = details[0];
    return (
      <div className="shell stack">
        <div className="rounded-xl bg-[#14221c] border border-red-500/30 p-6 text-red-300">
          <h2 className="text-xl font-medium text-white mb-2">The vault did not answer</h2>
          <p>
            {first?.error ??
              (first?.detail?.liveError instanceof Error
                ? first.detail.liveError.message
                : String(first?.detail?.liveError ?? "the read returned no assets, idle cash or debt"))}
          </p>
          <p className="mt-2 text-sm text-[#b0b7c3]">
            No figure is shown instead of the missing one: an empty read is not zero.
          </p>
        </div>
      </div>
    );
  }

  const facts = await readChainFacts(process.env.NEXT_PUBLIC_RPC_URL);
  const chainLine = chainSummary(facts);
  // Header aggregates are the sum across the vaults that answered; a vault that did not answer is
  // not silently counted as zero, it is named as unanswered.
  const aggregate = readable.reduce(
    (acc, entry) => {
      const row = entry.detail!.live!;
      return {
        totalAssets: acc.totalAssets + row.totalAssets,
        totalIdle: acc.totalIdle + row.totalIdle,
        totalDebt: acc.totalDebt + row.totalDebt,
        depositLimit: acc.depositLimit + row.depositLimit,
      };
    },
    { totalAssets: 0n, totalIdle: 0n, totalDebt: 0n, depositLimit: 0n },
  );
  const idleBps = aggregate.totalAssets === 0n ? 0 : Number((aggregate.totalIdle * 10000n) / aggregate.totalAssets);
  const unanswered = vaults.length - readable.length;

  return (
    <div className="shell stack">
      {/* Breadcrumb Navigation */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#8b929e]">
        <Link href="/" className="hover:text-[#6db89b] transition-colors">
          ← Home
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-[#f8f9fa]">App (USDG Allocator Vaults)</span>
      </div>

      {/* Header Banner */}
      <header className="rounded-xl bg-[#101b16]/90 border border-white/[0.08] p-6 sm:p-8 backdrop-blur-sm shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="max-w-2xl">
          <span className="font-mono text-xs uppercase tracking-wider text-[#6db89b]">
            Decentralized Application · Chain 46630
          </span>
          <h1 className="font-display text-2xl sm:text-3xl font-medium text-[#f8f9fa] mt-1.5">
            USDG Allocator Vaults
          </h1>
          <p className="mt-2.5 text-sm text-[#b0b7c3] leading-relaxed text-pretty">
            Systematically managed ERC-4626 allocator vaults on Robinhood Chain. Select a vault below to inspect
            real-time on-chain liquidity, execute deposits, or monitor positions.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#14221c] border border-white/[0.08] text-xs font-mono text-[#a3abb8]">
            <span className="w-2 h-2 rounded-full bg-[#6db89b] animate-pulse" />
            <span>{chainLine}</span>
          </div>
          <Link
            href="/portfolio"
            className="rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-[#f8f9fa] px-3.5 py-2 border border-white/[0.1] transition-colors"
          >
            My Portfolio →
          </Link>
        </div>
      </header>

      {/* Live System Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-xl bg-[#14221c]/70 border border-white/[0.08] p-4.5 space-y-1">
          <div className="text-xs font-mono text-[#8b929e]">Total Assets (sum of {readable.length} answered vault{readable.length === 1 ? "" : "s"})</div>
          <div className="font-mono text-xl font-semibold text-[#f8f9fa]">
            {money(aggregate.totalAssets)} <span className="text-xs font-normal text-[#6db89b]">USDG</span>
          </div>
          <div className="text-[11px] text-[#a3abb8] pt-1">
            {money(aggregate.totalDebt)} USDG deployed in yield venues
            {unanswered > 0
              ? ` · ${unanswered} vault${unanswered === 1 ? "" : "s"} did not answer and is not counted`
              : ""}
          </div>
        </div>

        <div className="rounded-xl bg-[#14221c]/70 border border-white/[0.08] p-4.5 space-y-1">
          <div className="text-xs font-mono text-[#8b929e]">Immediate Idle Liquidity</div>
          <div className="font-mono text-xl font-semibold text-[#6db89b]">
            {money(aggregate.totalIdle)} <span className="text-xs font-normal text-[#6db89b]">USDG</span>
          </div>
          <div className="text-[11px] text-[#a3abb8] pt-1">
            {percentBps(idleBps)} of total assets immediately liquid
          </div>
        </div>

        <div className="rounded-xl bg-[#14221c]/70 border border-white/[0.08] p-4.5 space-y-1">
          <div className="text-xs font-mono text-[#8b929e]">Enforced Deposit Limit (sum)</div>
          <div className="font-mono text-xl font-semibold text-[#f8f9fa]">
            {money(aggregate.depositLimit)} <span className="text-xs font-normal text-[#a3abb8]">USDG</span>
          </div>
          <div className="text-[11px] text-[#a3abb8] pt-1">
            Enforced by on-chain VaultV3 contract caps
          </div>
        </div>

        <div className="rounded-xl bg-[#14221c]/70 border border-white/[0.08] p-4.5 space-y-1">
          <div className="text-xs font-mono text-[#8b929e]">Protocol Fee Structure</div>
          <div className="font-mono text-xl font-semibold text-[#f8f9fa]">
            {live.performanceFeeBps !== null ? percentBps(live.performanceFeeBps) : "not readable"}{" "}
            <span className="text-xs font-normal text-[#6db89b]">Perf</span>
          </div>
          <div className="text-[11px] text-[#a3abb8] pt-1">
            {live.managementFeeBps === null
              ? "Management fee not readable · Accountant enforced"
              : `${percentBps(live.managementFeeBps)} Mgmt Fee · Accountant enforced`}
          </div>
        </div>
      </div>

      {/* Configured Vaults Catalog Section (Kassora Multi-Metric Card Style) */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 pb-4 border-b border-white/[0.08]">
          <div>
            <span className="font-mono text-xs uppercase tracking-wider text-[#6db89b]">
              Configured Vaults
            </span>
            <h2 className="font-display text-xl sm:text-2xl font-medium text-[#f8f9fa] mt-1">
              USDG Allocator Vaults
            </h2>
          </div>
          <span className="font-mono text-xs text-[#a3abb8] flex flex-wrap items-center gap-x-1.5">
            <span>{vaults.length} vault configured ·</span>
            <span className="whitespace-nowrap">{chainLine}</span>
          </span>
        </div>

        {/* 2-Column Responsive Card Grid (Kassora Flagship Architecture) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {vaults.map((vault, vaultIndex) => {
            const card = details[vaultIndex];
            const cardLive = card?.detail?.live ?? null;
            const cardIdleBps =
              cardLive === null || cardLive.totalAssets === 0n
                ? null
                : Number((cardLive.totalIdle * 10000n) / cardLive.totalAssets);
            return (
            <div
              key={vault.address}
              className="rounded-2xl bg-[#0e1613]/90 border border-white/[0.08] hover:border-white/[0.18] transition-all duration-300 p-6 sm:p-7 relative overflow-hidden flex flex-col justify-between shadow-xl group"
              style={{
                borderTopColor: "#52b896",
                borderTopWidth: "2px",
              }}
            >
              {/* Radial glow accent on hover */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full blur-3xl opacity-0 group-hover:opacity-20 transition-opacity duration-500 bg-[#52b896]"
              />

              <div>
                {/* Header: Title, Subtitle, Phase Badge */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl sm:text-2xl font-medium text-[#f8f9fa] group-hover:text-white transition-colors">
                      {vault.label}
                    </h3>
                    <div className="mt-1 font-mono text-xs text-[#8b929e] flex items-center gap-1.5">
                      <span>Contract:</span>
                      <a
                        href={`${EXPLORER_BASE}/address/${vault.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#6db89b] hover:underline inline-flex items-center gap-1"
                        title={vault.address}
                      >
                        <span>{shortAddress(vault.address)}</span>
                        <span className="text-[10px]">↗</span>
                      </a>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium shrink-0 border ${
                      vault.phase === "limited-launch"
                        ? "bg-[#52b896]/10 text-[#52b896] border-[#52b896]/30"
                        : "bg-[#e8c468]/10 text-[#e8c468] border-[#e8c468]/30"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#52b896] animate-pulse" />
                    {vault.phase === "limited-launch" ? "Limited Launch" : "Research Staging"}
                  </span>
                </div>

                {/* 3 Metrics Row — this vault's own read, never a neighbour's */}
                <div className="grid grid-cols-3 gap-2 sm:gap-4 my-6 pt-5 pb-5 border-y border-white/[0.06]">
                  <div className="space-y-1">
                    <div className="text-lg sm:text-2xl font-mono font-semibold tracking-tight text-[#f8f9fa]">
                      {cardLive === null ? "—" : money(cardLive.totalAssets)}
                    </div>
                    <div className="text-[11px] font-mono text-[#8b929e]">
                      Total Assets (USDG)
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-lg sm:text-2xl font-mono font-semibold tracking-tight text-[#52b896]">
                      {cardLive === null ? "—" : money(cardLive.totalIdle)}
                    </div>
                    <div className="text-[11px] font-mono text-[#8b929e]">
                      {cardIdleBps === null ? "Idle Cash (unknown)" : `Idle Cash (${percentBps(cardIdleBps)})`}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-lg sm:text-2xl font-mono font-semibold tracking-tight text-[#f8f9fa]">
                      {cardLive === null ? "—" : money(cardLive.depositLimit)}
                    </div>
                    <div className="text-[11px] font-mono text-[#8b929e]">
                      Enforced Cap (USDG)
                    </div>
                  </div>
                </div>
                {cardLive === null ? (
                  <p className="text-xs text-[#e8c468] font-mono pb-4">
                    This vault did not answer at read time
                    {card?.error ? `: ${card.error}` : " · no figure is invented for it"}.
                  </p>
                ) : null}
              </div>

              {/* Footer Row */}
              <div className="flex items-center justify-between gap-3 pt-2 text-xs font-mono">
                <span className="text-[#8b929e]">USDG · ERC-4626 · 6 Decimals</span>

                <div className="flex items-center gap-3 shrink-0">
                  <Link
                    href={`/vaults/${vault.address}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#52b896] hover:bg-[#43a182] text-[#0b1310] px-4 py-2 text-xs font-semibold transition-all shadow-md shadow-[#52b896]/20"
                  >
                    <span>Open Vault</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>
            </div>
            );
          })}
        </div>

        {/* Provenance Footnote matching specification */}
        <div className="flex items-start gap-2.5 text-xs text-[#a3abb8] leading-relaxed pt-2">
          <span className="text-[#6db89b] text-sm leading-none mt-0.5">ℹ</span>
          <p>
            Every figure on this page is read from the node during this render. The header sums carry
            block{" "}
            <span className="font-mono text-[#f8f9fa]">{live.blockNumber.toString()}</span> from the first vault that
            answered; each card below carries its own read and block.
            Vault exits send an explicit loss budget chosen in the withdrawal form; the app never defaults one.
          </p>
        </div>
      </section>

      {/* Quick Access Ecosystem Actions */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
        <Link
          href={`/vaults/${vaults[0].address}/deposit`}
          className="group rounded-xl bg-[#14221c]/60 hover:bg-[#14221c] border border-white/[0.08] hover:border-[#6db89b]/40 p-5 transition-all space-y-2"
        >
          <div className="flex items-center justify-between text-xs font-mono text-[#6db89b]">
            <span>DEPOSIT CAPITAL</span>
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </div>
          <div className="font-display text-base font-medium text-[#f8f9fa]">
            Mint Shares &amp; Allocate
          </div>
          <p className="text-xs text-[#a3abb8] leading-relaxed">
            Deposit USDG with exact 6-decimal precision against on-chain limits.
          </p>
        </Link>

        <Link
          href={`/vaults/${vaults[0].address}/withdraw`}
          className="group rounded-xl bg-[#14221c]/60 hover:bg-[#14221c] border border-white/[0.08] hover:border-[#6db89b]/40 p-5 transition-all space-y-2"
        >
          <div className="flex items-center justify-between text-xs font-mono text-[#fb923c]">
            <span>WITHDRAW LIQUIDITY</span>
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </div>
          <div className="font-display text-base font-medium text-[#f8f9fa]">
            Redeem Shares with Max Loss
          </div>
          <p className="text-xs text-[#a3abb8] leading-relaxed">
            Redeem against idle cash buffer with zero loss or user-specified loss budget.
          </p>
        </Link>

        <Link
          href="/transparency"
          className="group rounded-xl bg-[#14221c]/60 hover:bg-[#14221c] border border-white/[0.08] hover:border-[#6db89b]/40 p-5 transition-all space-y-2"
        >
          <div className="flex items-center justify-between text-xs font-mono text-[#38bdf8]">
            <span>TRANSPARENCY &amp; PROOF</span>
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </div>
          <div className="font-display text-base font-medium text-[#f8f9fa]">
            On-Chain Deployment Proof
          </div>
          <p className="text-xs text-[#a3abb8] leading-relaxed">
            Inspect verified smart contracts, multisig safekeeping, and deployment tx receipts.
          </p>
        </Link>
      </section>
    </div>
  );
}
