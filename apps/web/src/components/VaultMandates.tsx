"use client";

// Mandate browser. Exactly one entry is a deployment; the rest are roadmap entries that carry no
// rate and no cap, because nothing is deployed and no venue quotes a number that could be shown.
// The previous version printed APY benchmarks for all six and called one of them "Live On-Chain"
// while five had no contract — that is the class of claim this file exists to prevent.

import Link from "next/link";
import { useState } from "react";
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

interface Mandate {
  slug: string;
  name: string;
  /** Short status line under the name. Never a rate. */
  status: string;
  offered: boolean;
  accentColor: string;
  accentGlow: string;
  description: string;
  facts: { label: string; value: string }[];
  bounds: string[];
  vaultAddress?: string;
}

/**
 * The facts the deployed entry prints, all taken from the one snapshot the page read for this request.
 * A field the read could not produce arrives as `null` and prints as "not readable" instead of a zero.
 */
export interface MandateLive {
  blockNumber: string;
  totalAssets: string;
  totalIdle: string;
  depositLimit: string;
  performanceFeeBps: number | null;
  currentDebt: string | null;
  maxDebt: string | null;
  /** Where the deployed entry was read: the chain this render talked to, never a hard-coded network. */
  venueLine: string;
}

function deployedMandate(live: MandateLive, identity: MandateIdentity): Mandate {
  const totalAssets = BigInt(live.totalAssets);
  const totalIdle = BigInt(live.totalIdle);
  const depositLimit = BigInt(live.depositLimit);
  const idleBps = totalAssets === 0n ? 0 : Number((totalIdle * 10000n) / totalAssets);

  return {
    slug: "usdg-managed-yield",
    name: "USDG Managed Yield",
    status: live.venueLine,
    offered: true,
    accentColor: "#6db89b",
    accentGlow: "rgba(109, 184, 155, 0.15)",
    description:
      "The only mandate with a contract. It routes USDG through a Yearn V3 allocator vault to one strategy. The strategy holds nothing at this block, so no venue is named: an unfunded target is not a position.",
    facts: [
      { label: "Asset", value: identityValue(identity.asset) },
      { label: "Deposit limit", value: `${money(depositLimit)} USDG` },
      { label: "Total assets", value: `${money(totalAssets)} USDG` },
      { label: "Idle cash", value: `${money(totalIdle)} USDG · ${percentBps(idleBps)}` },
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
      { label: "role_manager", value: identityValue(identity.roleManager, " · 48h") },
    ],
    bounds: [
      "ERC-4626 shares; a share is a claim, not a balance",
      "Explicit max_loss on every withdrawal — no default is assumed",
      "Deposit cap enforced by deposit_limit() in the contract",
      "No rate is quoted: the vault reports assets, not a yield target",
    ],
    vaultAddress: identity.vaultAddress,
  };
}

const ROADMAP: Mandate[] = [
  {
    slug: "treasury-reserve",
    name: "Treasury Reserve",
    status: "Roadmap · no contract deployed",
    offered: false,
    accentColor: "#60a5fa",
    accentGlow: "rgba(96, 165, 250, 0.15)",
    description:
      "A mandate shape for treasuries that need a liquidity-first split. Nothing is deployed, so this page shows no cap, no rate, and no venue.",
    facts: [
      { label: "Asset", value: "USDG" },
      { label: "Strategy venue", value: "Not selected" },
      { label: "Deposit limit", value: "Not deployed" },
      { label: "Rate", value: "Not quoted" },
    ],
    bounds: [
      "Would require a higher idle-cash floor than the deployed vault",
      "Withdrawal queue behaviour would be specified before deployment",
      "No synthetic accounting",
      "No contract exists, so no audit scope exists",
    ],
  },
  {
    slug: "eth-basis-yield",
    name: "ETH Basis Yield",
    status: "Roadmap · no contract deployed",
    offered: false,
    accentColor: "#c084fc",
    accentGlow: "rgba(192, 132, 252, 0.15)",
    description:
      "A mandate shape for basis trades. Listed here so the catalogue is not silently narrowed; it carries no figures because a figure would imply a venue that does not exist yet.",
    facts: [
      { label: "Asset", value: "Not selected" },
      { label: "Strategy venue", value: "Not selected" },
      { label: "Deposit limit", value: "Not deployed" },
      { label: "Rate", value: "Not quoted" },
    ],
    bounds: [
      "Hedging and margin rules would be written before any deposit",
      "Liquidation buffers would be an explicit on-chain parameter",
      "Keeper roll schedule would be published",
      "No contract exists, so no audit scope exists",
    ],
  },
  {
    slug: "cross-venue-relative-value",
    name: "Cross-Venue Relative Value",
    status: "Roadmap · no contract deployed",
    offered: false,
    accentColor: "#34d399",
    accentGlow: "rgba(52, 211, 153, 0.15)",
    description:
      "Dynamic allocation exploiting yield spreads across vetted lending venues and automated market makers. No contract is deployed yet; carries no rates or caps.",
    facts: [
      { label: "Asset", value: "USDG" },
      { label: "Strategy venue", value: "Multi-venue (planned)" },
      { label: "Deposit limit", value: "Not deployed" },
      { label: "Rate", value: "Not quoted" },
    ],
    bounds: [
      "Concentration limits per venue enforced by debt allocator",
      "Minimum liquidity reserve maintained at all times",
      "No synthetic leverage",
      "No contract exists, so no audit scope exists",
    ],
  },
  {
    slug: "macro-rate-divergence",
    name: "Macro / Rate Divergence",
    status: "Roadmap · no contract deployed",
    offered: false,
    accentColor: "#fbbf24",
    accentGlow: "rgba(251, 191, 36, 0.15)",
    description:
      "Systematic positioning across short-dated yield curves and interest rate divergences. Listed for catalog completeness; no contract deployed, no rates quoted.",
    facts: [
      { label: "Asset", value: "USDG" },
      { label: "Strategy venue", value: "Curve / Rate protocols" },
      { label: "Deposit limit", value: "Not deployed" },
      { label: "Rate", value: "Not quoted" },
    ],
    bounds: [
      "Strict duration matching and delta neutrality",
      "Rebalance cooldown enforced on-chain",
      "Real-time divergence monitoring via keeper",
      "No contract exists, so no audit scope exists",
    ],
  },
  {
    slug: "custom-institutional",
    name: "Custom Mandates",
    status: "Roadmap · discussion only",
    offered: false,
    accentColor: "#f472b6",
    accentGlow: "rgba(244, 114, 182, 0.15)",
    description:
      "Separate deployments for an institution that needs its own role topology. Reached through a conversation, not through this interface.",
    facts: [
      { label: "Asset", value: "Bespoke" },
      { label: "Strategy venue", value: "Per mandate" },
      { label: "Deposit limit", value: "Per deployment" },
      { label: "Rate", value: "Not quoted" },
    ],
    bounds: [
      "Own TimelockController and guardian addresses",
      "Own indexer endpoint and reporting cadence",
      "Own audit scope, published before deposits open",
      "No contract exists, so no audit scope exists",
    ],
  },
];

export function VaultMandates({ live, identity }: { live: MandateLive; identity: MandateIdentity }) {
  const mandates = [deployedMandate(live, identity), ...ROADMAP];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const active = mandates[selectedIndex];

  return (
    <section
      id="mandates"
      className="bg-[#0b1310]/75 bg-dot-matrix py-14 md:py-28 px-4 sm:px-6 relative overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 top-1/3 h-[520px] w-[520px] rounded-full blur-[120px] transition-colors duration-500"
        style={{ backgroundColor: active.accentGlow }}
      />

      <div className="relative z-10 mx-auto max-w-[1200px]">
        <div className="max-w-2xl">
          <h2 className="font-display text-[clamp(2rem,3.6vw,3.1rem)] font-medium tracking-[-0.025em] text-[#f8f9fa]">
            One vault, one strategy.
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#9ca3af]">
            Each vault runs a single mandated strategy under explicit risk limits and standard
            ERC-4626 share accounting. One mandate is deployed; the others are shapes on a roadmap and
            are labelled as such.
          </p>
        </div>

        {/* Mobile tab strip */}
        <div className="mt-6 flex lg:hidden overflow-x-auto gap-2 pb-2 no-scrollbar">
          {mandates.map((mandate, index) => {
            const isSelected = index === selectedIndex;
            return (
              <button
                key={mandate.slug}
                type="button"
                onClick={() => setSelectedIndex(index)}
                className={`whitespace-nowrap px-3.5 py-2 rounded-full text-xs font-medium shrink-0 transition-all cursor-pointer border ${
                  isSelected
                    ? "bg-[#14221c] text-[#f8f9fa] border-white/[0.2]"
                    : "bg-[#101b16]/70 text-[#a3abb8] border-white/[0.08] hover:text-[#f8f9fa]"
                }`}
              >
                <span>{mandate.name}</span>
                {!mandate.offered && (
                  <span className="ml-1.5 font-mono text-[11px] uppercase tracking-wide text-[#a3abb8]">
                    roadmap
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 lg:mt-12 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-8 items-start">
          {/* Selector list (desktop) */}
          <div className="hidden lg:block space-y-2">
            {/* "01 / 04" alone read as unexplained pagination; the label says what is being counted. */}
            <div className="px-3 pb-2 flex items-baseline justify-between gap-3 font-mono text-xs tabular-nums text-[#a3abb8]">
              <span className="uppercase tracking-[0.08em]">Mandate</span>
              <span>
                {String(selectedIndex + 1).padStart(2, "0")} of {String(mandates.length).padStart(2, "0")}
              </span>
            </div>

            {mandates.map((mandate, index) => {
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={mandate.slug}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={`w-full text-left rounded-xl px-4 py-3.5 transition-all cursor-pointer border ${
                    isSelected
                      ? "bg-[#14221c] border-white/[0.14]"
                      : "bg-transparent border-transparent hover:bg-white/[0.03]"
                  }`}
                >
                  <span
                    className={`block text-sm font-medium ${
                      isSelected ? "text-[#f8f9fa]" : "text-[#a3abb8]"
                    }`}
                  >
                    {mandate.name}
                  </span>
                  <span className="mt-1 block font-mono text-[11px] uppercase tracking-wide text-[#a3abb8]">
                    {mandate.offered ? "deployed" : "roadmap"}
                  </span>
                  {isSelected && (
                    <span
                      className="mt-3 block h-[2px] w-16 rounded-full"
                      style={{ backgroundColor: mandate.accentColor }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Detail card */}
          <div
            className="rounded-xl bg-[#14221c] border border-white/[0.08] p-6 sm:p-7 relative overflow-hidden transition-all duration-300"
            style={{ borderTopColor: active.accentColor, borderTopWidth: "2px" }}
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="max-w-xl min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-display text-2xl font-medium text-[#f8f9fa]">{active.name}</h3>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                      active.offered
                        ? "bg-[#6db89b]/10 text-[#6db89b] border-[#6db89b]/30"
                        : "bg-[#e8c468]/10 text-[#e8c468] border-[#e8c468]/30"
                    }`}
                  >
                    {active.status}
                  </span>
                </div>
                <p className="mt-3 text-sm text-[#b0b7c3] leading-relaxed">{active.description}</p>
              </div>

              <div className="sm:text-right shrink-0">
                <div className="font-mono text-sm font-medium" style={{ color: active.accentColor }}>
                  {active.offered ? "block " + live.blockNumber : "not quoted"}
                </div>
                <div className="text-xs text-[#a3abb8] mt-0.5">
                  {active.offered ? "block of record" : "no rate exists"}
                </div>
              </div>
            </div>

            <dl className="mt-6 pt-6 border-t border-white/[0.08] grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              {active.facts.map((fact) => (
                <div key={fact.label}>
                  <dt className="text-[11px] text-[#a3abb8] uppercase tracking-wider">{fact.label}</dt>
                  <dd className="font-mono text-sm text-[#f8f9fa] mt-1 break-words">{fact.value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 pt-6 border-t border-white/[0.08]">
              <div className="text-xs font-medium text-[#a3abb8] uppercase tracking-wider mb-3">
                Architecture &amp; risk bounds
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {active.bounds.map((bound) => (
                  <li key={bound} className="flex items-start gap-2.5 text-xs text-[#b0b7c3]">
                    <svg
                      className="w-4 h-4 shrink-0 mt-0.5"
                      style={{ color: active.accentColor }}
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

            <div className="mt-8 pt-6 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-4">
              <div className="text-xs text-[#a3abb8] font-mono">{live.venueLine} · ERC-4626</div>

              <div className="flex items-center gap-3">
                {active.vaultAddress ? (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                    <Link
                      href={`/vaults/${active.vaultAddress}`}
                      style={{ color: "#0b1310", backgroundColor: "#f8f9fa" }}
                      className="inline-flex items-center justify-center rounded-full px-5 py-2.5 text-xs font-semibold hover:bg-white transition-colors whitespace-nowrap"
                    >
                      <span style={{ color: "#0b1310" }}>Open vault</span>
                    </Link>
                    <Link
                      href={`/vaults/${active.vaultAddress}/deposit`}
                      className="inline-flex items-center justify-center rounded-full px-4 py-2.5 text-xs font-medium text-[#d1d5db] hover:text-[#f8f9fa] border border-white/[0.12] hover:border-white/[0.2] bg-white/[0.03] transition-colors whitespace-nowrap"
                    >
                      Deposit USDG
                    </Link>
                  </div>
                ) : (
                  <span className="inline-flex items-center justify-center rounded-full bg-white/[0.04] text-[#9ca3af] border border-white/[0.08] px-5 py-2.5 text-xs font-medium whitespace-nowrap">
                    No contract to open
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}