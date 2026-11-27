"use client";

// Withdraw form. Three things it refuses to hide: that the loss budget is a real parameter (not a
// default), that "position value" is not "withdrawable now", and that the final numbers come from
// the receipt's Withdraw event.

import { useCallback, useMemo, useState } from "react";
import { createPublicClient, createWalletClient, custom, http, type Address, type Hex } from "viem";
import {
  MAX_LOSS_BPS,
  WithdrawError,
  idleCoverageBps,
  maxLossAssets,
  parseLossBps,
  parseShareInput,
  quoteWithdraw,
  submitWithdraw,
  withdrawBlockers,
  withdrawWarnings,
  type WithdrawMode,
  type WithdrawQuote,
  type WithdrawReceipt,
} from "@/lib/withdraw";
import { DepositError, parseAssetInput } from "@/lib/deposit";
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
import { blockTime, percentBps } from "@/lib/format";

export interface WithdrawFormProps {
  vault: Address;
  /** `eth_chainId` of the node this page read, so the wallet is asked for that chain and no other. */
  chainId: number;
  assetSymbol: string;
  /** `decimals()` of the share token, read from the vault: VaultV3 uses the asset's decimals (6). */
  shareDecimals: number;
  /** Live snapshot from the API, used only for the "paused" gate and provenance. */
  live: { isPaused: boolean; isShutdown: boolean; totalIdle: bigint; blockNumber: bigint; blockTimestamp: string };
}

type Phase = "idle" | "quoting" | "signing" | "done" | "error";

interface Problem {
  code: string;
  message: string;
  detail: string | null;
}

const PRESETS = [0, 10, 50, 100] as const;

function rpcUrl(): string {
  const value = process.env.NEXT_PUBLIC_RPC_URL;
  if (typeof value !== "string" || value.trim() === "") {
    throw new WithdrawError("rpc", "NEXT_PUBLIC_RPC_URL is not configured — the form cannot read on-chain state.");
  }
  return value.trim();
}

function describe(error: unknown): Problem {
  if (error instanceof WithdrawError || error instanceof DepositError) {
    return { code: error.code, message: error.message, detail: error.detail };
  }
  if (error instanceof WalletError) return { code: error.code, message: error.message, detail: error.detail };
  const wallet = mapWalletError(error);
  if (wallet !== null) return { code: wallet.code, message: wallet.message, detail: wallet.detail };
  return { code: "unknown", message: error instanceof Error ? error.message : String(error), detail: null };
}

export function WithdrawForm({ vault, chainId: nodeChainId, assetSymbol, live, shareDecimals }: WithdrawFormProps) {
  const CHAIN = chainConfig(nodeChainId);
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<WithdrawMode>("assets");
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [lossBps, setLossBps] = useState(0);
  const [customLoss, setCustomLoss] = useState("");
  const [quote, setQuote] = useState<WithdrawQuote | null>(null);
  const [receipt, setReceipt] = useState<WithdrawReceipt | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);

  const client = useMemo(() => {
    try {
      return createPublicClient({ chain: CHAIN, transport: http(rpcUrl()) });
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- CHAIN is rebuilt from nodeChainId, which is in the dep list
  }, [nodeChainId]);

  const blocked = useMemo(() => {
    if (quote === null) return [];
    return withdrawBlockers({
      mode: quote.mode,
      requested: quote.requested,
      assets: quote.assets,
      shares: quote.shares,
      maxAssets: quote.maxAssets,
      maxShares: quote.maxShares,
      shareBalance: quote.shareBalance,
      isPaused: live.isPaused,
      maxLossBps: quote.maxLossBps,
    });
  }, [live.isPaused, quote]);

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
        if (result.switched) setChainId(await readChainId(connected.provider));
        else setProblem({ code: "wrong_network", message: result.reason ?? "Wallet refused chain switch.", detail: null });
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
    setReceipt(null);
    setQuote(null);
    setPhase("quoting");
    try {
      const parsed = mode === "assets" ? parseAssetInput(amount) : parseShareInput(amount, shareDecimals);
      const bps = customLoss.trim() === "" ? parseLossBps(lossBps) : parseLossBps(customLoss);
      const next = await quoteWithdraw(client, { vault, account, mode, amount: parsed, maxLossBps: bps });
      setQuote(next);
      setPhase("idle");
    } catch (error) {
      setPhase("error");
      setProblem(describe(error));
    }
  }, [account, amount, client, customLoss, lossBps, mode, vault]);

  const submit = useCallback(async () => {
    if (quote === null || account === null || client === null) return;
    const bag = (globalThis as { ethereum?: unknown }).ethereum;
    const provider = findInjectedProvider({ ethereum: bag });
    if (provider === null) {
      setProblem({ code: "no_provider", message: "Wallet disconnected. Please reload and reconnect.", detail: null });
      return;
    }
    setProblem(null);
    setPhase("signing");
    try {
      if ((await readChainId(provider)) !== nodeChainId) {
        setProblem({ code: "wrong_network", message: `Wallet is not on chain ${nodeChainId}.`, detail: null });
        setPhase("error");
        return;
      }
      const walletClient = createWalletClient({ chain: CHAIN, account, transport: custom(provider) });
      const result = await submitWithdraw({
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
        mode: quote.mode,
        amount: quote.requested,
        receiver: account,
        quote,
        isPaused: live.isPaused,
      });
      setReceipt(result);
      setPhase("done");
    } catch (error) {
      setPhase("error");
      setProblem(describe(error));
    }
  }, [account, client, live.isPaused, quote, vault]);

  const setMax = useCallback(() => {
    if (quote === null) return;
    const max = mode === "assets" ? quote.maxAssets : quote.maxShares;
    if (max === 0n) return;
    const decimals = mode === "assets" ? 6 : shareDecimals;
    const whole = max / 10n ** BigInt(decimals);
    const fraction = (max % 10n ** BigInt(decimals)).toString().padStart(decimals, "0").replace(/0+$/, "");
    setAmount(fraction === "" ? whole.toString() : `${whole}.${fraction}`);
  }, [mode, quote, shareDecimals]);

  const lossTooHigh = customLoss.trim() !== "" ? Number(customLoss) >= MAX_LOSS_BPS : lossBps >= MAX_LOSS_BPS;
  const busy = phase === "quoting" || phase === "signing";

  return (
    <div className="space-y-4">

      {/* Paused Alert */}
      {live.isPaused ? (
        <div className="rounded-xl bg-[#1a0f0f] border border-red-500/25 p-4" role="alert">
          <p className="text-sm font-semibold text-[#f87171]">Vault is paused.</p>
          <p className="text-xs text-[#9ca3af] mt-1">
            Both <code className="font-mono">withdraw</code> and <code className="font-mono">redeem</code> revert on-chain
            while paused (<code className="font-mono text-[11px]">assert not self.paused</code> in VaultV3.vy).
            No submit button is shown — the chain would reject it regardless.
          </p>
        </div>
      ) : null}

      {/* Position Summary */}
      <div className="rounded-xl bg-[#0d1a14] border border-white/[0.08] p-4 space-y-3">
        <h3 className="text-xs font-mono uppercase tracking-wider text-[#a3abb8]">Position Snapshot</h3>
        <div className="grid grid-cols-1 min-[430px]:grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-[#a3abb8]">Position Value</span>
            <span className="font-mono text-sm tabular-nums text-[#f8f9fa]">
              {quote === null ? "—" : <Amount value={quote.positionAssets} kind="usdg" />}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-[#a3abb8]">Withdrawable Now</span>
            <span className="font-mono text-sm tabular-nums text-[#f8f9fa]">
              {quote === null ? "—" : <Amount value={quote.maxAssets} kind="usdg" />}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-[#a3abb8]">Vault Idle Cash</span>
            <span className="font-mono text-sm tabular-nums text-[#f8f9fa]">
              <Amount value={live.totalIdle} kind="usdg" />
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-[#a3abb8]">Loss Tolerance (selected)</span>
            <span className="font-mono text-sm tabular-nums text-[#f8f9fa]">
              {quote === null ? `${lossBps} bps` : `${quote.maxLossBps} bps = ${maxLossAssets(quote).toString()} asset units`}
            </span>
          </div>
        </div>
        <p className="provenance">
          On-chain data at block {live.blockNumber.toString()} ({blockTime(live.blockTimestamp)}).
          Position value is not a liquidity promise: withdrawable {assetSymbol} is bounded by{" "}
          <code className="font-mono text-xs">maxWithdraw</code> / <code className="font-mono text-xs">maxRedeem</code>, which tracks venue cash.
        </p>
      </div>

      {/* Mode Selector */}
      <div className="rounded-xl bg-[#0d1a14] border border-white/[0.08] p-4 space-y-3">
        <span className="text-xs font-mono uppercase tracking-wider text-[#a3abb8]">Withdrawal Mode</span>
        <div className="grid grid-cols-2 gap-2">
          {(["assets", "shares"] as WithdrawMode[]).map((m) => {
            const isSelected = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setQuote(null); }}
                className={`flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition-all min-h-[44px] ${
                  isSelected
                    ? "bg-[#f8f9fa] text-[#0b1310]"
                    : "bg-transparent text-[#a3abb8] border border-white/[0.10] hover:border-white/[0.2] hover:text-[#f8f9fa]"
                }`}
              >
                {m === "assets" ? `Withdraw ${assetSymbol}` : "Redeem Shares"}
              </button>
            );
          })}
        </div>
      </div>

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
            {account.slice(0, 6)}…{account.slice(-4)}
          </>
        ) : (
          "Connect Wallet"
        )}
      </button>

      {/* Amount Input */}
      <div className="rounded-xl bg-[#0d1a14] border border-white/[0.10] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label htmlFor="withdraw-amount" className="text-sm font-medium text-[#f8f9fa]">
            Amount ({mode === "assets" ? assetSymbol : "Shares"})
          </label>
        </div>
        <div className="relative flex items-center rounded-xl bg-[#14221c] border border-white/[0.12] focus-within:border-[#6db89b] focus-within:shadow-[0_0_0_1px_rgba(109,184,155,0.3)] transition-all">
          <input
            id="withdraw-amount"
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
            <span className="bg-white/[0.05] border border-white/[0.10] rounded-full px-2.5 py-1 text-xs font-mono text-[#9ca3af]">
              {mode === "assets" ? assetSymbol : "SHARES"}
            </span>
            <button
              type="button"
              onClick={setMax}
              disabled={quote === null}
              className="text-[11px] font-mono font-semibold text-[#6db89b] hover:text-[#f8f9fa] disabled:text-[#8b929e] disabled:cursor-not-allowed transition-colors px-1.5 py-0.5 rounded border border-[#6db89b]/20 hover:border-[#6db89b]/50 disabled:border-white/[0.05]"
            >
              MAX
            </button>
          </div>
        </div>
      </div>

      {/* Loss Tolerance */}
      <fieldset className="rounded-xl bg-[#0d1a14] border border-white/[0.08] p-4 space-y-3">
        <legend className="text-xs font-mono uppercase tracking-wider text-[#a3abb8] pb-1">
          Loss Tolerance — sent as explicit <code className="normal-case">max_loss</code>
        </legend>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => {
            const isSelected = customLoss.trim() === "" && lossBps === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => { setLossBps(preset); setCustomLoss(""); setQuote(null); }}
                className={`rounded-full px-4 py-2 text-sm font-mono font-semibold transition-all min-h-[36px] ${
                  isSelected
                    ? "bg-[#6db89b]/15 border border-[#6db89b]/50 text-[#6db89b]"
                    : "bg-transparent border border-white/[0.10] text-[#a3abb8] hover:border-white/[0.25] hover:text-[#f8f9fa]"
                }`}
              >
                {preset} bps
              </button>
            );
          })}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#a3abb8]">Custom (0–9999)</span>
            <input
              id="loss-custom"
              inputMode="numeric"
              value={customLoss}
              onChange={(event) => { setCustomLoss(event.target.value); setQuote(null); }}
              placeholder="—"
              className="w-16 bg-[#14221c] border border-white/[0.12] rounded-lg px-2 py-1.5 text-sm font-mono text-center text-[#f8f9fa] placeholder-[#4b5563] outline-none focus:border-[#6db89b] transition-colors"
            />
          </div>
        </div>
        {lossTooHigh ? (
          <p className="text-xs text-[#f87171]" role="alert">
            10,000 bps means accepting total loss of value. The SDK rejects this — no transaction will be sent.
          </p>
        ) : null}
        <p className="provenance">
          On-chain: <code className="font-mono text-[11px]">withdraw</code> defaults to 0, <code className="font-mono text-[11px]">redeem</code> defaults to 10,000.
          This form always sends your explicit selection — no hidden default is applied.
        </p>
      </fieldset>

      {/* Chain Warning */}
      {chainId !== null && chainId !== nodeChainId ? (
        <div className="rounded-xl bg-[#1a1200] border border-[#e8c468]/20 p-3.5" role="alert">
          <p className="text-sm text-[#e8c468]">
            ⚠ Wallet is on chain {chainId}. This form only submits transactions to chain {nodeChainId}.
          </p>
        </div>
      ) : null}

      {/* Calculate Button */}
      <button
        type="button"
        onClick={reprice}
        disabled={busy}
        className="w-full flex items-center justify-center rounded-xl border border-[#6db89b]/30 bg-[#6db89b]/05 text-[#6db89b] hover:bg-[#6db89b]/10 hover:border-[#6db89b]/50 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-3.5 text-sm font-semibold transition-all min-h-[48px]"
      >
        {phase === "quoting" ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
            Reading chain…
          </span>
        ) : "Calculate withdrawal"}
      </button>

      {/* Quote Result */}
      {quote !== null ? (
        <div className="rounded-xl bg-[#0d1a14] border border-white/[0.08] p-4 space-y-2.5">
          <h3 className="text-xs font-mono uppercase tracking-wider text-[#a3abb8] mb-3">Withdrawal Preview</h3>
          {[
            { label: "Estimated Assets Received", value: <Amount value={quote.assets} kind="usdg" /> },
            { label: "Shares to Burn (est.)", value: <Amount value={quote.shares} kind="shares" decimals={shareDecimals} /> },
            { label: "Max Withdrawable Assets", value: <Amount value={quote.maxAssets} kind="usdg" /> },
            { label: "Max Redeemable Shares", value: <Amount value={quote.maxShares} kind="shares" decimals={shareDecimals} /> },
            { label: "Share Balance", value: <Amount value={quote.shareBalance} kind="shares" decimals={shareDecimals} /> },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-baseline justify-between gap-4 py-1.5 border-b border-white/[0.05] last:border-0">
              <span className="text-xs text-[#a3abb8] shrink-0">{label}</span>
              <span className="font-mono text-sm tabular-nums text-[#f8f9fa] text-right">{value}</span>
            </div>
          ))}

          {/* Warnings */}
          {withdrawWarnings(quote, { isPaused: live.isPaused, isShutdown: live.isShutdown }).map((warning) => (
            <div
              key={warning.case}
              className={`rounded-lg px-3.5 py-2.5 mt-2 ${warning.case === "W6" ? "bg-[#1a0f0f] border border-red-500/20" : "bg-[#1a1200] border border-[#e8c468]/20"}`}
              role={warning.case === "W6" ? "alert" : undefined}
            >
              <span className={`font-mono text-[11px] font-semibold ${warning.case === "W6" ? "text-red-400" : "text-[#e8c468]"}`}>
                {warning.case}
              </span>
              <span className={`text-sm ml-2 ${warning.case === "W6" ? "text-[#f87171]" : "text-[#e8c468]"}`}>
                {warning.message}
                {warning.case === "idle" ? ` Idle cash covers ${percentBps(idleCoverageBps(quote))} of the request.` : ""}
              </span>
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

      {/* Submit Button */}
      <button
        type="button"
        onClick={submit}
        disabled={quote === null || blocked.length > 0 || live.isPaused || lossTooHigh || phase === "signing"}
        className="w-full flex items-center justify-center rounded-xl bg-[#f8f9fa] text-[#0b1310] hover:bg-white disabled:bg-white/[0.1] disabled:text-[#9ca3af] disabled:cursor-not-allowed px-5 py-3.5 text-sm font-bold transition-all min-h-[48px] shadow-[0_0_20px_rgba(255,255,255,0.08)]"
      >
        {phase === "signing" ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-[#0b1310] border-t-transparent animate-spin" />
            Awaiting signature…
          </span>
        ) : mode === "assets" ? `Withdraw ${assetSymbol} →` : "Redeem Shares →"}
      </button>

      <p className="provenance">
        {quote === null
          ? "No estimate has been computed yet: enter an amount and press Calculate, and this line will name the block it was read at."
          : `Estimate read at block ${quote.blockNumber.toString()}. Final amounts are sourced exclusively from the on-chain `}
        {quote === null ? null : <code className="font-mono text-[11px]">Withdraw</code>}
        {quote === null ? null : " event."}
      </p>

      {/* Error */}
      {problem !== null ? (
        <div className="rounded-xl bg-[#1a0f0f] border border-red-500/20 p-4" role="alert">
          <div className="flex items-start gap-3">
            <span className="font-mono text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1.5 py-0.5 shrink-0 mt-0.5">
              {problem.code}
            </span>
            <div className="space-y-1 min-w-0">
              <p className="text-sm text-[#f87171]">{problem.message}</p>
              {problem.detail !== null && <p className="provenance">{problem.detail}</p>}
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
            <span className="text-sm font-semibold text-[#6db89b]">Withdrawal Confirmed</span>
          </div>
          <p className="text-sm text-[#b0b7c3]">
            Settled at block <span className="font-mono text-[#f8f9fa]">{receipt.blockNumber.toString()}</span> with{" "}
            <code className="font-mono text-[11px]">max_loss</code> {receipt.maxLossBps} bps. From event:{" "}
            <span className="font-mono text-[#f8f9fa]"><Amount value={receipt.assets} kind="usdg" /></span> for{" "}
            <span className="font-mono text-[#f8f9fa]"><Amount value={receipt.shares} kind="shares" decimals={shareDecimals} /></span>.
          </p>
          <p className="provenance mt-2">
            tx {receipt.withdrawTx as Hex} · receiver <AddressText address={receipt.receiver} />
            {live.isShutdown ? " · vault shutdown: withdrawals proceed, deposits do not" : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
