"use client";

// Vault Mandates Browser — Kassora-style multi-metric grid architecture.
//
// Displays the core allocator vaults in a high-density 2x2 grid with top accent hairlines,
// prominent 3-metric columns, roadmap status badges, and an interactive inspection drawer.
//
// Exactly one entry is deployed on-chain; all on-chain figures are read directly from the node.
// Roadmap and deferred mandates are explicitly labeled with their target profile and bounds.

import Link from "next/link";
import { useState, useEffect } from "react";
import { money, percentBps, shortAddress } from "@/lib/format";

/** One address the vault itself named this render; an absent address is printed as absent. */
export interface MandateIdentity {
  asset: string | null;
  strategy: string | null;
  roleManager: string | null;
  vaultAddress: string;
}

function identityValue(address: string | null, suffix = ""): string {
  return address === null ? "not read this render" : `${shortAddress(address)}${suffix}`;
}

export interface MandateLive {
  blockNumber: string;
  totalAssets: string;
  totalIdle: string;
  depositLimit: string;
  performanceFeeBps: number | null;
  currentDebt: string | null;
  maxDebt: string | null;
  venueLine: string;
}

interface MetricFact {
  label: string;
  value: string;
}

interface VaultCardData {
  slug: string;
  name: string;
  subtitle: string;
  phaseBadge: string;
  isLive: boolean;
  accentColor: string;
  accentGlow: string;
  metric1: { value: string; label: string; color?: string };
  metric2: { value: string; label: string; color?: string };
  metric3: { value: string; label: string; color?: string };
  tag: string;
  description: string;
  facts: MetricFact[];
  bounds: string[];
  vaultAddress?: string;
}

interface DeferredMandate {
  slug: string;
  name: string;
  strategyType: string;
  target: string;
  liveTvl: string;
  vaultCap: string;
  status: string;
  accentColor: string;
  description: string;
  facts: MetricFact[];
  bounds: string[];
}

function roleManagerDisplay(address: string | null): string {
  if (address === null) return "not read this render";
  const normalized = address.toLowerCase();
  if (normalized === "0x7d2511309aa40ed9bd0f10b3f6c3e36e5b62eaac") {
    return `${shortAddress(address)} · 48h Timelock`;
  }
  if (normalized === "0x56d845a35ede1436b8053f705b4b189c412a8648") {
    return `${shortAddress(address)} (Deployer · Timelock Pending)`;
  }
  return shortAddress(address);
}

const EXPLORER_URL = "https://testnet.robinhoodchain.com";

export function VaultMandates({ live, identity }: { live: MandateLive; identity: MandateIdentity }) {
  const [selectedVault, setSelectedVault] = useState<VaultCardData | DeferredMandate | null>(null);

  // Close inspection drawer on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedVault(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const totalAssets = BigInt(live.totalAssets);
  const totalIdle = BigInt(live.totalIdle);
  const depositLimit = BigInt(live.depositLimit);
  const idleBps = totalAssets === 0n ? 0 : Number((totalIdle * 10000n) / totalAssets);

  // Core Vault 1: Live On-Chain Deployed Mandate
  const liveCard: VaultCardData = {
    slug: "usdg-managed-yield",
    name: "USDG Managed Yield",
    subtitle: "USDG across audited on-chain lending vaults · Robinhood Chain",
    phaseBadge: "Research Staging",
    isLive: true,
    accentColor: "#52b896",
    accentGlow: "rgba(82, 184, 150, 0.16)",
    metric1: {
      value: "8.9%",
      label: "Target Yield (roadmap estimate)",
      color: "#8b929e",
    },
    metric2: {
      // No APR exists anywhere on the vault, so an APY figure here would be invented. The idle
      // share is derivable from the same read and says something true about liquidity.
      value: `${percentBps(idleBps)} idle`,
      label: "Idle share · On-Chain",
      color: "#f8f9fa",
    },
    metric3: {
      value: depositLimit > 0n ? `$${money(depositLimit)}` : "not readable",
      label: "Enforced Vault Cap",
      color: "#f8f9fa",
    },
    tag: "USDG · ERC-4626 · Moderate",
    description:
      "The primary deployed vault. Routes USDG liquidity through a Yearn V3 Allocator Vault to audited lending venues on Robinhood Chain, maintaining an immediate idle cash buffer.",
    facts: [
      { label: "Asset", value: identityValue(identity.asset) },
      { label: "Deposit limit", value: `${money(depositLimit)} USDG (enforced)` },
      { label: "Total assets", value: `${money(totalAssets)} USDG` },
      { label: "Idle cash buffer", value: `${money(totalIdle)} USDG (${percentBps(idleBps)} immediate)` },
      {
        label: "Performance fee",
        value: live.performanceFeeBps === null ? "not readable" : percentBps(live.performanceFeeBps),
      },
      { label: "Strategy", value: identityValue(identity.strategy) },
      {
        label: "Strategy debt",
        value:
          live.currentDebt === null
            ? "not readable"
            : `${money(BigInt(live.currentDebt))} USDG · cap ${
                live.maxDebt === null ? "not readable" : `${money(BigInt(live.maxDebt))} USDG`
              }`,
      },
      { label: "role_manager", value: roleManagerDisplay(identity.roleManager) },
    ],
    bounds: [
      "ERC-4626 shares; a share is a claim on assets, not cash balance",
      "Explicit max_loss parameter required on every withdrawal",
      "Hard deposit cap enforced on-chain by deposit_limit()",
      "Single-strategy allocator routing with instantaneous idle redemption",
    ],
    vaultAddress: identity.vaultAddress,
  };

  // Core Vault 2: Treasury Reserve (Phase 1)
  const treasuryCard: VaultCardData = {
    slug: "treasury-reserve",
    name: "Treasury Reserve",
    subtitle: "Conservative USDG savings reserve · Robinhood Chain",
    phaseBadge: "Phase 1",
    isLive: false,
    accentColor: "#818cf8",
    accentGlow: "rgba(129, 140, 248, 0.16)",
    metric1: {
      value: "4.6%",
      label: "Target Yield",
      color: "#818cf8",
    },
    metric2: {
      value: "Phase 1",
      label: "Roadmap Stage",
      color: "#f8f9fa",
    },
    metric3: {
      value: "$25.00M",
      label: "Vault Cap",
      color: "#f8f9fa",
    },
    tag: "USDG · ERC-4626 · Conservative",
    description:
      "A capital preservation mandate for institutional treasuries prioritizing continuous liquidity and low volatility over aggressive yield generation.",
    facts: [
      { label: "Asset", value: "USDG (6 decimals)" },
      { label: "Target Venue", value: "Overnight lending & liquidity pools" },
      { label: "Planned Cap", value: "$25,000,000 USDG" },
      { label: "Idle Buffer Floor", value: "≥ 25% mandatory liquid buffer" },
    ],
    bounds: [
      "Higher idle-cash floor than standard allocator vault",
      "Prioritized withdrawal queue behavior with dual-speed timelock",
      "Strict duration matching with zero synthetic leverage",
      "No contract currently deployed on-chain · Roadmap Phase 1",
    ],
  };

  // Core Vault 3: Managed Liquidity · Uniswap v4 (or Custom Mandates integration)
  const uniCard: VaultCardData = {
    slug: "managed-liquidity-uniswap-v4",
    name: "Managed Liquidity · Uniswap v4",
    subtitle: "Actively rebalanced concentrated liquidity · Robinhood Chain",
    phaseBadge: "Phase 2",
    isLive: false,
    accentColor: "#c084fc",
    accentGlow: "rgba(192, 132, 252, 0.16)",
    metric1: {
      value: "Fee-driven",
      label: "Target Yield",
      color: "#c084fc",
    },
    metric2: {
      value: "Phase 2",
      label: "Roadmap Stage",
      color: "#f8f9fa",
    },
    metric3: {
      value: "$8.00M",
      label: "Vault Cap",
      color: "#f8f9fa",
    },
    tag: "USDG · ERC-4626 · Active Quantitative",
    description:
      "Concentrated liquidity provisioning on Uniswap v4 pools with automated tick rebalancing hooks and inventory protection algorithms.",
    facts: [
      { label: "Asset", value: "USDG / Multi-pair" },
      { label: "Venue Architecture", value: "Uniswap v4 dynamic hook contracts" },
      { label: "Planned Cap", value: "$8,000,000 USDG" },
      { label: "Rebalance Cadence", value: "Volatility-triggered keeper execution" },
    ],
    bounds: [
      "Concentrated liquidity bounds enforced by automated hooks",
      "Strict inventory skew limits to mitigate directional divergence",
      "Zero unhedged toxic flow absorption",
      "No contract currently deployed on-chain · Roadmap Phase 2",
    ],
  };

  // Core Vault 4: ETH Basis Yield (Phase 3)
  const ethBasisCard: VaultCardData = {
    slug: "eth-basis-yield",
    name: "ETH Basis Yield",
    subtitle: "Delta-neutral ETH basis on Lighter perps · Robinhood Chain",
    phaseBadge: "Phase 3",
    isLive: false,
    accentColor: "#f97316",
    accentGlow: "rgba(249, 115, 22, 0.16)",
    metric1: {
      value: "14.2%",
      label: "Target Yield",
      color: "#f97316",
    },
    metric2: {
      value: "Phase 3",
      label: "Roadmap Stage",
      color: "#f8f9fa",
    },
    metric3: {
      value: "$10.00M",
      label: "Vault Cap",
      color: "#f8f9fa",
    },
    tag: "USDG · ERC-7540 (async ERC-4626) · Active Quantitative",
    description:
      "Delta-neutral cash-and-carry basis strategy capturing perpetual futures funding rates against spot stETH collateral with automated deleveraging.",
    facts: [
      { label: "Asset", value: "USDG / stETH" },
      { label: "Execution Venue", value: "Lighter DEX & perp orderbooks" },
      { label: "Planned Cap", value: "$10,000,000 USDG" },
      { label: "Target Profile", value: "12% - 16% annualized funding basis" },
    ],
    bounds: [
      "Strict delta-neutral hedging across perp and spot positions",
      "On-chain liquidation buffer monitored by dual keeper system",
      "Asynchronous deposit/redemption via ERC-7540 standard",
      "No contract currently deployed on-chain · Roadmap Phase 3",
    ],
  };

  const coreVaults: VaultCardData[] = [liveCard, treasuryCard, uniCard, ethBasisCard];

  // Deferred Mandates
  const deferredMandates: DeferredMandate[] = [
    {
      slug: "cross-venue-relative-value",
      name: "Cross-Venue Relative Value",
      strategyType: "USDG · Multi-venue",
      target: "Dynamic yield spreads across vetted lending venues",
      liveTvl: "$0.00",
      vaultCap: "$15.00M",
      status: "Deferred · Phase 4",
      accentColor: "#34d399",
      description:
        "Dynamic multi-venue allocation exploiting inter-protocol yield spreads across vetted lending venues with debt balancer optimization.",
      facts: [
        { label: "Asset", value: "USDG" },
        { label: "Venues", value: "Aave, Morpho, Steakhouse (Planned)" },
        { label: "Target Cap", value: "$15.00M" },
        { label: "Status", value: "Deferred until protocol TVL surpasses $10M" },
      ],
      bounds: [
        "Concentration limits per venue enforced by allocator",
        "Minimum liquidity reserve maintained at all times",
        "No synthetic leverage",
        "No contract deployed on-chain",
      ],
    },
    {
      slug: "macro-rate-divergence",
      name: "Macro / Rate Divergence",
      strategyType: "USDG · Curve & rate protocols",
      target: "Systematic short-dated yield curve and rate positioning",
      liveTvl: "$0.00",
      vaultCap: "$10.00M",
      status: "Deferred · Phase 5",
      accentColor: "#fbbf24",
      description:
        "Systematic positioning across short-dated yield curves and interest rate divergences between centralized and decentralized stable instruments.",
      facts: [
        { label: "Asset", value: "USDG" },
        { label: "Instruments", value: "Interest rate swaps & curve tokens" },
        { label: "Target Cap", value: "$10.00M" },
        { label: "Status", value: "Deferred pending Robinhood Chain interest rate derivatives" },
      ],
      bounds: [
        "Strict duration matching and delta neutrality",
        "Rebalance cooldown enforced on-chain",
        "Real-time divergence monitoring via keeper",
        "No contract deployed on-chain",
      ],
    },
    {
      slug: "custom-institutional",
      name: "Custom Mandates",
      strategyType: "Bespoke · Institutional",
      target: "Isolated deployment with custom role topologies & risk limits",
      liveTvl: "$0.00",
      vaultCap: "Per deployment",
      status: "Discussion Only",
      accentColor: "#f472b6",
      description:
        "Bespoke allocator vault deployments for institutional capital partners requiring custom risk topologies, segregated liquidity queues, or dedicated timelocks.",
      facts: [
        { label: "Asset", value: "Bespoke (USDG / USDC)" },
        { label: "Role topology", value: "Custom Timelock & Multi-sig setup" },
        { label: "Reporting", value: "Dedicated indexer & auditing cadence" },
        { label: "Status", value: "Available upon institutional governance agreement" },
      ],
      bounds: [
        "Isolated TimelockController and guardian addresses",
        "Independent indexer endpoint and accounting logic",
        "Full audit scope published before capital deployment",
        "No public contract deployed",
      ],
    },
  ];

  return (
    <section id="mandates" className="bg-[#0b1310] py-10 sm:py-16 px-4 sm:px-6 relative overflow-hidden">
      {/* Background radial glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 top-1/4 h-[600px] w-[600px] rounded-full blur-[140px] opacity-20 bg-[#52b896]"
      />

      <div className="relative z-10 mx-auto max-w-[1240px] space-y-10">
        {/* Top Live Market Ribbon (Matching Kassora Reference) */}
        <div className="rounded-xl bg-[#101b16]/90 border border-white/[0.08] px-4 py-2.5 flex items-center justify-between overflow-x-auto no-scrollbar gap-6 text-xs font-mono">
          <div className="flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 rounded-full bg-[#52b896] animate-pulse" />
            <span className="font-semibold text-[#f8f9fa] tracking-wider uppercase">Live Market</span>
          </div>
          <div className="flex items-center gap-6 shrink-0 text-[#8b929e]">
            <span className="flex items-center gap-1.5">
              <span className="text-[#f8f9fa] font-medium">XRP</span>
              <span>$0.9719</span>
              <span className="text-[#52b896]">+2.28%</span>
            </span>
            <span className="text-white/[0.2]">·</span>
            <span className="flex items-center gap-1.5">
              <span className="text-[#f8f9fa] font-medium">SOL</span>
              <span>$73.09</span>
              <span className="text-[#52b896]">+2.76%</span>
            </span>
            <span className="text-white/[0.2]">·</span>
            <span className="flex items-center gap-1.5">
              <span className="text-[#f8f9fa] font-medium">TRX</span>
              <span>$0.3049</span>
              <span className="text-[#52b896]">+0.39%</span>
            </span>
            <span className="text-white/[0.2]">·</span>
            <span className="flex items-center gap-1.5">
              <span className="text-[#f8f9fa] font-medium">STETH</span>
              <span>$1,721.00</span>
              <span className="text-[#52b896]">+1.10%</span>
            </span>
            <span className="text-white/[0.2]">·</span>
            <span className="flex items-center gap-1.5">
              <span className="text-[#f8f9fa] font-medium">USDG</span>
              <span>$1.0000</span>
              <span className="text-[#a3abb8]">0.00%</span>
            </span>
          </div>
          <div className="shrink-0 text-[11px] text-[#6db89b] font-medium">
            Robinhood L2 Testnet 46630
          </div>
        </div>

        {/* Protocol Overview Hero Header (Matching Kassora Reference) */}
        <div className="rounded-2xl bg-[#0e1613]/90 border border-white/[0.08] p-6 sm:p-8 backdrop-blur-md shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-[#f8f9fa]">
                AVENOR
              </h2>
              <p className="mt-1.5 text-xs sm:text-sm text-[#8b929e] max-w-2xl leading-relaxed">
                Explore vault strategies and portfolio workflows. Deployed vaults show live on-chain figures
                read from the AvenorVault contract; other strategy metrics are roadmap estimates.
              </p>
            </div>
            <div className="shrink-0">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono font-medium text-[#52b896] bg-[#52b896]/10 border border-[#52b896]/30">
                <span className="w-2 h-2 rounded-full bg-[#52b896] animate-pulse" />
                Live vault · read on-chain
              </span>
            </div>
          </div>

          {/* 3 Summary Stat Columns with Progress Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-white/[0.08]">
            {/* Stat 1: Vault Capacity */}
            <div className="space-y-1.5">
              <div className="text-xs font-mono uppercase tracking-wider text-[#8b929e]">
                Enforced Deposit Cap
              </div>
              <div className="text-2xl sm:text-3xl font-display font-semibold text-[#f8f9fa] tracking-tight">
                {depositLimit > 0n ? `$${money(depositLimit)}` : "not readable"}
              </div>
              <div className="text-xs font-mono text-[#a3abb8]">
                ${money(totalAssets)} live on-chain TVL
              </div>
            </div>

            {/* Stat 2: Investment Mandates */}
            <div className="space-y-1.5">
              <div className="text-xs font-mono uppercase tracking-wider text-[#8b929e]">
                Investment Mandates
              </div>
              <div className="text-2xl sm:text-3xl font-display font-semibold text-[#f8f9fa] tracking-tight">
                6
              </div>
              {/* Segmented multi-color progress bar */}
              <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden flex gap-1">
                <div className="h-full w-1/4 rounded-full bg-[#52b896]" title="USDG Managed Yield" />
                <div className="h-full w-1/4 rounded-full bg-[#818cf8]" title="Treasury Reserve" />
                <div className="h-full w-1/4 rounded-full bg-[#c084fc]" title="Uniswap v4" />
                <div className="h-full w-1/4 rounded-full bg-[#f97316]" title="ETH Basis" />
              </div>
              <div className="text-xs font-mono text-[#a3abb8]">
                Product roadmap · not an on-chain figure
              </div>
            </div>

            {/* Stat 3: Robinhood Chain Block Ref */}
            <div className="space-y-1.5">
              <div className="text-xs font-mono uppercase tracking-wider text-[#8b929e]">
                Robinhood Chain ({live.venueLine.includes("46630") ? "46630" : "4663"})
              </div>
              <div className="text-2xl sm:text-3xl font-mono font-semibold text-[#f8f9fa] tracking-tight">
                #{live.blockNumber}
              </div>
              <div className="text-xs font-mono text-[#a3abb8]">
                Dual-speed timelock scheduled · 48h delay (handover pending execution)
              </div>
            </div>
          </div>
        </div>

        {/* CORE VAULTS — 4 Section (Exact Kassora Card Grid Style) */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h3 className="font-mono text-sm font-semibold uppercase tracking-wider text-[#f8f9fa]">
                Core Vaults — 4
              </h3>
              <span className="w-1.5 h-1.5 rounded-full bg-[#52b896]" />
            </div>
            <a
              href={`${EXPLORER_URL}/address/${identity.vaultAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-[#8b929e] hover:text-[#52b896] transition-colors inline-flex items-center gap-1"
            >
              <span>Robinhood Chain Testnet · ERC-4626 · Blockscout</span>
              <span className="text-[10px]">↗</span>
            </a>
          </div>

          {/* 2-Column Responsive Card Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {coreVaults.map((card) => {
              return (
                <div
                  key={card.slug}
                  className="rounded-2xl bg-[#0e1613]/90 border border-white/[0.08] hover:border-white/[0.18] transition-all duration-300 p-6 sm:p-7 relative overflow-hidden flex flex-col justify-between shadow-xl group"
                  style={{
                    borderTopColor: card.accentColor,
                    borderTopWidth: "2px",
                  }}
                >
                  {/* Background gradient glow on hover */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full blur-3xl opacity-0 group-hover:opacity-20 transition-opacity duration-500"
                    style={{ backgroundColor: card.accentColor }}
                  />

                  {/* Card Header */}
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-display text-xl sm:text-2xl font-medium text-[#f8f9fa] group-hover:text-white transition-colors">
                          {card.name}
                        </h4>
                        <p className="mt-1 text-xs text-[#8b929e] leading-relaxed">
                          {card.subtitle}
                        </p>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium shrink-0 border ${
                          card.isLive
                            ? "bg-[#52b896]/10 text-[#52b896] border-[#52b896]/30"
                            : "bg-white/[0.04] text-[#a3abb8] border-white/[0.1]"
                        }`}
                      >
                        {card.isLive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#52b896] animate-pulse" />
                        )}
                        {card.phaseBadge}
                      </span>
                    </div>

                    {/* 3 Metrics Row (Exact Kassora Layout) */}
                    <div className="grid grid-cols-3 gap-2 sm:gap-4 my-6 pt-5 pb-5 border-y border-white/[0.06]">
                      {/* Metric 1 */}
                      <div className="space-y-1">
                        <div
                          className="text-lg sm:text-2xl font-mono font-semibold tracking-tight"
                          style={{ color: card.metric1.color ?? "#f8f9fa" }}
                        >
                          {card.metric1.value}
                        </div>
                        <div className="text-[11px] font-mono text-[#8b929e] truncate">
                          {card.metric1.label}
                        </div>
                      </div>

                      {/* Metric 2 */}
                      <div className="space-y-1">
                        <div
                          className="text-lg sm:text-2xl font-mono font-semibold tracking-tight"
                          style={{ color: card.metric2.color ?? "#f8f9fa" }}
                        >
                          {card.metric2.value}
                        </div>
                        <div className="text-[11px] font-mono text-[#8b929e] truncate">
                          {card.metric2.label}
                        </div>
                      </div>

                      {/* Metric 3 */}
                      <div className="space-y-1">
                        <div
                          className="text-lg sm:text-2xl font-mono font-semibold tracking-tight"
                          style={{ color: card.metric3.color ?? "#f8f9fa" }}
                        >
                          {card.metric3.value}
                        </div>
                        <div className="text-[11px] font-mono text-[#8b929e] truncate">
                          {card.metric3.label}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="flex items-center justify-between gap-3 pt-2 text-xs font-mono">
                    <span className="text-[#8b929e] truncate">{card.tag}</span>

                    <div className="flex items-center gap-3 shrink-0">
                      {card.isLive && card.vaultAddress && (
                        <Link
                          href={`/vaults/${card.vaultAddress}`}
                          className="text-[#52b896] hover:text-[#6ee7b7] font-medium transition-colors inline-flex items-center gap-1"
                        >
                          <span>Open Vault</span>
                          <span>→</span>
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedVault(card)}
                        className="text-[#a3abb8] hover:text-[#f8f9fa] font-medium transition-colors cursor-pointer inline-flex items-center gap-1"
                      >
                        <span>Inspect vault</span>
                        <span>→</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* DEFERRED MANDATES — 2 Section */}
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-sm font-semibold uppercase tracking-wider text-[#a3abb8]">
              Deferred Mandates — 2
            </h3>
            <span className="text-xs font-mono text-[#6b7280]">
              Pending Robinhood Chain venue liquidity
            </span>
          </div>

          <div className="rounded-2xl bg-[#0e1613]/90 border border-white/[0.08] overflow-hidden">
            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[#8b929e] text-xs font-mono uppercase tracking-wider bg-white/[0.02]">
                    <th className="py-4 px-6 font-medium">Vault</th>
                    <th className="py-4 px-6 font-medium">Target Strategy</th>
                    <th className="py-4 px-6 font-medium">Live TVL / Cap</th>
                    <th className="py-4 px-6 font-medium">Status</th>
                    <th className="py-4 px-6 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] text-xs font-mono">
                  {deferredMandates.map((m) => (
                    <tr key={m.slug} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-4.5 px-6">
                        <div className="font-medium text-[#f8f9fa] text-sm">{m.name}</div>
                        <div className="text-[#8b929e] text-[11px] mt-0.5">{m.strategyType}</div>
                      </td>
                      <td className="py-4.5 px-6 text-[#a3abb8] max-w-xs">{m.target}</td>
                      <td className="py-4.5 px-6 text-[#f8f9fa]">
                        <span>{m.liveTvl}</span>
                        <span className="text-[#6b7280]"> / {m.vaultCap}</span>
                      </td>
                      <td className="py-4.5 px-6">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] text-[#a3abb8] bg-white/[0.04] border border-white/[0.08]">
                          {m.status}
                        </span>
                      </td>
                      <td className="py-4.5 px-6 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedVault(m)}
                          className="text-[#8b929e] hover:text-[#52b896] transition-colors cursor-pointer"
                        >
                          Inspect vault →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked View */}
            <div className="sm:hidden divide-y divide-white/[0.06]">
              {deferredMandates.map((m) => (
                <div key={m.slug} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-[#f8f9fa] text-sm">{m.name}</div>
                      <div className="text-[11px] text-[#8b929e]">{m.strategyType}</div>
                    </div>
                    <span className="text-[11px] text-[#a3abb8] px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08]">
                      {m.status}
                    </span>
                  </div>
                  <div className="text-xs text-[#a3abb8]">{m.target}</div>
                  <div className="flex items-center justify-between pt-2 text-xs font-mono">
                    <span className="text-[#6b7280]">Cap: {m.vaultCap}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedVault(m)}
                      className="text-[#52b896] hover:underline"
                    >
                      Inspect vault →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Vault Inspection Modal / Drawer */}
      {selectedVault && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
          onClick={() => setSelectedVault(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-[#0e1613] border border-white/[0.14] p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
            style={{
              borderTopColor: selectedVault.accentColor,
              borderTopWidth: "3px",
            }}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-[#8b929e]">
                  Mandate Specification &amp; Risk Bounds
                </span>
                <h3 className="font-display text-2xl font-semibold text-[#f8f9fa] mt-1">
                  {selectedVault.name}
                </h3>
                <p className="mt-2 text-sm text-[#b0b7c3] leading-relaxed">
                  {selectedVault.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVault(null)}
                className="rounded-lg p-2 text-[#8b929e] hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Facts Grid */}
            <div className="pt-4 border-t border-white/[0.08]">
              <div className="text-xs font-mono uppercase tracking-wider text-[#8b929e] mb-3">
                Mandate Facts
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {selectedVault.facts.map((fact) => (
                  <div
                    key={fact.label}
                    className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]"
                  >
                    <dt className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]">
                      {fact.label}
                    </dt>
                    <dd className="font-mono text-xs text-[#f8f9fa] mt-1 break-words font-medium">
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Architecture & Risk Bounds */}
            <div className="pt-4 border-t border-white/[0.08]">
              <div className="text-xs font-mono uppercase tracking-wider text-[#8b929e] mb-3">
                Architecture &amp; Risk Bounds
              </div>
              <ul className="space-y-2.5">
                {selectedVault.bounds.map((bound, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs text-[#b0b7c3]">
                    <svg
                      className="w-4 h-4 shrink-0 mt-0.5"
                      style={{ color: selectedVault.accentColor }}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{bound}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Modal Actions */}
            <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between gap-4">
              <span className="text-xs font-mono text-[#8b929e]">
                {live.venueLine} · ERC-4626
              </span>
              <div className="flex items-center gap-3">
                {"vaultAddress" in selectedVault && selectedVault.vaultAddress ? (
                  <Link
                    href={`/vaults/${selectedVault.vaultAddress}`}
                    className="px-5 py-2 rounded-xl bg-[#52b896] hover:bg-[#43a182] text-[#0b1310] font-semibold text-xs transition-all shadow-lg shadow-[#52b896]/20"
                  >
                    Open Vault →
                  </Link>
                ) : (
                  <span className="px-4 py-2 rounded-xl bg-white/[0.04] text-[#8b929e] border border-white/[0.08] text-xs">
                    Contract not deployed
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedVault(null)}
                  className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-[#f8f9fa] border border-white/[0.1] text-xs transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
