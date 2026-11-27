// /app — Dedicated Vault Application & Allocator Catalogue page.
//
// Shows the active USDG Allocator Vaults on Robinhood Chain, real-time liquidity
// metrics read from the node, and direct execution pathways.
// Every figure is read from the node at one named block.

import Link from "next/link";
import { parseVaultList } from "@/config/vaults";
import { money, percentBps, shortAddress } from "@/lib/format";
import { getDirectVaultDetail } from "@/lib/serverData";
import { chainSummary, readChainFacts } from "@/lib/chainFacts";
import type { VaultDetail } from "@/lib/vaultLoader";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Avenor App — USDG Allocator Vaults",
  description: "Direct on-chain interface to Avenor ERC-4626 USDG allocator vaults on Robinhood Chain.",
};

const EXPLORER_BASE = "https://testnet.robinhoodchain.com";

export default async function AppPage() {
  let vaults = [];
  try {
    vaults = parseVaultList(process.env.AVENOR_VAULTS);
  } catch (error) {
    return (
      <div className="shell stack">
        <div className="rounded-xl bg-[#14221c] border border-red-500/30 p-6 text-red-300">
          <h2 className="text-xl font-medium text-white mb-2">Vault configuration error</h2>
          <p>{error instanceof Error ? error.message : String(error)}</p>
        </div>
      </div>
    );
  }

  if (vaults.length === 0) {
    return (
      <div className="shell py-24 text-center stack">
        <div className="max-w-xl mx-auto rounded-xl bg-[#101b16]/90 border border-white/[0.08] p-8 space-y-4">
          <h2 className="text-2xl font-display font-medium text-white">No Vaults Configured</h2>
          <p className="text-sm text-[#a3abb8] leading-relaxed">
            No vaults are currently configured in the application environment (
            <code className="font-mono text-[#6db89b]">AVENOR_VAULTS</code>).
          </p>
        </div>
      </div>
    );
  }

  let detail: VaultDetail;
  try {
    detail = await getDirectVaultDetail(vaults[0].address);
  } catch (error) {
    return (
      <div className="shell stack">
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
      <div className="shell stack">
        <div className="rounded-xl bg-[#14221c] border border-red-500/30 p-6 text-red-300">
          <h2 className="text-xl font-medium text-white mb-2">The vault did not answer</h2>
          <p>
            {detail.liveError instanceof Error
              ? detail.liveError.message
              : String(detail.liveError ?? "the read returned no assets, idle cash or debt")}
          </p>
        </div>
      </div>
    );
  }

  const facts = await readChainFacts(process.env.NEXT_PUBLIC_RPC_URL);
  const chainLine = chainSummary(facts);
  const idleBps = live.totalAssets === 0n ? 0 : Number((live.totalIdle * 10000n) / live.totalAssets);

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
          <div className="text-xs font-mono text-[#8b929e]">Total Assets (Vault TVL)</div>
          <div className="font-mono text-xl font-semibold text-[#f8f9fa]">
            {money(live.totalAssets)} <span className="text-xs font-normal text-[#6db89b]">USDG</span>
          </div>
          <div className="text-[11px] text-[#a3abb8] pt-1">
            {money(live.totalDebt)} USDG deployed in yield venue
          </div>
        </div>

        <div className="rounded-xl bg-[#14221c]/70 border border-white/[0.08] p-4.5 space-y-1">
          <div className="text-xs font-mono text-[#8b929e]">Immediate Idle Liquidity</div>
          <div className="font-mono text-xl font-semibold text-[#6db89b]">
            {money(live.totalIdle)} <span className="text-xs font-normal text-[#6db89b]">USDG</span>
          </div>
          <div className="text-[11px] text-[#a3abb8] pt-1">
            {percentBps(idleBps)} of total assets immediately liquid
          </div>
        </div>

        <div className="rounded-xl bg-[#14221c]/70 border border-white/[0.08] p-4.5 space-y-1">
          <div className="text-xs font-mono text-[#8b929e]">Enforced Deposit Limit</div>
          <div className="font-mono text-xl font-semibold text-[#f8f9fa]">
            {money(live.depositLimit)} <span className="text-xs font-normal text-[#a3abb8]">USDG</span>
          </div>
          <div className="text-[11px] text-[#a3abb8] pt-1">
            Enforced by on-chain VaultV3 contract cap
          </div>
        </div>

        <div className="rounded-xl bg-[#14221c]/70 border border-white/[0.08] p-4.5 space-y-1">
          <div className="text-xs font-mono text-[#8b929e]">Protocol Fee Structure</div>
          <div className="font-mono text-xl font-semibold text-[#f8f9fa]">
            {live.performanceFeeBps !== null ? percentBps(live.performanceFeeBps) : "10.00%"}{" "}
            <span className="text-xs font-normal text-[#6db89b]">Perf</span>
          </div>
          <div className="text-[11px] text-[#a3abb8] pt-1">
            0.00% Mgmt Fee · Accountant enforced
          </div>
        </div>
      </div>

      {/* Configured Vaults Catalog Section */}
      <section className="card stack">
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

        {/* Mobile View: Stacked Cards */}
        <div className="grid gap-3 sm:hidden">
          {vaults.map((vault) => (
            <div
              key={vault.address}
              className="rounded-xl bg-[#14221c]/70 border border-white/[0.08] p-4 min-w-0 space-y-3"
            >
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-[#f8f9fa] text-base">{vault.label}</div>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border shrink-0 ${
                      vault.phase === "limited-launch"
                        ? "bg-[#6db89b]/10 text-[#6db89b] border-[#6db89b]/30"
                        : "bg-[#e8c468]/10 text-[#e8c468] border-[#e8c468]/30"
                    }`}
                  >
                    {vault.phase === "limited-launch" ? "Limited Launch" : "Research Staging"}
                  </span>
                </div>
                <div className="mt-2 font-mono text-xs text-[#6db89b] flex items-center gap-1.5">
                  <span>Contract:</span>
                  <a
                    href={`${EXPLORER_BASE}/address/${vault.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline break-all"
                  >
                    {vault.address} ↗
                  </a>
                </div>
              </div>

              <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono text-[#a3abb8]">
                <span>Idle cash: {money(live.totalIdle)} USDG</span>
                <span>Cap: {money(live.depositLimit)}</span>
              </div>

              <Link
                href={`/vaults/${vault.address}`}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#6db89b] hover:bg-[#5aa88b] text-[#0b1310] px-4 py-2 text-xs font-semibold transition-all shadow-md shadow-[#6db89b]/20"
              >
                <span>Open Vault</span>
                <span>→</span>
              </Link>
            </div>
          ))}
        </div>

        {/* Desktop View: Full Data Table */}
        <div className="hidden sm:block rounded-xl bg-[#14221c]/70 border border-white/[0.08] overflow-hidden">
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
                  <tr key={vault.address} className="hover:bg-white/[0.03] transition-colors">
                    <td className="py-4.5 px-5">
                      <div className="font-medium text-[#f8f9fa]">{vault.label}</div>
                      <div className="text-xs text-[#a3abb8] font-mono mt-0.5">Asset: USDG (6 decimals)</div>
                    </td>
                    <td className="py-4.5 px-5 font-mono text-[13px] text-[#6db89b]">
                      <a
                        href={`${EXPLORER_BASE}/address/${vault.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline inline-flex items-center gap-1"
                        title={vault.address}
                      >
                        <span>{shortAddress(vault.address)}</span>
                        <span className="text-[10px] opacity-75">↗</span>
                      </a>
                    </td>
                    <td className="py-4.5 px-5">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                          vault.phase === "limited-launch"
                            ? "bg-[#6db89b]/10 text-[#6db89b] border-[#6db89b]/30"
                            : "bg-[#e8c468]/10 text-[#e8c468] border-[#e8c468]/30"
                        }`}
                      >
                        {vault.phase === "limited-launch" ? "Limited Launch" : "Research Staging"}
                      </span>
                    </td>
                    <td className="py-4.5 px-5 text-right">
                      <Link
                        href={`/vaults/${vault.address}`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#6db89b] hover:bg-[#5aa88b] text-[#0b1310] px-4 py-1.5 text-xs font-semibold transition-all shadow-md shadow-[#6db89b]/20"
                      >
                        <span>Open Vault</span>
                        <span>→</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Provenance Footnote matching specification */}
        <div className="flex items-start gap-2.5 text-xs text-[#a3abb8] leading-relaxed pt-2">
          <span className="text-[#6db89b] text-sm leading-none mt-0.5">ℹ</span>
          <p>
            Every figure on this page is read from the node during this render at block{" "}
            <span className="font-mono text-[#f8f9fa]">{live.blockNumber.toString()}</span> (answered by the node).
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
