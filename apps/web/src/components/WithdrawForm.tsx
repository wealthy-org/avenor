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
  AVENOR_CHAIN_ID,
  WalletError,
  connectWallet,
  findInjectedProvider,
  mapWalletError,
  readChainId,
  switchToAvenorChain,
} from "@/lib/wallet";
import { Amount, AddressText } from "@/components/primitives";
import { blockTime, percentBps } from "@/lib/format";

export interface WithdrawFormProps {
  vault: Address;
  assetSymbol: string;
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

const CHAIN = {
  id: AVENOR_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://placeholder.invalid"] } },
} as const;

function rpcUrl(): string {
  const value = process.env.NEXT_PUBLIC_RPC_URL;
  if (typeof value !== "string" || value.trim() === "") {
    throw new WithdrawError("rpc", "NEXT_PUBLIC_RPC_URL belum diset: form tidak bisa membaca chain dan tidak menebak.");
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

export function WithdrawForm({ vault, assetSymbol, live }: WithdrawFormProps) {
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
  }, []);

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

  const connect = useCallback(async () => {
    setProblem(null);
    try {
      const bag = (globalThis as { ethereum?: unknown }).ethereum;
      const connected = await connectWallet(findInjectedProvider({ ethereum: bag }));
      setAccount(connected.account);
      setChainId(connected.chainId);
      if (connected.chainId !== AVENOR_CHAIN_ID) {
        const result = await switchToAvenorChain(connected.provider);
        if (result.switched) setChainId(await readChainId(connected.provider));
        else setProblem({ code: "wrong_network", message: result.reason ?? "Wallet menolak pindah chain.", detail: null });
      }
    } catch (error) {
      setProblem(describe(error));
    }
  }, []);

  const reprice = useCallback(async () => {
    if (account === null || client === null) {
      setProblem({
        code: "no_account",
        message: client === null ? "RPC tidak dikonfigurasi." : "Hubungkan wallet dulu.",
        detail: null,
      });
      return;
    }
    setProblem(null);
    setReceipt(null);
    setQuote(null);
    setPhase("quoting");
    try {
      const parsed = mode === "assets" ? parseAssetInput(amount) : parseShareInput(amount);
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
      setProblem({ code: "no_provider", message: "Wallet hilang dari halaman. Muat ulang dan hubungkan lagi.", detail: null });
      return;
    }
    setProblem(null);
    setPhase("signing");
    try {
      if ((await readChainId(provider)) !== AVENOR_CHAIN_ID) {
        setProblem({ code: "wrong_network", message: `Wallet bukan di chain ${AVENOR_CHAIN_ID}.`, detail: null });
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
    const decimals = mode === "assets" ? 6 : 18;
    const whole = max / 10n ** BigInt(decimals);
    const fraction = (max % 10n ** BigInt(decimals)).toString().padStart(decimals, "0").replace(/0+$/, "");
    setAmount(fraction === "" ? whole.toString() : `${whole}.${fraction}`);
  }, [mode, quote]);

  const lossTooHigh = customLoss.trim() !== "" ? Number(customLoss) >= MAX_LOSS_BPS : lossBps >= MAX_LOSS_BPS;

  return (
    <div className="stack" style={{ background: "#0b1310", color: "#f8f9fa", minHeight: "100%" }}>

      {/* ── 1. Paused Alert Banner ── */}
      {live.isPaused ? (
        <div
          role="alert"
          style={{
            background: "rgba(220,38,38,0.12)",
            border: "1px solid rgba(220,38,38,0.4)",
            borderRadius: "0.75rem",
            padding: "0.875rem 1.25rem",
            display: "flex",
            gap: "0.75rem",
            alignItems: "flex-start",
          }}
        >
          <span style={{ color: "#f87171", fontSize: "1.1rem", lineHeight: 1.4 }}>⚠</span>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "#fca5a5", lineHeight: 1.5 }}>
            <strong style={{ color: "#f87171" }}>Vault Paused.</strong>{" "}
            <code>withdraw</code> and <code>redeem</code> functions will revert on-chain (<code>assert not self.paused</code> in{" "}
            <code>VaultV3.vy</code>). This is an on-chain protocol invariant: transactions will be rejected by the node.
          </p>
        </div>
      ) : null}

      {/* ── 2. Position Summary Card ── */}
      <div
        style={{
          background: "#101b16",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "1rem",
          padding: "1.25rem 1.5rem",
          backdropFilter: "blur(8px)",
        }}
      >
        {/* Two large stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "1.25rem",
            marginBottom: "1rem",
          }}
        >
          <div>
            <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "#8b929e", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Position Value
            </p>
            <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#f8f9fa" }}>
              {quote === null ? "—" : <Amount value={quote.positionAssets} kind="usdg" />}
            </p>
          </div>
          <div>
            <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "#8b929e", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Immediately Withdrawable
            </p>
            <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#6db89b" }}>
              {quote === null ? "—" : <Amount value={quote.maxAssets} kind="usdg" />}
            </p>
          </div>
        </div>

        {/* Smaller muted stats */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
            paddingTop: "0.75rem",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            marginBottom: "0.75rem",
          }}
        >
          <span style={{ fontSize: "0.78rem", color: "#8b929e" }}>
            <span style={{ color: "#adb5bd" }}>Vault Idle Reserves:</span>{" "}
            <Amount value={live.totalIdle} kind="usdg" />
            {quote !== null && <> ({percentBps(idleCoverageBps(quote))} of requested assets)</>}
          </span>
          <span style={{ fontSize: "0.78rem", color: "#8b929e" }}>
            <span style={{ color: "#adb5bd" }}>Loss Tolerance:</span>{" "}
            {quote === null
              ? `${lossBps} bps`
              : `${quote.maxLossBps} bps = ${maxLossAssets(quote).toString()} asset units`}
          </span>
        </div>

        {/* Important warning badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            background: "rgba(251,191,36,0.08)",
            border: "1px solid rgba(251,191,36,0.25)",
            borderRadius: "9999px",
            padding: "0.2rem 0.75rem",
            fontSize: "0.72rem",
            color: "#fbbf24",
            marginBottom: "0.75rem",
          }}
        >
          ⚠ Position Value ≠ Immediately Withdrawable Amount
        </div>

        <p className="provenance" style={{ margin: 0, fontSize: "0.72rem", color: "#6b7280" }}>
          On-chain vault metrics verified at block #{live.blockNumber.toString()} ({blockTime(live.blockTimestamp)} UTC). Position value
          is not an instant liquidity guarantee: immediately withdrawable {assetSymbol} is bounded by{" "}
          <code>maxWithdraw</code>/<code>maxRedeem</code>, which dynamically track venue liquidity queues.
        </p>
      </div>

      {/* ── 3. Mode Selector ── */}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        {(["assets", "shares"] as WithdrawMode[]).map((m) => {
          const selected = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setQuote(null);
              }}
              style={{
                flex: 1,
                minHeight: "44px",
                borderRadius: "10px",
                border: selected ? "none" : "1px solid rgba(255,255,255,0.14)",
                background: selected ? "#f8f9fa" : "#14221c",
                color: selected ? "#0b1310" : "#adb5bd",
                fontWeight: selected ? 700 : 500,
                fontSize: "0.875rem",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {m === "assets" ? "Withdraw USDG" : "Redeem Shares (avUSDG)"}
            </button>
          );
        })}
      </div>

      {/* ── 4. Connect Wallet row ── */}
      {account === null ? (
        <button
          type="button"
          onClick={connect}
          className="button"
          style={{
            width: "100%",
            minHeight: "48px",
            background: "#f8f9fa",
            color: "#0b1310",
            fontWeight: 700,
            fontSize: "0.9375rem",
            borderRadius: "10px",
          }}
        >
          Connect Wallet
        </button>
      ) : null}

      {/* ── 5. Amount Input Card ── */}
      <div
        style={{
          background: "#14221c",
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: "12px",
          padding: "1rem",
        }}
      >
        {/* Label row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <label
            htmlFor="withdraw-amount"
            style={{ fontSize: "0.78rem", color: "#8b929e", textTransform: "uppercase", letterSpacing: "0.06em" }}
          >
            Amount ({mode === "assets" ? assetSymbol : "shares"})
          </label>
          {account !== null && (
            <span
              style={{
                fontFamily: "monospace",
                fontSize: "0.72rem",
                background: "rgba(109,184,155,0.1)",
                border: "1px solid rgba(109,184,155,0.25)",
                color: "#6db89b",
                borderRadius: "9999px",
                padding: "0.15rem 0.6rem",
              }}
            >
              {account.slice(0, 6)}…{account.slice(-4)}
            </span>
          )}
        </div>
        {/* Input + MAX */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
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
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: "1.5rem",
              fontFamily: "monospace",
              fontVariantNumeric: "tabular-nums",
              color: "#f8f9fa",
            }}
          />
          <button
            type="button"
            onClick={setMax}
            disabled={quote === null}
            style={{
              background: "rgba(109,184,155,0.12)",
              border: "1px solid rgba(109,184,155,0.3)",
              color: "#6db89b",
              borderRadius: "0.5rem",
              padding: "0.35rem 0.75rem",
              fontSize: "0.75rem",
              fontWeight: 700,
              cursor: quote === null ? "not-allowed" : "pointer",
              opacity: quote === null ? 0.4 : 1,
            }}
          >
            MAX
          </button>
        </div>
      </div>

      {/* ── 6. Loss Tolerance Fieldset ── */}
      <fieldset
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "12px",
          padding: "1rem",
          background: "#101b16",
        }}
      >
        <legend style={{ padding: "0 0.5rem", fontSize: "0.78rem", color: "#8b929e", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Loss Tolerance Budget (Enforced as explicit <code>max_loss</code>)
        </legend>

        {/* Preset pill chips */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
          {PRESETS.map((preset) => {
            const isSelected = customLoss.trim() === "" && lossBps === preset;
            return (
              <label
                key={preset}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  cursor: "pointer",
                  border: isSelected ? "1px solid #6db89b" : "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "9999px",
                  padding: "0.3rem 0.875rem",
                  fontSize: "0.8125rem",
                  color: isSelected ? "#6db89b" : "#8b929e",
                  background: isSelected ? "rgba(109,184,155,0.08)" : "transparent",
                  transition: "all 0.15s",
                }}
              >
                <input
                  type="radio"
                  name="loss"
                  checked={isSelected}
                  onChange={() => {
                    setLossBps(preset);
                    setCustomLoss("");
                    setQuote(null);
                  }}
                  style={{ display: "none" }}
                />
                {preset} bps {preset === 0 ? "(Recommended)" : ""}
              </label>
            );
          })}
        </div>

        {/* Custom input */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <label
            htmlFor="loss-custom"
            style={{ fontSize: "0.78rem", color: "#8b929e", whiteSpace: "nowrap" }}
          >
            Custom bps (0–9999)
          </label>
          <input
            id="loss-custom"
            inputMode="numeric"
            value={customLoss}
            onChange={(event) => {
              setCustomLoss(event.target.value);
              setQuote(null);
            }}
            placeholder="9999"
            style={{
              width: "5.5rem",
              background: "#14221c",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: "0.5rem",
              padding: "0.3rem 0.6rem",
              color: "#f8f9fa",
              fontSize: "0.875rem",
              fontFamily: "monospace",
              outline: "none",
            }}
          />
        </div>

        {/* lossTooHigh warning */}
        {lossTooHigh ? (
          <p
            role="alert"
            style={{
              marginTop: "0.75rem",
              marginBottom: 0,
              fontSize: "0.8125rem",
              color: "#fbbf24",
              background: "rgba(251,191,36,0.08)",
              border: "1px solid rgba(251,191,36,0.2)",
              borderRadius: "0.5rem",
              padding: "0.5rem 0.75rem",
            }}
          >
            10000 bps indicates total 100% loss acceptance. The Avenor SDK rejects this parameter: value is not sent.
          </p>
        ) : null}

        <p className="provenance" style={{ marginBottom: 0, marginTop: "0.75rem", fontSize: "0.72rem", color: "#6b7280" }}>
          Yearn V3 on-chain defaults are 0 for <code>withdraw</code> and 10000 for <code>redeem</code>. This interface always transmits
          your explicitly selected bound, eliminating hidden default slippage.
        </p>
      </fieldset>

      {/* ── 7. Calculate Button ── */}
      <button
        type="button"
        onClick={reprice}
        disabled={phase === "quoting" || phase === "signing"}
        style={{
          width: "100%",
          minHeight: "48px",
          background: "rgba(109,184,155,0.06)",
          border: "1px solid #6db89b",
          color: "#6db89b",
          fontWeight: 600,
          fontSize: "0.9375rem",
          borderRadius: "10px",
          cursor: phase === "quoting" || phase === "signing" ? "not-allowed" : "pointer",
          opacity: phase === "quoting" || phase === "signing" ? 0.6 : 1,
          transition: "all 0.15s",
        }}
      >
        {phase === "quoting" ? "Quoting On-Chain Liquidity…" : "Calculate Withdrawal Quote"}
      </button>

      {/* ── 8. Chain Warning ── */}
      {chainId !== null && chainId !== AVENOR_CHAIN_ID ? (
        <div
          role="alert"
          style={{
            background: "rgba(251,191,36,0.08)",
            border: "1px solid rgba(251,191,36,0.25)",
            borderRadius: "0.75rem",
            padding: "0.75rem 1rem",
            fontSize: "0.875rem",
            color: "#fbbf24",
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
          }}
        >
          <span>⚠</span>
          <span>
            Wallet connected to Chain ID <strong>{chainId}</strong>. Avenor requires Robinhood Chain (<strong>{AVENOR_CHAIN_ID}</strong>).
          </span>
        </div>
      ) : null}

      {/* ── 9. Quote Result Card ── */}
      {quote !== null ? (
        <div
          style={{
            background: "#101b16",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "1rem",
            padding: "1.25rem",
            backdropFilter: "blur(8px)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", paddingBottom: "0.5rem", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize: "0.75rem", color: "#6db89b", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
              On-Chain Withdrawal Preview
            </span>
            <span style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#8b929e" }}>
              Block #{quote.blockNumber.toString()}
            </span>
          </div>

          <dl style={{ margin: 0 }}>
            {[
              { label: "Estimated Assets to Receive", value: <Amount value={quote.assets} kind="usdg" /> },
              { label: "Estimated Shares to Burn", value: <Amount value={quote.shares} kind="shares" /> },
              { label: "Maximum Asset Ceiling", value: <Amount value={quote.maxAssets} kind="usdg" /> },
              { label: "Maximum Share Ceiling", value: <Amount value={quote.maxShares} kind="shares" /> },
              { label: "Current Share Balance", value: <Amount value={quote.shareBalance} kind="shares" /> },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  padding: "0.4rem 0",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  gap: "1rem",
                }}
              >
                <dt style={{ fontSize: "0.8125rem", color: "#8b929e", margin: 0 }}>{label}</dt>
                <dd style={{ fontFamily: "monospace", fontSize: "0.8125rem", color: "#f8f9fa", margin: 0, fontVariantNumeric: "tabular-nums" }}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          {/* Withdrawal warnings as amber pill-badges */}
          {withdrawWarnings(quote, { isPaused: live.isPaused, isShutdown: live.isShutdown }).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.875rem" }}>
              {withdrawWarnings(quote, { isPaused: live.isPaused, isShutdown: live.isShutdown }).map((warning) => (
                <span
                  key={warning.case}
                  role={warning.case === "W6" ? "alert" : undefined}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    background: "rgba(251,191,36,0.08)",
                    border: "1px solid rgba(251,191,36,0.25)",
                    borderRadius: "9999px",
                    padding: "0.2rem 0.75rem",
                    fontSize: "0.75rem",
                    color: "#fbbf24",
                  }}
                >
                  <strong>{warning.case}</strong>: {warning.message}
                  {warning.case === "idle"
                    ? ` Idle reserves cover ${percentBps(idleCoverageBps(quote))} of requested amount.`
                    : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* ── 10. Blockers list ── */}
      {blocked.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {blocked.map((entry) => (
            <div
              key={entry.code}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                background: "rgba(220,38,38,0.08)",
                border: "1px solid rgba(220,38,38,0.25)",
                borderRadius: "8px",
                padding: "0.5rem 0.875rem",
                fontSize: "0.8125rem",
                color: "#f87171",
              }}
            >
              <strong>{entry.code.toUpperCase()}</strong>: {entry.message}
            </div>
          ))}
        </div>
      ) : null}

      {/* ── 11. Submit Button ── */}
      <button
        type="button"
        onClick={submit}
        disabled={quote === null || blocked.length > 0 || live.isPaused || lossTooHigh || phase === "signing"}
        style={{
          width: "100%",
          minHeight: "48px",
          background:
            quote === null || blocked.length > 0 || live.isPaused || lossTooHigh || phase === "signing"
              ? "rgba(248,249,250,0.1)"
              : "#f8f9fa",
          color: quote === null || blocked.length > 0 || live.isPaused || lossTooHigh || phase === "signing" ? "#6b7280" : "#0b1310",
          fontWeight: 700,
          fontSize: "0.9375rem",
          border: "none",
          borderRadius: "10px",
          cursor:
            quote === null || blocked.length > 0 || live.isPaused || lossTooHigh || phase === "signing"
              ? "not-allowed"
              : "pointer",
          transition: "all 0.15s",
        }}
      >
        {phase === "signing"
          ? "Awaiting Wallet Signature…"
          : mode === "assets"
          ? "Withdraw USDG"
          : "Redeem Shares"}
      </button>
      <p className="provenance" style={{ margin: 0, fontSize: "0.72rem", color: "#6b7280" }}>
        Share numbers above are previews evaluated at block #{quote === null ? "—" : quote.blockNumber.toString()}. Final realized numbers derive strictly from the on-chain Withdraw event receipt.
      </p>

      {/* ── 12. Problem / Error ── */}
      {problem !== null ? (
        <div
          role="alert"
          style={{
            background: "rgba(220,38,38,0.08)",
            border: "1px solid rgba(220,38,38,0.3)",
            borderRadius: "0.75rem",
            padding: "0.875rem 1.25rem",
            fontSize: "0.875rem",
            color: "#fca5a5",
          }}
        >
          <span
            style={{
              fontFamily: "monospace",
              fontSize: "0.75rem",
              background: "rgba(220,38,38,0.2)",
              borderRadius: "0.25rem",
              padding: "0.1rem 0.4rem",
              marginRight: "0.5rem",
              color: "#f87171",
            }}
          >
            {problem.code}
          </span>
          {problem.message}
          {problem.detail === null ? null : (
            <span className="provenance" style={{ display: "block", marginTop: "0.3rem", fontSize: "0.72rem", color: "#9ca3af" }}>
              {problem.detail}
            </span>
          )}
        </div>
      ) : null}

      {/* ── 13. Receipt success card ── */}
      {receipt !== null ? (
        <div
          role="status"
          style={{
            background: "rgba(109,184,155,0.08)",
            border: "1px solid rgba(109,184,155,0.3)",
            borderRadius: "0.75rem",
            padding: "1rem 1.25rem",
          }}
        >
          <p style={{ margin: "0 0 0.5rem", fontWeight: 700, color: "#6db89b", fontSize: "0.9375rem" }}>
            ✓ Withdrawal Confirmed on-Chain
          </p>
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem", color: "#d1fae5" }}>
            Mined at block <strong>#{receipt.blockNumber.toString()}</strong> with{" "}
            <code>max_loss</code> parameter {receipt.maxLossBps} bps. Realized event payload:{" "}
            <Amount value={receipt.assets} kind="usdg" /> for{" "}
            <Amount value={receipt.shares} kind="shares" />.
          </p>
          <p className="provenance" style={{ margin: 0, fontSize: "0.72rem", color: "#6b7280", fontFamily: "monospace" }}>
            Tx: {receipt.withdrawTx as Hex} · Receiver: <AddressText address={receipt.receiver} />
            {live.isShutdown ? " · vault shutdown: redemptions remain functional; deposits disabled" : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}