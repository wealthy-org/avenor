"use client";

// Deposit form. The component owns only the interaction: every number it shows comes from
// `quoteDeposit`, every refusal comes from `depositBlockers`, and the shares it declares as final
// come from the receipt's `Deposit` event.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, createWalletClient, custom, http, type Address, type Hex } from "viem";
import {
  DepositError,
  depositBlockers,
  needsApproval,
  parseAssetInput,
  quoteDeposit,
  submitDeposit,
  type DepositQuote,
  type DepositReceipt,
} from "@/lib/deposit";
import {
  WalletError,
  chainConfig,
  connectWallet,
  findInjectedProvider,
  mapWalletError,
  readChainId,
  switchToChain,
} from "@/lib/wallet";
import { Amount, AddressText } from "@/components/primitives";
import { blockTime } from "@/lib/format";

export interface DepositFormProps {
  vault: Address;
  /** `eth_chainId` of the node this page read, so the wallet is asked for that chain and no other. */
  chainId: number;
  asset: Address;
  assetSymbol: string;
  /** `decimals()` of the share token, read from the vault: VaultV3 uses the asset's decimals (6). */
  shareDecimals: number;
  /** Snapshot of the gate from the API, so the form can refuse before touching the wallet. */
  gate: {
    depositLimit: bigint;
    /** `null` = not read (capture fallback); the form treats only a confirmed `true` as closed. */
    isPaused: boolean | null;
    isShutdown: boolean;
    blockNumber: bigint;
    blockTimestamp: string;
    source?: "onchain" | "captured" | "unavailable" | string;
  };
}

type Phase = "idle" | "quoting" | "signing" | "pending" | "done" | "error";

interface Problem {
  code: string;
  message: string;
  detail: string | null;
}

function rpcUrl(): string {
  const value = process.env.NEXT_PUBLIC_RPC_URL;
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  // No silent fallback: a hardcoded testnet RPC would let the client sign for a chain the server
  // never read from when the build-time env differs from the runtime env.
  throw new Error("NEXT_PUBLIC_RPC_URL is not configured; the wallet forms cannot reach the chain.");
}

function describe(error: unknown): Problem {
  if (error instanceof DepositError) return { code: error.code, message: error.message, detail: error.detail };
  if (error instanceof WalletError) return { code: error.code, message: error.message, detail: error.detail };
  const wallet = mapWalletError(error);
  if (wallet !== null) return { code: wallet.code, message: wallet.message, detail: wallet.detail };
  return {
    code: "unknown",
    message: error instanceof Error ? error.message : String(error),
    detail: null,
  };
}

export function DepositForm({ vault, asset, chainId: nodeChainId, assetSymbol, gate, shareDecimals }: DepositFormProps) {
  const CHAIN = chainConfig(nodeChainId);
  const [phase, setPhase] = useState<Phase>("idle");
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<DepositQuote | null>(null);
  const [receipt, setReceipt] = useState<DepositReceipt | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const client = useMemo(() => {
    try {
      return createPublicClient({ chain: CHAIN, transport: http(rpcUrl()) });
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- CHAIN is rebuilt from nodeChainId, which is in the dep list
  }, [nodeChainId]);

  const blocked = useMemo(() => (quote === null ? [] : depositBlockers({ assets: quote.assets, maxAssets: quote.maxAssets, balance: quote.balance, gate: quote.gate })), [quote]);

  // Auto-detect connected wallet on mount & listen to accountsChanged/global wallet events
  useEffect(() => {
    if (typeof window === "undefined") return;
    const bag = (globalThis as { ethereum?: unknown }).ethereum;
    const provider = findInjectedProvider({ ethereum: bag });
    if (!provider) return;

    const syncWallet = async (acc: string | null) => {
      if (acc && typeof acc === "string") {
        setAccount(acc as Address);
        try {
          const cid = await readChainId(provider);
          setChainId(cid);
        } catch {}
      } else {
        setAccount(null);
        setQuote(null);
      }
    };

    provider
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        if (Array.isArray(accounts) && accounts.length > 0 && typeof accounts[0] === "string") {
          syncWallet(accounts[0]);
        }
      })
      .catch(() => {});

    const onAccountsChanged = (accounts: unknown) => {
      if (Array.isArray(accounts) && accounts.length > 0 && typeof accounts[0] === "string") {
        syncWallet(accounts[0]);
      } else {
        syncWallet(null);
      }
    };

    const onChainChanged = (chain: unknown) => {
      if (typeof chain === "string") {
        setChainId(Number(BigInt(chain)));
      }
    };

    const handleCustomConnect = (event: Event) => {
      const custom = event as CustomEvent<{ account?: string }>;
      if (custom.detail?.account) {
        syncWallet(custom.detail.account);
      }
    };

    provider.on?.("accountsChanged", onAccountsChanged);
    provider.on?.("chainChanged", onChainChanged);
    window.addEventListener("avenor_wallet_connected", handleCustomConnect);

    return () => {
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      provider.removeListener?.("chainChanged", onChainChanged);
      window.removeEventListener("avenor_wallet_connected", handleCustomConnect);
    };
  }, []);

  const connect = useCallback(async () => {
    setProblem(null);
    setNotice(null);
    try {
      const bag = (globalThis as { ethereum?: unknown }).ethereum;
      const connected = await connectWallet(findInjectedProvider({ ethereum: bag }));
      setAccount(connected.account);
      setChainId(connected.chainId);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("avenor_wallet_connected", { detail: { account: connected.account } })
        );
      }
      if (connected.chainId !== nodeChainId) {
        const result = await switchToChain(connected.provider, nodeChainId);
        if (result.switched) {
          setChainId(await readChainId(connected.provider));
        } else {
          setNotice(result.reason);
        }
      }
    } catch (error) {
      setProblem(describe(error));
    }
  }, [nodeChainId]);

  const reprice = useCallback(async () => {
    if (account === null || client === null) {
      setProblem({
        code: "no_account",
        message: client === null ? "RPC not configured." : "Connect your wallet first.",
        detail: null,
      });
      return;
    }
    setProblem(null);
    setNotice(null);
    setReceipt(null);
    setQuote(null);
    setPhase("quoting");
    try {
      const assets = parseAssetInput(amount);
      const next = await quoteDeposit(client, { vault, asset, account, assets });
      setQuote(next);
      setPhase("idle");
    } catch (error) {
      setPhase("error");
      setProblem(describe(error));
    }
  }, [account, amount, asset, client, vault]);

  const submit = useCallback(async () => {
    if (quote === null || account === null || client === null) return;
    const bag = (globalThis as { ethereum?: unknown }).ethereum;
    const provider = findInjectedProvider({ ethereum: bag });
    if (provider === null) {
      setProblem({ code: "no_provider", message: "Wallet disconnected. Please reload and reconnect.", detail: null });
      return;
    }
    setProblem(null);
    setNotice(null);
    setPhase("signing");
    try {
      if ((await readChainId(provider)) !== nodeChainId) {
        setProblem({ code: "wrong_network", message: `Wallet is not on chain ${nodeChainId}. Switch networks and retry.`, detail: null });
        setPhase("error");
        return;
      }
      const walletClient = createWalletClient({ chain: CHAIN, account, transport: custom(provider) });
      const result = await submitDeposit({
        client,
        signer: {
          account,
          sendTransaction: (request) => {
            const req = request as Record<string, unknown>;
            if ("abi" in req) {
              return walletClient.writeContract(req as Parameters<typeof walletClient.writeContract>[0]);
            }
            return walletClient.sendTransaction(request as Parameters<typeof walletClient.sendTransaction>[0]);
          },
        },
        vault,
        asset,
        assets: quote.assets,
        receiver: account,
        quote,
      });
      setReceipt(result);
      // Same rule as the withdraw form: the quote belonged to a block that is now history.
      setQuote(null);
      setPhase("done");
    } catch (error) {
      setPhase("error");
      setProblem(describe(error));
    }
  }, [account, asset, client, nodeChainId, quote, vault]);

  const gateClosed = gate.isShutdown || gate.isPaused === true || gate.depositLimit === 0n;
  const busy = phase === "quoting" || phase === "signing" || phase === "pending";
  const approvalNeeded = quote !== null && needsApproval(quote.allowance, quote.assets);

  return (
    <div className="space-y-4">

      {/* Gate Status Info */}
      <div className="rounded-xl bg-[#0d1a14] border border-white/[0.08] p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-mono uppercase tracking-wider text-[#a3abb8]">Vault</span>
            <span className="font-mono text-xs text-[#6db89b]"><AddressText address={vault} /></span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-mono uppercase tracking-wider text-[#a3abb8]">Asset</span>
            <span className="font-mono text-xs text-[#f8f9fa]">{assetSymbol} <AddressText address={asset} /></span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-mono uppercase tracking-wider text-[#a3abb8]">Deposit cap</span>
            <span className="font-mono text-sm tabular-nums text-[#f8f9fa]"><Amount value={gate.depositLimit} kind="usdg" /></span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-mono uppercase tracking-wider text-[#a3abb8]">Deposit gate</span>
            <span
              className={`text-xs font-medium ${
                gateClosed
                  ? "text-[#f87171]"
                  : gate.source === "captured" || gate.source === "unavailable"
                    ? "text-[#e8c468]"
                    : "text-[#6db89b]"
              }`}
            >
              {gate.isShutdown
                ? "Shutdown — deposits permanently closed"
                : gate.isPaused === true
                  ? "Paused — deposits and withdrawals blocked"
                  : gate.depositLimit === 0n
                    ? "Closed — the cap is 0"
                    : gate.source === "captured" || gate.source === "unavailable"
                      ? "Staging / Rehearsal Fork (Not live)"
                      : "Open — below the cap"}
            </span>
          </div>
        </div>
        <p className="provenance mt-3">
          Gate data sourced on-chain at block {gate.blockNumber.toString()} ({blockTime(gate.blockTimestamp)}).
        </p>
      </div>

      {/* Gate Closed Message */}
      {gateClosed ? (
        <div className="rounded-xl bg-[#1a0f0f] border border-red-500/20 p-4" role="status">
          <p className="text-sm text-[#f87171] font-medium">
            Deposit form disabled: {gate.isPaused === true ? "the vault is paused" : gate.isShutdown ? "the vault is shutdown" : "the deposit cap is 0"}.
          </p>
          <p className="text-xs text-[#9ca3af] mt-1">No deposit transactions can be submitted while the vault gate is closed.</p>
        </div>
      ) : (
        <>
          {/* Amount Input Card */}
          <div className="rounded-xl bg-[#0d1a14] border border-white/[0.10] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="deposit-amount" className="text-sm font-medium text-[#f8f9fa]">
                Deposit Amount
              </label>
              {quote !== null && (
                <span className="text-xs text-[#a3abb8] font-mono tabular-nums">
                  Balance: <span className="text-[#f8f9fa]"><Amount value={quote.balance} kind="usdg" /></span>
                </span>
              )}
            </div>

            {/* Input + Asset Pill */}
            <div className="relative flex items-center rounded-xl bg-[#14221c] border border-white/[0.12] focus-within:border-[#6db89b] focus-within:shadow-[0_0_0_1px_rgba(109,184,155,0.3)] transition-all">
              <input
                id="deposit-amount"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setQuote(null);
                }}
                placeholder="0.00"
                className="flex-1 bg-transparent text-2xl font-mono tabular-nums text-[#f8f9fa] placeholder-[#4b5563] px-4 py-3.5 outline-none min-w-0"
              />
              <div className="flex items-center gap-2 pr-3 shrink-0">
                <span className="bg-[#6db89b]/10 border border-[#6db89b]/20 rounded-full px-2.5 py-1 text-xs font-mono font-semibold text-[#6db89b]">
                  {assetSymbol}
                </span>
                {quote !== null && quote.balance > 0n && (
                  <button
                    type="button"
                    onClick={() => {
                      const decimals = 6;
                      const whole = quote.balance / 10n ** 6n;
                      const fraction = (quote.balance % 10n ** 6n).toString().padStart(decimals, "0").replace(/0+$/, "");
                      setAmount(fraction === "" ? whole.toString() : `${whole}.${fraction}`);
                      setQuote(null);
                    }}
                    className="text-[11px] font-mono font-semibold text-[#6db89b] hover:text-[#f8f9fa] transition-colors px-1.5 py-0.5 rounded border border-[#6db89b]/20 hover:border-[#6db89b]/50"
                  >
                    MAX
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Chain Warning */}
          {chainId !== null && chainId !== nodeChainId ? (
            <div className="rounded-xl bg-[#1a1200] border border-[#e8c468]/20 p-3.5" role="alert">
              <p className="text-sm text-[#e8c468]">
                ⚠ Wallet is connected to chain {chainId}. This form only submits transactions to chain {nodeChainId}.
              </p>
            </div>
          ) : null}

          {/* Notice */}
          {notice !== null ? (
            <p className="provenance">{notice}</p>
          ) : null}

          {/* Quote Breakdown */}
          {quote !== null ? (
            <div className="rounded-xl bg-[#0d1a14] border border-white/[0.08] p-4 space-y-2.5">
              <h3 className="text-xs font-mono uppercase tracking-wider text-[#a3abb8] mb-3">Quote Preview</h3>
              {[
                { label: "Estimated Shares", value: <Amount value={quote.shares} kind="shares" decimals={shareDecimals} /> },
                { label: "Minimum Shares (0.5% Slippage)", value: <Amount value={quote.minShares} kind="shares" decimals={shareDecimals} /> },
                { label: "Current Deposit Capacity", value: <Amount value={quote.maxAssets} kind="usdg" /> },
                { label: "USDG Balance", value: <Amount value={quote.balance} kind="usdg" /> },
                { label: "Current Allowance", value: <Amount value={quote.allowance} kind="usdg" /> },
                { label: "Approval Required", value: approvalNeeded ? "Yes — for the deposit amount" : "No" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-baseline justify-between gap-4 py-1.5 border-b border-white/[0.05] last:border-0">
                  <span className="text-xs text-[#a3abb8] shrink-0">{label}</span>
                  <span className="font-mono text-sm tabular-nums text-[#f8f9fa] text-right">{value}</span>
                </div>
              ))}
            </div>
          ) : null}

          {/* Blockers */}
          {blocked.length > 0 ? (
            <div className="space-y-2">
              {blocked.map((entry) => (
                <div key={entry.code} className="rounded-lg bg-[#1a0f0f] border border-red-500/20 px-3.5 py-2.5" role="alert">
                  <span className="font-mono text-[11px] text-red-400 font-semibold">{entry.code}</span>
                  <span className="text-sm text-[#f87171] ml-2">{entry.message}</span>
                </div>
              ))}
            </div>
          ) : null}

          {/* Action Buttons */}
          <div className="space-y-2.5">
            {/* Connect Wallet */}
            <button
              type="button"
              onClick={connect}
              disabled={account !== null}
              className={`w-full flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold transition-all min-h-[48px] ${
                account !== null
                  ? "bg-[#14221c] border border-[#6db89b]/30 text-[#6db89b] cursor-default"
                  : "bg-[#f8f9fa] text-[#0b1310] hover:bg-white shadow-[0_0_20px_rgba(255,255,255,0.12)]"
              }`}
            >
              {account !== null ? (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-[#6db89b]" />
                  Connected: {account.slice(0, 6)}…{account.slice(-4)}
                </>
              ) : (
                "Connect Wallet"
              )}
            </button>

            {/* Calculate Shares */}
            <button
              type="button"
              onClick={reprice}
              disabled={busy || account === null}
              className="w-full flex items-center justify-center rounded-xl border border-[#6db89b]/30 bg-[#6db89b]/05 text-[#6db89b] hover:bg-[#6db89b]/10 hover:border-[#6db89b]/50 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-3.5 text-sm font-semibold transition-all min-h-[48px]"
            >
              {phase === "quoting" ? (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  Reading chain…
                </span>
              ) : "Calculate Shares"}
            </button>

            {/* Deposit Button */}
            <button
              type="button"
              onClick={submit}
              disabled={quote === null || blocked.length > 0 || phase === "signing" || phase === "pending"}
              className="w-full flex items-center justify-center rounded-xl bg-[#f8f9fa] text-[#0b1310] hover:bg-white disabled:bg-white/[0.1] disabled:text-[#9ca3af] disabled:cursor-not-allowed px-5 py-3.5 text-sm font-bold transition-all min-h-[48px] shadow-[0_0_20px_rgba(255,255,255,0.08)]"
            >
              {phase === "signing" ? (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-[#0b1310] border-t-transparent animate-spin" />
                  Awaiting signature…
                </span>
              ) : phase === "pending" ? (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-[#0b1310] border-t-transparent animate-spin" />
                  Transaction pending…
                </span>
              ) : (
                <>Deposit {assetSymbol} →</>
              )}
            </button>
          </div>

          <p className="provenance">
            Share estimate is from block {quote === null ? "—" : quote.blockNumber.toString()}. Final share count is sourced exclusively from the on-chain <code className="font-mono text-[11px]">Deposit</code> event.
          </p>
        </>
      )}

      {/* Error */}
      {problem !== null ? (
        <div className="rounded-xl bg-[#1a0f0f] border border-red-500/20 p-4" role="alert">
          <div className="flex items-start gap-3">
            <span className="font-mono text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1.5 py-0.5 shrink-0 mt-0.5">
              {problem.code}
            </span>
            <div className="space-y-1 min-w-0">
              <p className="text-sm text-[#f87171]">{problem.message}</p>
              {problem.detail !== null && (
                <p className="provenance">{problem.detail}</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Receipt */}
      {receipt !== null ? (
        <div className="rounded-xl bg-[#0a1f14] border border-[#6db89b]/30 p-4" role="status">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#6db89b]/20">
              <svg className="w-3 h-3 text-[#6db89b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <span className="text-sm font-semibold text-[#6db89b]">Deposit Confirmed</span>
          </div>
          <p className="text-sm text-[#b0b7c3]">
            Settled at block <span className="font-mono text-[#f8f9fa]">{receipt.blockNumber.toString()}</span>.
            Final from event: <span className="font-mono text-[#f8f9fa]"><Amount value={receipt.shares} kind="shares" decimals={shareDecimals} /></span> for{" "}
            <span className="font-mono text-[#f8f9fa]"><Amount value={receipt.assets} kind="usdg" /></span>.
          </p>
          <p className="provenance mt-2">
            tx {receipt.depositTx as Hex}
            {receipt.approveTx === null ? "" : ` · approve ${receipt.approveTx}`}
          </p>
        </div>
      ) : null}
    </div>
  );
}
