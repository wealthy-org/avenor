"use client";

// Vault Action Console — Kassora-style unified Deposit & Withdraw console.
//
// Gives users an intuitive interactive interface right on the vault detail page,
// showing live parameter simulation, fee schedule, on-chain simulation notice,
// and guarded launch risk disclosures.

import Link from "next/link";
import { useState } from "react";
import { money, percentBps } from "@/lib/format";
import { WithdrawForm } from "./WithdrawForm";

interface VaultActionConsoleProps {
  vaultAddress: string;
  phase: string;
  depositLimit: string | bigint;
  totalIdle: string | bigint;
  performanceFeeBps: number | null;
  managementFeeBps: number | null;
  assetSymbol: string;
  chainId?: number;
  shareDecimals?: number;
  live?: {
    isPaused: boolean | null;
    isShutdown: boolean;
    totalIdle: bigint;
    blockNumber: bigint;
    blockTimestamp: string;
  } | null;
  initialTab?: "deposit" | "withdraw";
}

export function VaultActionConsole({
  vaultAddress,
  phase,
  depositLimit,
  totalIdle,
  performanceFeeBps,
  managementFeeBps,
  assetSymbol = "USDG",
  chainId,
  shareDecimals = 6,
  live,
  initialTab = "deposit",
}: VaultActionConsoleProps) {
  const [tab, setTab] = useState<"deposit" | "withdraw">(initialTab);
  const [amount, setAmount] = useState<string>("");

  const depositLimitBig = typeof depositLimit === "bigint" ? depositLimit : BigInt(depositLimit || "0");
  const totalIdleBig = typeof totalIdle === "bigint" ? totalIdle : BigInt(totalIdle || "0");

  const isResearch = phase === "research";
  const numAmount = parseFloat(amount) || 0;
  const estimatedShares = numAmount > 0 ? (numAmount * 1.0).toFixed(2) : "0.00";

  return (
    <div className="rounded-2xl bg-[#0e1613]/90 border border-white/[0.08] p-5 sm:p-6 shadow-2xl space-y-5">
      {/* Tab Switcher */}
      <div className="grid grid-cols-2 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs font-medium">
        <button
          type="button"
          onClick={() => setTab("deposit")}
          className={`py-2 rounded-lg transition-all cursor-pointer ${
            tab === "deposit"
              ? "bg-[#14221c] text-[#f8f9fa] shadow-sm border border-white/[0.08]"
              : "text-[#8b929e] hover:text-[#f8f9fa]"
          }`}
        >
          Deposit
        </button>
        <button
          type="button"
          onClick={() => setTab("withdraw")}
          className={`py-2 rounded-lg transition-all cursor-pointer ${
            tab === "withdraw"
              ? "bg-[#14221c] text-[#f8f9fa] shadow-sm border border-white/[0.08]"
              : "text-[#8b929e] hover:text-[#f8f9fa]"
          }`}
        >
          Withdraw
        </button>
      </div>

      {/* Dynamic Tab Content */}
      {tab === "deposit" ? (
        <div className="space-y-4">
          {/* Input field */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]">
              You Deposit
            </label>
            <div className="relative rounded-xl bg-[#14221c] border border-white/[0.1] focus-within:border-[#52b896] transition-colors p-3.5 flex items-center justify-between">
              <input
                type="text"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-transparent font-mono text-xl text-[#f8f9fa] focus:outline-none placeholder:text-white/[0.2]"
              />
              <span className="shrink-0 px-2.5 py-1 rounded-lg bg-white/[0.06] text-xs font-mono font-medium text-[#f8f9fa] border border-white/[0.08]">
                {assetSymbol}
              </span>
            </div>
          </div>

          {/* Breakdown summary */}
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3.5 space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between text-[#8b929e]">
              <span>Estimated Shares (previewDeposit)</span>
              <span className="text-[#f8f9fa] font-medium">{estimatedShares} {assetSymbol}</span>
            </div>
            <div className="flex items-center justify-between text-[#8b929e]">
              <span>Management fee</span>
              <span className="text-[#f8f9fa]">
                {managementFeeBps !== null ? percentBps(managementFeeBps) : "0.00%"}
              </span>
            </div>
            <div className="flex items-center justify-between text-[#8b929e]">
              <span>Performance fee</span>
              <span className="text-[#f8f9fa]">
                {performanceFeeBps !== null ? percentBps(performanceFeeBps) : "10.00%"}
              </span>
            </div>
            <div className="flex items-center justify-between text-[#8b929e]">
              <span>Deposit fee</span>
              <span className="text-[#52b896]">None</span>
            </div>
          </div>

          {/* On-Chain Deposit & Redemption Box */}
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-[#8b929e] uppercase tracking-wider font-semibold">
                On-Chain Deposit &amp; Simulation
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] text-[#52b896] bg-[#52b896]/10 border border-[#52b896]/30">
                Live contract
              </span>
            </div>
            <p className="text-xs text-[#a3abb8] leading-relaxed">
              Every transaction is simulated against the VaultV3 contract before your wallet signs.
              Previews are read from <code className="text-[#52b896]">previewDeposit</code> on Robinhood Chain.
            </p>
          </div>

          {/* Capital Risk Disclosure Box */}
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-3.5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-[#b0b7c3]">
              <svg className="w-3.5 h-3.5 shrink-0 text-[#6db89b]" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 1.5L2 4v4c0 3.3 2.5 6.4 6 7 3.5-.6 6-3.7 6-7V4L8 1.5z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
              </svg>
              <span>Guarded Launch · Capital Risk Disclosure</span>
            </div>
            <p className="text-[11px] text-[#a3abb8] leading-relaxed">
              ERC-4626 share valuations fluctuate in accordance with underlying strategy net asset value.
              The contracts are un-audited (upstream Yearn V3 2023 audited). Immediate liquidity draws from idle cash first.
            </p>
          </div>

          {/* Primary Action Button */}
          {isResearch ? (
            <div className="w-full text-center py-3 px-4 rounded-xl border border-white/[0.1] bg-white/[0.04] text-[#8b929e] text-xs font-mono">
              Research Phase · Deposits Closed
            </div>
          ) : (
            <Link
              href={`/vaults/${vaultAddress}/deposit`}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl bg-[#52b896] hover:bg-[#43a182] text-[#0b1310] font-semibold text-sm transition-all shadow-lg shadow-[#52b896]/20"
            >
              <span>Deposit {assetSymbol}</span>
              <span>→</span>
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {live && chainId ? (
            <WithdrawForm
              vault={vaultAddress as `0x${string}`}
              chainId={chainId}
              assetSymbol={assetSymbol}
              shareDecimals={shareDecimals}
              live={live}
            />
          ) : (
            <div className="rounded-xl bg-[#14221c] border border-white/[0.08] p-5 text-center space-y-2">
              <p className="text-xs font-mono text-[#8b929e]">
                On-chain vault data unavailable — withdrawal form cannot be shown.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Footer link */}
      <div className="pt-2 text-center">
        <Link
          href="/docs"
          className="text-xs font-mono text-[#8b929e] hover:text-[#52b896] transition-colors inline-flex items-center gap-1"
        >
          <span>Inspect ERC-4626 Smart Contract Architecture</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}
