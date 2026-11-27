"use client";

// Portfolio: what the connected account actually holds, and separately what it can take out now.
// The two numbers are never merged into one "balance", because they disagree whenever the venue is
// illiquid — which is the whole point of the honesty rule in AGENTS.md §4.

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
import { blockTime, percentBps } from "@/lib/format";

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

function rpcUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_RPC_URL;
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  return "https://rpc.testnet.chain.robinhood.com";
}

interface Row {
  vault: { address: string; label: string };
  /** `share_decimals` of this vault's row, read per vault. `null` until the row answered. */
  shareDecimals: number | null;
  position: Position | null;
  positionError: Problem | null;
  quote: WithdrawQuote | null;
  quoteError: Problem | null;
}

/** One labelled figure. Kept as a row so a long money value can wrap instead of colliding. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-white/[0.05] last:border-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <span className="text-xs text-[#a3abb8] shrink-0">{label}</span>
      <span className="font-mono text-sm tabular-nums text-[#f8f9fa] sm:text-right break-words">{children}</span>
    </div>
  );
}

export function PortfolioPanel({ vaults, base, chainId: nodeChainId }: PortfolioProps) {
  const CHAIN = chainConfig(nodeChainId);
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
          message:
            "NEXT_PUBLIC_RPC_URL is not set, so position value and the withdrawable amount cannot be computed and are not guessed.",
          detail: null,
        });
        return;
      }
      const client = createPublicClient({ chain: CHAIN, transport: http(url) });
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
    },
    [base, vaults, nodeChainId],
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
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("avenor_wallet_connected", { detail: { account: null } })
      );
    }
  }, []);

  const withPosition = rows.filter((row) => row.position !== null && row.position.shares > 0n);
  const allRead = rows.length > 0 && rows.every((row) => row.position !== null);
  const exportDisabledReason =
    account === null
      ? "Connect a wallet first: the export is built from the account it read."
      : rows.length === 0
        ? "Nothing has been read yet, so there is no row to export."
        : undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            onClick={connect}
            disabled={busy}
            style={account === null ? { color: "#0b1310", backgroundColor: "#f8f9fa" } : undefined}
            className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all min-h-[44px] cursor-pointer ${
              account !== null
                ? "bg-[#14221c] border border-[#6db89b]/30 text-[#6db89b]"
                : "hover:bg-white shadow-[0_0_20px_rgba(255,255,255,0.08)]"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {account !== null && <span className="inline-block w-2 h-2 rounded-full bg-[#6db89b]" />}
            {account === null ? "Connect wallet" : `Reload — ${account.slice(0, 6)}…${account.slice(-4)}`}
          </button>
          {account !== null && (
            <button
              type="button"
              onClick={disconnect}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-300 px-4 py-3 text-xs font-semibold transition-colors min-h-[44px] cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Disconnect</span>
            </button>
          )}
          <button
            type="button"
            onClick={download}
            disabled={rows.length === 0}
            title={exportDisabledReason}
            className="flex-1 sm:flex-none inline-flex items-center justify-center rounded-xl border border-[#6db89b]/30 bg-[#6db89b]/05 text-[#6db89b] hover:bg-[#6db89b]/10 hover:border-[#6db89b]/50 disabled:opacity-100 disabled:cursor-not-allowed disabled:text-[#a3abb8] disabled:border-white/[0.12] disabled:bg-transparent px-5 py-3 text-sm font-semibold transition-all min-h-[44px] cursor-pointer"
          >
            Export CSV
          </button>
        </div>
        <p className="text-xs text-[#a3abb8] leading-relaxed max-w-3xl text-pretty">
          Share balance is read from the indexer. Position value and withdrawal limits are read from the chain at a single
          block. The CSV export carries base units (not rounded), block numbers, and any error rows.
          {exportDisabledReason === undefined ? null : ` ${exportDisabledReason}`}
        </p>
      </div>

      {problem !== null ? (
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
      ) : null}

      {/* No wallet yet: an explicit placeholder, so the page does not end in an empty gap. */}
      {account === null && problem === null ? (
        <div className="rounded-xl border border-dashed border-white/[0.12] bg-[#101b16]/50 p-6 sm:p-8 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#14221c] border border-white/[0.12] text-[#6db89b] font-mono text-sm shrink-0">
              0x
            </span>
            <h2 className="font-display text-lg font-medium text-[#f8f9fa]">No wallet connected</h2>
          </div>
          <p className="text-sm leading-relaxed text-[#b0b7c3] max-w-2xl">
            Nothing is shown until an account exists, because a position belongs to an address. There is no
            placeholder balance here: a number that is not read from the chain is not displayed.
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 pl-5 list-disc text-sm text-[#a3abb8]">
            <li>Shares held, from the indexer</li>
            <li>Position value, from convertToAssets</li>
            <li>Withdrawable now, from maxWithdraw</li>
            <li>The block all three were read at</li>
          </ul>
        </div>
      ) : null}

      {account !== null && rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/[0.12] bg-[#101b16]/50 p-6">
          <h2 className="font-display text-lg font-medium text-[#f8f9fa]">No vault is configured</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#b0b7c3] max-w-2xl">
            This deployment lists no vault in <code className="font-mono text-xs">AVENOR_VAULTS</code>, so there is
            nothing to read a position from.
          </p>
        </div>
      ) : null}

      {account !== null && rows.length > 0 && allRead && withPosition.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/[0.12] bg-[#101b16]/50 p-6">
          <h2 className="font-display text-lg font-medium text-[#f8f9fa]">No position in any vault</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#b0b7c3] max-w-2xl">
            This account holds no shares in the {rows.length === 1 ? "vault" : "vaults"} listed above. Nothing was
            deposited, so there is nothing to value or withdraw.
          </p>
        </div>
      ) : null}

      {rows.map((row) => (
        <section
          key={row.vault.address}
          className="rounded-xl border border-white/[0.08] bg-[#101b16]/85 p-4 sm:p-6 flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1 min-w-0">
            <h2 className="text-lg font-medium text-[#f8f9fa]">{row.vault.label}</h2>
            <p className="font-mono text-xs text-[#6db89b] break-all">
              <AddressText address={row.vault.address as `0x${string}`} />
            </p>
          </div>

          {row.positionError !== null ? (
            <div role="alert" className="rounded-lg bg-[#1a0f0f] border border-red-500/20 px-4 py-3 text-sm text-[#f87171]">
              <code className="font-mono text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1.5 py-0.5 mr-2">
                {row.positionError.code}
              </code>
              {row.positionError.message}
            </div>
          ) : row.position === null ? null : (
            <div>
              <Field label="Shares (read from the vault)">
                {row.shareDecimals === null ? (
                  <span className="text-[#e8c468]">share decimals not read</span>
                ) : (
                  <Amount value={row.position.shares} kind="shares" decimals={row.shareDecimals} />
                )}
              </Field>
              <Field label="Last activity">
                <span className="text-[#b0b7c3]">
                  {row.position.lastActivityBlock === null
                    ? row.position.historyError ?? "no block history"
                    : `block ${row.position.lastActivityBlock.toString()}`}
                </span>
              </Field>
              {row.quoteError !== null ? (
                <>
                  <Field label="Position value">
                    <span className="text-xs text-[#a3abb8]">
                      unreadable ({row.quoteError.code}): {row.quoteError.message}
                    </span>
                  </Field>
                  <Field label="Withdrawable now">
                    <span className="text-xs text-[#a3abb8]">not filled with invented data</span>
                  </Field>
                </>
              ) : row.quote === null ? (
                <Field label="Position value">
                  <span className="text-[#a3abb8]">zero shares, so there is no position to value</span>
                </Field>
              ) : (
                <>
                  <Field label="Position value">
                    <Amount value={row.quote.positionAssets} kind="usdg" />
                  </Field>
                  <Field label="Withdrawable now">
                    <Amount value={row.quote.maxAssets} kind="usdg" />{" "}
                    <span className="text-[#a3abb8] text-xs">
                      (
                      {percentBps(
                        row.quote.positionAssets === 0n
                          ? 0
                          : Number((row.quote.maxAssets * 10_000n) / row.quote.positionAssets),
                      )}{" "}
                      of position)
                    </span>
                  </Field>
                  <Field label="Vault idle cash">
                    <Amount value={row.quote.totalIdle} kind="usdg" />
                  </Field>
                  <Field label="Data block">
                    <span className="text-[#b0b7c3]">{row.quote.blockNumber.toString()}</span>
                  </Field>
                </>
              )}
            </div>
          )}

          {row.quote !== null && row.quote.positionAssets > row.quote.maxAssets ? (
            <div
              role="alert"
              className="rounded-lg border border-[#e8c468]/20 bg-[#1a1200] px-4 py-3 text-xs text-[#e8c468] leading-relaxed"
            >
              <span aria-hidden="true">! </span>Part of your position value is not immediately withdrawable. The
              withdrawal limit follows venue liquidity, not the UI. A full exit requires an explicit{" "}
              <code className="font-mono">max_loss</code> and may be partial.
            </div>
          ) : null}

          {row.position === null || row.positionError !== null ? null : (
            <p className="provenance text-xs text-[#a3abb8] leading-relaxed">
              Authoritative block numbers are listed above, read directly from the node.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
