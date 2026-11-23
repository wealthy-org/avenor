"use client";

import Link from "next/link";
import { useState } from "react";

interface Mandate {
  slug: string;
  name: string;
  asset: string;
  venue: string;
  benchmark: string;
  cap: string;
  riskTier: string;
  status: string;
  isLive: boolean;
  accentColor: string;
  accentGlow: string;
  vaultAddress?: string;
  description: string;
  highlights: string[];
}

const MANDATES: Mandate[] = [
  {
    slug: "usdg-managed-yield",
    name: "USDG Managed Yield",
    asset: "USDG (0x5c7c...)",
    venue: "Morpho Blue · steakUSDG Vault",
    benchmark: "3.71% APY",
    cap: "$50,000 USDG",
    riskTier: "Conservative Core",
    status: "Live On-Chain",
    isLive: true,
    accentColor: "#6db89b",
    accentGlow: "rgba(109, 184, 155, 0.15)",
    vaultAddress: "0x5aeBcE3956FeD4542EDBe75d420497378E3B18CA",
    description:
      "A flagship ERC-4626 allocator vault capturing audited lending returns from the Morpho Blue steakUSDG market on Robinhood Chain, maintaining dual-speed 48-hour timelock governance and strict zero-loss exit enforcement.",
    highlights: [
      "Standard ERC-4626 share minting & redemptions",
      "Explicit zero-loss tolerance parameter (max_loss = 0)",
      "Automated keeper reconciliation & idle liquidity buffering",
      "Immutable Yearn V3 allocator core architecture",
    ],
  },
  {
    slug: "treasury-reserve",
    name: "Treasury Reserve",
    asset: "USDG / Cash Equivalents",
    venue: "Short-Duration Lending & Idle Reserves",
    benchmark: "3.20% Benchmark",
    cap: "$250,000 USDG",
    riskTier: "Capital Preservation",
    status: "Planned Mandate",
    isLive: false,
    accentColor: "#60a5fa",
    accentGlow: "rgba(96, 165, 250, 0.15)",
    description:
      "Engineered for corporate treasuries and protocols requiring same-block liquidity guarantees and zero price risk with overnight yield collection.",
    highlights: [
      "90%+ instant liquidity allocation",
      "Automated withdrawal queue prioritization",
      "Zero delta exposure and strict venue limits",
      "Deterministic accounting without synthetic rehypothecation",
    ],
  },
  {
    slug: "eth-basis-yield",
    name: "ETH Basis Yield",
    asset: "WETH",
    venue: "Perpetual Funding Rate Arbitrage",
    benchmark: "8.40% Benchmark",
    cap: "500 WETH",
    riskTier: "Delta Neutral",
    status: "Planned Mandate",
    isLive: false,
    accentColor: "#c084fc",
    accentGlow: "rgba(192, 132, 252, 0.15)",
    description:
      "Captures basis yield from futures funding rates on Robinhood Chain while hedging 100% of directional spot ETH volatility.",
    highlights: [
      "Systematic funding rate delta hedging",
      "Automated roll execution via keeper network",
      "Isolated margin envelopes with strict liquidation buffers",
      "Transparent basis yield attribution",
    ],
  },
  {
    slug: "liquid-staking-rv",
    name: "Liquid Staking Relative Value",
    asset: "LST / LRT",
    venue: "Dynamic Cross-LST Rebalancing",
    benchmark: "4.85% Benchmark",
    cap: "1,000 ETH",
    riskTier: "Moderate",
    status: "Planned Mandate",
    isLive: false,
    accentColor: "#34d399",
    accentGlow: "rgba(52, 211, 153, 0.15)",
    description:
      "Capitalizes on yield spreads, staking incentives, and temporary depeg discounts across liquid staked derivatives.",
    highlights: [
      "Dynamic allocation to highest risk-adjusted validator set",
      "Rebalancing trigger guards and slippage limits",
      "Decoupled strategy accounting via Yearn V3 adapters",
      "Real-time staking discount monitoring",
    ],
  },
  {
    slug: "macro-factor-rebalance",
    name: "Macro Factor Rebalance",
    asset: "Multi-Asset Basket",
    venue: "Decentralized Liquidity Pools",
    benchmark: "11.20% Benchmark",
    cap: "$500,000 USDG",
    riskTier: "Systematic Growth",
    status: "Planned Mandate",
    isLive: false,
    accentColor: "#fbbf24",
    accentGlow: "rgba(251, 191, 36, 0.15)",
    description:
      "Quantitative multi-asset momentum and factor rebalancing designed for resilient long-term upside across market cycles.",
    highlights: [
      "Trend following and mean reversion rulesets",
      "Strict portfolio draw-down circuits",
      "Decentralized oracle feed cross-validation",
      "Dual timelock approval on strategy parameters",
    ],
  },
  {
    slug: "custom-institutional-mandates",
    name: "Custom Mandates",
    asset: "Bespoke Portfolio",
    venue: "Dedicated Strategy Pipeline",
    benchmark: "Custom Target",
    cap: "Institutional Scale",
    riskTier: "Institutional",
    status: "Inquiries Open",
    isLive: false,
    accentColor: "#f472b6",
    accentGlow: "rgba(244, 114, 182, 0.15)",
    description:
      "Dedicated ERC-4626 vault deployments tailored for family offices and institutional treasuries with custom compliance, multi-sig signer rings, and specific risk criteria.",
    highlights: [
      "Ring-fenced smart contract deployment",
      "Custom multi-sig & guardian topology",
      "Custom reporting frequency and indexer endpoints",
      "Direct settlement support",
    ],
  },
];

export function VaultMandates() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeMandate = MANDATES[selectedIndex];

  return (
    <section
      id="vaults"
      className="bg-[#0b1310]/75 bg-dot-matrix py-20 md:py-28 px-4 sm:px-6 relative overflow-hidden"
    >
      {/* Ambient background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 top-1/3 h-[520px] w-[520px] rounded-full blur-[120px] transition-colors duration-500"
        style={{ backgroundColor: activeMandate.accentGlow }}
      />

      <div className="relative z-10 mx-auto max-w-[1200px]">
        {/* Section Header */}
        <div className="max-w-2xl">
          <h2 className="font-display text-[clamp(2rem,3.6vw,3.1rem)] font-medium tracking-[-0.025em] text-[#f8f9fa]">
            One vault, one strategy.
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#9ca3af]">
            Each vault executes a single, clearly mandated strategy governed by
            explicit risk limits and standardized ERC-4626 share accounting on
            Robinhood Chain. Each mandate maps to a venue that already runs on the
            chain.
          </p>
        </div>

        {/* Split Grid Browser */}
        <div className="mt-12 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-8 items-start">
          {/* Left Column: Selector List */}
          <div className="space-y-2">
            <div className="px-3 pb-2 font-mono text-xs tabular-nums text-[#8b929e]">
              {String(selectedIndex + 1).padStart(2, "0")} /{" "}
              {String(MANDATES.length).padStart(2, "0")}
            </div>

            {MANDATES.map((mandate, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={mandate.slug}
                  type="button"
                  onClick={() => setSelectedIndex(idx)}
                  className={`w-full text-left rounded-xl px-4 py-3.5 transition-all cursor-pointer border ${
                    isSelected
                      ? "bg-[#14221c] border-white/[0.14]"
                      : "bg-transparent border-transparent hover:bg-white/[0.03]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`text-sm font-medium ${
                        isSelected ? "text-[#f8f9fa]" : "text-[#8b929e]"
                      }`}
                    >
                      {mandate.name}
                    </span>
                    <span
                      className="font-mono text-xs tabular-nums shrink-0"
                      style={{
                        color: isSelected ? mandate.accentColor : "#6b7280",
                      }}
                    >
                      {mandate.benchmark}
                    </span>
                  </div>

                  {isSelected && (
                    <div
                      className="mt-3 h-[2px] w-16 rounded-full"
                      style={{ backgroundColor: mandate.accentColor }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Column: Detailed Card */}
          <div className="space-y-4">
            <div
              className="rounded-xl bg-[#14221c] border border-white/[0.08] p-6 sm:p-7 relative overflow-hidden transition-all duration-300"
              style={{
                borderTopColor: activeMandate.accentColor,
                borderTopWidth: "2px",
              }}
            >
              {/* Header inside card */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="max-w-xl">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-display text-2xl font-medium text-[#f8f9fa]">
                      {activeMandate.name}
                    </h3>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                        activeMandate.isLive
                          ? "bg-[#6db89b]/10 text-[#6db89b] border-[#6db89b]/30"
                          : "bg-white/[0.05] text-[#9ca3af] border-white/[0.1]"
                      }`}
                    >
                      {activeMandate.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-[#b0b7c3] leading-relaxed">
                    {activeMandate.description}
                  </p>
                </div>

                {/* Benchmark Tag */}
                <div className="sm:text-right shrink-0">
                  <div
                    className="font-mono text-2xl font-medium"
                    style={{ color: activeMandate.accentColor }}
                  >
                    {activeMandate.benchmark}
                  </div>
                  <div className="text-[11px] text-[#6b7280] mt-0.5">
                    Target Benchmark
                  </div>
                </div>
              </div>

              {/* Metric Row */}
              <div className="mt-6 pt-6 border-t border-white/[0.08] grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <div className="text-[11px] text-[#8b929e] uppercase tracking-wider">
                    Asset
                  </div>
                  <div className="font-mono text-sm text-[#f8f9fa] mt-1 truncate">
                    {activeMandate.asset}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#8b929e] uppercase tracking-wider">
                    Strategy Venue
                  </div>
                  <div className="text-sm text-[#f8f9fa] mt-1 truncate">
                    {activeMandate.venue}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#8b929e] uppercase tracking-wider">
                    Deposit Cap
                  </div>
                  <div className="font-mono text-sm text-[#f8f9fa] mt-1">
                    {activeMandate.cap}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#8b929e] uppercase tracking-wider">
                    Risk Category
                  </div>
                  <div className="text-sm text-[#f8f9fa] mt-1">
                    {activeMandate.riskTier}
                  </div>
                </div>
              </div>

              {/* Highlights List */}
              <div className="mt-6 pt-6 border-t border-white/[0.08]">
                <div className="text-xs font-medium text-[#8b929e] uppercase tracking-wider mb-3">
                  Architecture & Risk Bounds
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {activeMandate.highlights.map((h, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2.5 text-xs text-[#b0b7c3]"
                    >
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
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span>{h}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-8 pt-6 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-4">
                <div className="text-xs text-[#8b929e] font-mono">
                  Robinhood Chain (4663) · ERC-4626
                </div>

                <div className="flex items-center gap-3">
                  {activeMandate.vaultAddress ? (
                    <>
                      <Link
                        href={`/vaults/${activeMandate.vaultAddress}`}
                        className="rounded-full bg-[#f8f9fa] text-[#0b1310] px-5 py-2.5 text-xs font-semibold hover:bg-white hover:scale-105 transition-all shadow-[0_0_16px_rgba(255,255,255,0.15)]"
                      >
                        Open Vault Interface
                      </Link>
                      <Link
                        href={`/vaults/${activeMandate.vaultAddress}/deposit`}
                        className="rounded-full px-4 py-2.5 text-xs font-medium text-[#d1d5db] hover:text-[#f8f9fa] border border-white/[0.12] hover:border-white/[0.2] bg-white/[0.03] transition-colors"
                      >
                        Deposit USDG
                      </Link>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="rounded-full bg-white/[0.05] text-[#6b7280] border border-white/[0.08] px-5 py-2.5 text-xs font-medium cursor-not-allowed"
                    >
                      Mandate In Development
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
