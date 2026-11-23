"use client";

// Portfolio: what the connected account actually holds, and separately what it can take out now.
// The two numbers are never merged into one "balance", because they disagree whenever the venue is
// illiquid — which is the whole point of the honesty rule in AGENTS.md §4.

import { useCallback, useState } from "react";
import { createPublicClient, http, type Address } from "viem";
import { Amount, AddressText } from "@/components/primitives";
import { fetchJson } from "@/lib/api";
import {
  AVENOR_CHAIN_ID,
  WalletError,
  connectWallet,
  findInjectedProvider,
  mapWalletError,
  readChainId,
  switchToAvenorChain,
} from "@/lib/wallet";
import { parsePosition, type Position } from "@/lib/vaultView";
import { portfolioCsv, type CsvRow } from "@/lib/portfolioCsv";
import { quoteWithdraw, type WithdrawQuote } from "@/lib/withdraw";
import { blockTime, percentBps } from "@/lib/format";

export interface PortfolioProps {
  vaults: { address: string; label: string }[];
  base: string;
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

function rpcUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_RPC_URL;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

const CHAIN = {
  id: AVENOR_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://placeholder.invalid"] } },
} as const;

interface Row {
  vault: { address: string; label: string };
  position: Position | null;
  positionError: Problem | null;
  quote: WithdrawQuote | null;
  quoteError: Problem | null;
}

export function PortfolioPanel({ vaults, base }: PortfolioProps) {
  const [account, setAccount] = useState<Address | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (owner: Address) => {
      const url = rpcUrl();
      if (url === null) {
        setProblem({
          code: "rpc",
          message: "NEXT_PUBLIC_RPC_URL belum diset: nilai vs dapat-ditarik tidak bisa dihitung dan tidak ditebak.",
          detail: null,
        });
        return;
      }
      const client = createPublicClient({ chain: CHAIN, transport: http(url) });
      const next: Row[] = [];
      for (const vault of vaults) {
        const row: Row = { vault, position: null, positionError: null, quote: null, quoteError: null };
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
    },
    [base, vaults],
  );

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
      if (connected.chainId !== AVENOR_CHAIN_ID) {
        const switched = await switchToAvenorChain(connected.provider);
        if (!switched.switched) {
          setProblem({ code: "wrong_network", message: switched.reason ?? "Wallet menolak pindah chain.", detail: null });
          return;
        }
        if ((await readChainId(connected.provider)) !== AVENOR_CHAIN_ID) {
          setProblem({ code: "wrong_network", message: `Wallet tidak di chain ${AVENOR_CHAIN_ID}.`, detail: null });
          return;
        }
      }
      setAccount(connected.account);
      await load(connected.account);
    } catch (error) {
      setProblem(describe(error));
    } finally {
      setBusy(false);
    }
  }, [load]);

  return (
    <div className="stack">
      {/* Top action bar — stacks vertically on mobile */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            type="button"
            onClick={connect}
            disabled={busy}
            style={{ color: "#0b1310", backgroundColor: "#f8f9fa" }}
            className="w-full sm:w-auto rounded-full bg-[#f8f9fa] !text-[#0b1310] px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-white disabled:opacity-50 min-h-[44px] cursor-pointer"
          >
            {account === null ? "Connect Wallet" : `Refresh Positions (${account.slice(0, 6)}…${account.slice(-4)})`}
          </button>
          <button
            type="button"
            onClick={download}
            disabled={rows.length === 0}
            className="w-full sm:w-auto rounded-full border border-[#6db89b] px-5 py-2.5 text-sm font-semibold text-[#6db89b] transition-colors hover:bg-[#6db89b]/10 disabled:opacity-40 min-h-[44px] cursor-pointer"
          >
            Export CSV
          </button>
        </div>
        <p className="text-xs text-[#8b929e] leading-relaxed sm:max-w-xs sm:text-right">
          Share balances indexed on-chain; valuations and immediate liquidity limits are evaluated synchronously at a single block. CSV includes unrounded base units, verified block numbers, and explicit error codes.
        </p>
      </div>

      {problem !== null ? (
        <div
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          <code className="rounded bg-red-500/20 px-1.5 py-0.5 font-mono text-xs text-red-400">
            {problem.code}
          </code>{" "}
          {problem.message}
          {problem.detail === null ? null : (
            <span className="provenance ml-1">({problem.detail})</span>
          )}
        </div>
      ) : null}

      {rows.length === 0 && account !== null ? (
        <p className="text-sm text-[#8b929e]">No allocator vaults configured in this application.</p>
      ) : null}

      {rows.map((row) => (
        <section
          key={row.vault.address}
          className="rounded-xl border border-white/[0.08] bg-[#101b16]/85 p-5 sm:p-6 flex flex-col gap-4 shadow-xl"
        >
          {/* Card header */}
          <div className="flex flex-col gap-1 pb-3 border-b border-white/[0.06]">
            <h2 className="text-lg font-medium text-[#f8f9fa]">{row.vault.label}</h2>
            <p className="font-mono text-xs text-[#6db89b] break-all">
              <AddressText address={row.vault.address as `0x${string}`} />
            </p>
          </div>

          {row.positionError !== null ? (
            <div
              role="alert"
              className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
            >
              <code className="rounded bg-red-500/20 px-1.5 py-0.5 font-mono text-xs text-red-400">
                {row.positionError.code}
              </code>{" "}
              {row.positionError.message}
            </div>
          ) : row.position === null ? null : (
            <dl className="facts grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-[#8b929e]">Indexed Shares</dt>
              <dd className="font-mono text-[#f8f9fa] sm:text-right">
                <Amount value={row.position.shares} kind="shares" />
              </dd>
              <dt className="text-[#8b929e]">Last Activity Block</dt>
              <dd className="font-mono text-[#f8f9fa] sm:text-right">Block #{row.position.lastActivityBlock.toString()}</dd>
              {row.quoteError !== null ? (
                <>
                  <dt className="text-[#8b929e]">Position Valuation</dt>
                  <dd className="sm:text-right">
                    <span className="provenance text-xs text-[#8b929e]">
                      unreadable on-chain ({row.quoteError.code}): {row.quoteError.message}
                    </span>
                  </dd>
                  <dt className="text-[#8b929e]">Immediately Withdrawable</dt>
                  <dd className="sm:text-right">
                    <span className="provenance text-xs text-[#8b929e]">unestimated (zero-fabrication rule)</span>
                  </dd>
                </>
              ) : row.quote === null ? (
                <>
                  <dt className="text-[#8b929e]">Position Valuation</dt>
                  <dd className="text-[#f8f9fa] sm:text-right">Zero balance; no active positions to evaluate</dd>
                </>
              ) : (
                <>
                  <dt className="text-[#8b929e]">Position Valuation</dt>
                  <dd className="font-mono text-[#f8f9fa] sm:text-right">
                    <Amount value={row.quote.positionAssets} kind="usdg" />
                  </dd>
                  <dt className="text-[#8b929e]">Immediately Withdrawable</dt>
                  <dd className="font-mono text-[#f8f9fa] sm:text-right">
                    <Amount value={row.quote.maxAssets} kind="usdg" />{" "}
                    <span className="text-[#8b929e] text-xs">
                      ({percentBps(row.quote.positionAssets === 0n ? 0 : Number((row.quote.maxAssets * 10_000n) / row.quote.positionAssets))}{" "}
                      of position value)
                    </span>
                  </dd>
                  <dt className="text-[#8b929e]">Vault Idle Reserves</dt>
                  <dd className="font-mono text-[#f8f9fa] sm:text-right">
                    <Amount value={row.quote.totalIdle} kind="usdg" />
                  </dd>
                  <dt className="text-[#8b929e]">Evaluated at Block</dt>
                  <dd className="font-mono text-[#f8f9fa] sm:text-right">#{row.quote.blockNumber.toString()}</dd>
                </>
              )}
            </dl>
          )}

          {/* Illiquidity warning */}
          {row.quote !== null && row.quote.positionAssets > row.quote.maxAssets ? (
            <div
              role="alert"
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-300 leading-relaxed"
            >
              Partial immediate redemption constraint: withdrawable amount is bounded by underlying venue liquidity. Full exits require explicit max_loss parameterization and may involve strategy queue resolution.
            </div>
          ) : null}

          {/* Provenance note */}
          {row.position === null || row.positionError !== null ? null : (
            <p className="provenance">
              Evaluated {blockTime(new Date().toISOString())} UTC for display. Authoritative on-chain numbers originate from the verified block height stated above.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}