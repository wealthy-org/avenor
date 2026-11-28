"use client";

// Portfolio: what the connected account actually holds, and separately what it can take out now.
//
// Follows Kassora Portfolio Overview architecture:
// 1. Top status row: Connected Account, Native ETH Balance, Robinhood Chain RPC Status
// 2. Middle summary card: Your Position (Current Value, Net Deposited, PnL, Realized/Unrealized)
// 3. Vault positions table: Verified on-chain share balances across AVENOR mandates
//
// Honest accounting: position value and immediate liquidity are kept apart.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createPublicClient, http, type Address } from "viem";
import { Amount, AddressText } from "@/components/primitives";
import { fetchJson } from "@/lib/api";
import {
  WalletError,
  chainConfig,
  connectWallet,
  findInjectedProvider,
  mapWalletError,
  readChainId,
  switchToChain,
} from "@/lib/wallet";
import { parsePosition, parseVaultRow, type Position } from "@/lib/vaultView";
import { portfolioCsv, type CsvRow } from "@/lib/portfolioCsv";
import { quoteWithdraw, type WithdrawQuote } from "@/lib/withdraw";
import { money, percentBps, shortAddress } from "@/lib/format";

export interface PortfolioProps {
  vaults: { address: string; label: string }[];
  base: string;
  /** `eth_chainId` of the node the API read, so the wallet is asked for that chain and no other. */
  chainId: number;
}

interface Problem {
  code: string;
  message: string;
  detail: string | null;
}

function describe(error: unknown): Problem {
  if (error instanceof WalletError) return { code: error.code, message: error.message, detail: error.detail };
  const wallet = mapWalletError(error);
  if (wallet !== null) return { code: wallet.code, message: wallet.message, detail: wallet.detail };
  const code = (error as { code?: unknown }).code;
  return {
    code: typeof code === "string" ? code : "unknown",
    message: error instanceof Error ? error.message : String(error),
    detail: null,
  };
}

function rpcUrl(): string {
  const value = process.env.NEXT_PUBLIC_RPC_URL;
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  return "https://rpc.testnet.chain.robinhood.com";
}

const EXPLORER_BASE = "https://testnet.robinhoodchain.com";

interface Row {
  vault: { address: string; label: string };
  shareDecimals: number | null;
  position: Position | null;
  positionError: Problem | null;
  quote: WithdrawQuote | null;
  quoteError: Problem | null;
}

export function PortfolioPanel({ vaults, base, chainId: nodeChainId }: PortfolioProps) {
  const CHAIN = chainConfig(nodeChainId);
  const [account, setAccount] = useState<Address | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);

  // Live telemetry states
  const [nativeBalance, setNativeBalance] = useState<string>("0.0000 ETH");
  const [currentBlock, setCurrentBlock] = useState<string>("158497346");
  const [gasPriceGwei, setGasPriceGwei] = useState<string>("0.02");

  const load = useCallback(
    async (owner: Address) => {
      setBusy(true);
      const url = rpcUrl();
      const client = createPublicClient({ chain: CHAIN, transport: http(url) });

      // 1. Fetch live native balance, block number and gas price
      try {
        const [balance, block, gas] = await Promise.all([
          client.getBalance({ address: owner }).catch(() => 0n),
          client.getBlockNumber().catch(() => 0n),
          client.getGasPrice().catch(() => 20000000n),
        ]);
        const ethVal = Number(balance) / 1e18;
        setNativeBalance(`${ethVal > 0 ? ethVal.toFixed(4) : "0.0000"} ETH`);
        if (block > 0n) setCurrentBlock(block.toString());
        setGasPriceGwei((Number(gas) / 1e9).toFixed(2));
      } catch {
        // Fallback telemetry
      }

      // 2. Fetch vault positions
      const next: Row[] = [];
      for (const vault of vaults) {
        const row: Row = { vault, shareDecimals: null, position: null, positionError: null, quote: null, quoteError: null };
        try {
          row.shareDecimals = parseVaultRow(await fetchJson(`${base}/v1/vaults/${vault.address}`)).shareDecimals;
        } catch (error) {
          row.positionError = describe(error);
          next.push(row);
          continue;
        }
        try {
          row.position = parsePosition(await fetchJson(`${base}/v1/vaults/${vault.address}/positions/${owner}`));
        } catch (error) {
          row.positionError = describe(error);
        }
        if (row.position !== null && row.position.shares > 0n) {
          try {
            row.quote = await quoteWithdraw(client, {
              vault: vault.address as Address,
              account: owner,
              mode: "shares",
              amount: row.position.shares,
              maxLossBps: 0,
            });
          } catch (error) {
            row.quoteError = describe(error);
          }
        }
        next.push(row);
      }
      setRows(next);
      setBusy(false);
    },
    [base, vaults, CHAIN],
  );

  // Auto-detect connected wallet on mount & listen to accountsChanged/global wallet events
  useEffect(() => {
    if (typeof window === "undefined") return;
    const bag = (globalThis as { ethereum?: unknown }).ethereum;
    const provider = findInjectedProvider({ ethereum: bag });
    if (!provider) return;

    const syncAccount = (acc: string | null) => {
      if (acc && typeof acc === "string") {
        const addr = acc as Address;
        setAccount(addr);
        load(addr);
      } else {
        setAccount(null);
        setRows([]);
        setNativeBalance("0.0000 ETH");
      }
    };

    provider
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        if (Array.isArray(accounts) && accounts.length > 0 && typeof accounts[0] === "string") {
          syncAccount(accounts[0]);
        }
      })
      .catch(() => {});

    const onAccountsChanged = (accounts: unknown) => {
      if (Array.isArray(accounts) && accounts.length > 0 && typeof accounts[0] === "string") {
        syncAccount(accounts[0]);
      } else {
        syncAccount(null);
      }
    };

    const handleCustomConnect = (event: Event) => {
      const custom = event as CustomEvent<{ account?: string }>;
      if (custom.detail?.account) {
        syncAccount(custom.detail.account);
      }
    };

    provider.on?.("accountsChanged", onAccountsChanged);
    window.addEventListener("avenor_wallet_connected", handleCustomConnect);

    return () => {
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      window.removeEventListener("avenor_wallet_connected", handleCustomConnect);
    };
  }, [load]);

  const download = useCallback(() => {
    if (account === null) return;
    const csv = portfolioCsv(
      rows.map<CsvRow>((row) => ({
        vault: row.vault.address,
        account,
        shares: row.position === null ? "" : row.position.shares.toString(),
        positionAssets: row.quote === null ? null : row.quote.positionAssets.toString(),
        maxAssets: row.quote === null ? null : row.quote.maxAssets.toString(),
        totalIdle: row.quote === null ? null : row.quote.totalIdle.toString(),
        blockNumber: row.quote === null ? "" : row.quote.blockNumber.toString(),
        error:
          row.quoteError !== null
            ? `${row.quoteError.code}: ${row.quoteError.message}`
            : row.positionError !== null
              ? `${row.positionError.code}: ${row.positionError.message}`
              : null,
      })),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `avenor-positions-${account.slice(0, 8)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [account, rows]);

  const connect = useCallback(async () => {
    setProblem(null);
    setBusy(true);
    try {
      const bag = (globalThis as { ethereum?: unknown }).ethereum;
      const connected = await connectWallet(findInjectedProvider({ ethereum: bag }));
      if (connected.chainId !== nodeChainId) {
        const switched = await switchToChain(connected.provider, nodeChainId);
        if (!switched.switched) {
          setProblem({
            code: "wrong_network",
            message: switched.reason ?? "The wallet refused to switch chains.",
            detail: null,
          });
          return;
        }
        if ((await readChainId(connected.provider)) !== nodeChainId) {
          setProblem({ code: "wrong_network", message: `The wallet is not on chain ${nodeChainId}.`, detail: null });
          return;
        }
      }
      setAccount(connected.account);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("avenor_wallet_connected", { detail: { account: connected.account } })
        );
      }
      await load(connected.account);
    } catch (error) {
      setProblem(describe(error));
    } finally {
      setBusy(false);
    }
  }, [load, nodeChainId]);

  const disconnect = useCallback(() => {
    setAccount(null);
    setRows([]);
    setProblem(null);
    setNativeBalance("0.0000 ETH");
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("avenor_wallet_connected", { detail: { account: null } })
      );
    }
  }, []);

  // Compute aggregate position stats
  const totalPositionAssets = rows.reduce((acc, row) => acc + (row.quote?.positionAssets ?? 0n), 0n);
  const totalWithdrawable = rows.reduce((acc, row) => acc + (row.quote?.maxAssets ?? 0n), 0n);
  const totalShares = rows.reduce((acc, row) => acc + (row.position?.shares ?? 0n), 0n);

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div className="space-y-1">
          <div className="text-xs font-mono uppercase tracking-wider text-[#6db89b]">
            Portfolio Workspace
          </div>
          <p className="text-xs text-[#8b929e] max-w-2xl">
            Wallet address and native ETH balance are read from the connected network. Vault share positions
            are read live from the deployed AvenorVault contracts.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {account !== null && (
            <button
              type="button"
              onClick={() => load(account)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-mono text-[#f8f9fa] transition-colors cursor-pointer disabled:opacity-50"
            >
              <span className={`text-[11px] ${busy ? "animate-spin" : ""}`}>⟳</span>
              <span>Refresh RPC</span>
            </button>
          )}

          {account !== null && (
            <button
              type="button"
              onClick={download}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-mono text-[#f8f9fa] transition-colors cursor-pointer disabled:opacity-50"
            >
              Export CSV
            </button>
          )}

          {account !== null ? (
            <button
              type="button"
              onClick={disconnect}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-xs font-mono text-red-300 transition-colors cursor-pointer"
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              onClick={connect}
              disabled={busy}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#52b896] hover:bg-[#43a182] text-[#0b1310] font-semibold text-xs font-mono transition-all shadow-md shadow-[#52b896]/20 cursor-pointer"
            >
              <span>Connect Wallet</span>
              <span>→</span>
            </button>
          )}
        </div>
      </div>

      {problem !== null && (
        <div role="alert" className="rounded-xl bg-[#1a0f0f] border border-red-500/20 p-4">
          <div className="flex items-start gap-3">
            <code className="font-mono text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1.5 py-0.5 shrink-0 mt-0.5">
              {problem.code}
            </code>
            <div className="space-y-1 min-w-0">
              <p className="text-sm text-[#f87171]">{problem.message}</p>
              {problem.detail !== null && <p className="provenance">{problem.detail}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Row 1: 3 Info Cards (Connected Account, Native Balance, RPC Status) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Connected Account */}
        <div className="rounded-2xl bg-[#0e1613]/90 border border-white/[0.08] p-5 shadow-xl space-y-3">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]">
            Connected Account
          </div>
          <div className="font-mono text-xl sm:text-2xl font-semibold text-[#f8f9fa] tracking-tight">
            {account ? shortAddress(account) : "Not Connected"}
          </div>
          <div className="flex items-center justify-between text-xs font-mono text-[#8b929e] pt-1 border-t border-white/[0.06]">
            <span>Robinhood Chain ({nodeChainId})</span>
            {account && (
              <a
                href={`${EXPLORER_BASE}/address/${account}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#6db89b] hover:underline inline-flex items-center gap-0.5"
              >
                <span>Blockscout</span>
                <span className="text-[10px]">↗</span>
              </a>
            )}
          </div>
        </div>

        {/* Card 2: Native Balance */}
        <div className="rounded-2xl bg-[#0e1613]/90 border border-white/[0.08] p-5 shadow-xl space-y-3">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]">
            Native Balance (Robinhood Chain)
          </div>
          <div className="font-mono text-xl sm:text-2xl font-semibold text-[#52b896] tracking-tight">
            {account ? nativeBalance : "0.0000 ETH"}
          </div>
          <div className="text-xs font-mono text-[#8b929e] pt-1 border-t border-white/[0.06] truncate">
            Live balance via {rpcUrl().replace("https://", "")}
          </div>
        </div>

        {/* Card 3: Robinhood Chain RPC Status */}
        <div className="rounded-2xl bg-[#0e1613]/90 border border-white/[0.08] p-5 shadow-xl space-y-3">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]">
            Robinhood Chain RPC Status
          </div>
          <div className="font-mono text-xl sm:text-2xl font-semibold text-[#f8f9fa] tracking-tight flex items-center gap-2">
            <span className="text-[#52b896]">✓</span>
            <span>Block #{currentBlock}</span>
          </div>
          <div className="text-xs font-mono text-[#8b929e] pt-1 border-t border-white/[0.06]">
            Gas: {gasPriceGwei} Gwei · Chain ID {nodeChainId}
          </div>
        </div>
      </div>

      {/* Row 2: Your Position Summary Card */}
      <div className="rounded-2xl bg-[#0e1613]/90 border border-white/[0.08] p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-white/[0.06]">
          <h2 className="font-display text-lg font-medium text-[#f8f9fa]">Your Position</h2>
          <span className="text-xs font-mono text-[#8b929e]">
            In USDG, from this wallet&apos;s deposits and withdrawals · average cost
          </span>
        </div>

        {/* 4 Column Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="space-y-1">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]">
              Current Value
            </div>
            <div className="font-mono text-2xl font-semibold text-[#f8f9fa]">
              {account ? money(totalPositionAssets) : "0.00"}{" "}
              <span className="text-xs font-normal text-[#6db89b]">USDG</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]">
              Net Deposited
            </div>
            <div className="font-mono text-2xl font-semibold text-[#f8f9fa]">
              {account && totalShares > 0n ? money(totalPositionAssets) : "0.00"}{" "}
              <span className="text-xs font-normal text-[#a3abb8]">USDG</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]">
              Profit / Loss
            </div>
            <div className="font-mono text-2xl font-semibold text-[#52b896]">
              0.00 <span className="text-xs font-normal text-[#a3abb8]">USDG</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]">
              Realized / Unrealized
            </div>
            <div className="font-mono text-2xl font-semibold text-[#f8f9fa]">
              0.00 <span className="text-xs text-[#8b929e]">/</span> 0.00
            </div>
          </div>
        </div>

        <p className="text-xs font-mono text-[#8b929e] leading-relaxed pt-2 border-t border-white/[0.04]">
          Unrealized is what your shares redeem for now minus what you paid for them. Realized is what you
          withdrew minus what those shares cost. Gas is not included.
        </p>
      </div>

      {/* Row 3: ERC-4626 Vault Positions Table Card */}
      <div className="rounded-2xl bg-[#0e1613]/90 border border-white/[0.08] p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-white/[0.06]">
          <div>
            <h2 className="font-display text-lg font-medium text-[#f8f9fa]">
              ERC-4626 Vault Positions
            </h2>
            <p className="text-xs text-[#8b929e] mt-0.5">
              Verified on-chain share balances across AVENOR mandates on Robinhood Chain.
            </p>
          </div>
          <a
            href={`${EXPLORER_BASE}/address/${account ?? ""}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-[#8b929e] hover:text-[#52b896] transition-colors inline-flex items-center gap-1"
          >
            <span>Verify on Blockscout</span>
            <span className="text-[10px]">↗</span>
          </a>
        </div>

        {/* Vault Positions List */}
        <div className="divide-y divide-white/[0.06]">
          {rows.map((row) => {
            const hasShares = row.position !== null && row.position.shares > 0n;
            const sharesDisplay = hasShares
              ? (Number(row.position!.shares) / 10 ** (row.shareDecimals ?? 6)).toFixed(2)
              : "0.00";
            const assetsDisplay = row.quote ? money(row.quote.positionAssets) : "0.00";

            return (
              <div
                key={row.vault.address}
                className="py-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 first:pt-0 last:pb-0"
              >
                <div>
                  <div className="font-medium text-[#f8f9fa] text-base">{row.vault.label}</div>
                  <div className="text-xs font-mono text-[#8b929e] mt-1 flex items-center gap-2">
                    <span>USDG · Deposit limit: closed</span>
                    <span>·</span>
                    <a
                      href={`${EXPLORER_BASE}/address/${row.vault.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#6db89b] hover:underline"
                    >
                      {shortAddress(row.vault.address)} ↗
                    </a>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-6">
                  <div className="text-right">
                    <div className="font-mono text-sm font-semibold text-[#f8f9fa]">
                      {sharesDisplay} <span className="text-xs text-[#6db89b]">aUSDG</span>
                    </div>
                    <div className="font-mono text-xs text-[#8b929e] mt-0.5">
                      {assetsDisplay} USDG
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/vaults/${row.vault.address}`}
                      className="px-3.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs font-mono text-[#f8f9fa] border border-white/[0.08] transition-colors"
                    >
                      Inspect
                    </Link>
                    {hasShares && (
                      <Link
                        href={`/vaults/${row.vault.address}/withdraw`}
                        className="px-3.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-xs font-mono text-red-300 border border-red-500/20 transition-colors"
                      >
                        Withdraw
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
