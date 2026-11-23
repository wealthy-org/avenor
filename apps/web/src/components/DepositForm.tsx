"use client";

// Deposit form. The component owns only the interaction: every number it shows comes from
// `quoteDeposit`, every refusal comes from `depositBlockers`, and the shares it declares as final
// come from the receipt's `Deposit` event.

import { useCallback, useMemo, useState } from "react";
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
  AVENOR_CHAIN_ID,
  WalletError,
  connectWallet,
  findInjectedProvider,
  mapWalletError,
  readChainId,
  switchToAvenorChain,
} from "@/lib/wallet";
import { Amount, AddressText } from "@/components/primitives";
import { blockTime } from "@/lib/format";

export interface DepositFormProps {
  vault: Address;
  asset: Address;
  assetSymbol: string;
  /** Snapshot of the gate from the API, so the form can refuse before touching the wallet. */
  gate: { depositLimit: bigint; isPaused: boolean; isShutdown: boolean; blockNumber: bigint; blockTimestamp: string };
}

type Phase = "idle" | "quoting" | "signing" | "pending" | "done" | "error";

interface Problem {
  code: string;
  message: string;
  detail: string | null;
}

const CHAIN = {
  id: AVENOR_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://placeholder.invalid"] } },
} as const;

function rpcUrl(): string {
  const value = process.env.NEXT_PUBLIC_RPC_URL;
  if (typeof value !== "string" || value.trim() === "") {
    throw new DepositError("rpc", "NEXT_PUBLIC_RPC_URL belum diset: form tidak bisa membaca chain dan tidak akan menebak.");
  }
  return value.trim();
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

export function DepositForm({ vault, asset, assetSymbol, gate }: DepositFormProps) {
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
  }, []);

  const blocked = useMemo(() => (quote === null ? [] : depositBlockers({ assets: quote.assets, maxAssets: quote.maxAssets, balance: quote.balance, gate: quote.gate })), [quote]);

  const connect = useCallback(async () => {
    setProblem(null);
    setNotice(null);
    try {
      const bag = (globalThis as { ethereum?: unknown }).ethereum;
      const connected = await connectWallet(findInjectedProvider({ ethereum: bag }));
      setAccount(connected.account);
      setChainId(connected.chainId);
      if (connected.chainId !== AVENOR_CHAIN_ID) {
        const result = await switchToAvenorChain(connected.provider);
        if (result.switched) {
          setChainId(await readChainId(connected.provider));
        } else {
          setNotice(result.reason);
        }
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
      setProblem({ code: "no_provider", message: "Wallet hilang dari halaman. Muat ulang dan hubungkan lagi.", detail: null });
      return;
    }
    setProblem(null);
    setNotice(null);
    setPhase("signing");
    try {
      if ((await readChainId(provider)) !== AVENOR_CHAIN_ID) {
        setProblem({ code: "wrong_network", message: `Wallet bukan di chain ${AVENOR_CHAIN_ID}. Pindah chain dulu.`, detail: null });
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
      setPhase("done");
    } catch (error) {
      setPhase("error");
      setProblem(describe(error));
    }
  }, [account, asset, client, quote, vault]);

  const gateClosed = gate.isShutdown || gate.isPaused || gate.depositLimit === 0n;

  return (
    <div className="stack">
      {/* ── Gate status info card ── */}
      <div className="card" style={{ padding: "1.25rem" }}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]">Vault Contract</span>
            <span className="font-mono text-xs text-[#f8f9fa]">
              <AddressText address={vault} />
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]">Underlying Asset</span>
            <span className="font-mono text-xs text-[#f8f9fa]">
              {assetSymbol} <AddressText address={asset} />
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]">On-Chain Deposit Cap</span>
            <span className="font-mono text-xs text-[#f8f9fa]">
              <Amount value={gate.depositLimit} kind="usdg" />
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]">Gate Status</span>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono uppercase tracking-wider w-fit"
              style={{
                color: gate.isShutdown || gate.isPaused || gate.depositLimit === 0n ? "#ef4444" : "#6db89b",
                border: `1px solid ${
                  gate.isShutdown || gate.isPaused || gate.depositLimit === 0n
                    ? "rgba(239,68,68,0.3)"
                    : "rgba(109,184,155,0.3)"
                }`,
                background:
                  gate.isShutdown || gate.isPaused || gate.depositLimit === 0n
                    ? "rgba(239,68,68,0.08)"
                    : "rgba(109,184,155,0.08)",
              }}
            >
              {gate.isShutdown
                ? "× Shutdown"
                : gate.isPaused
                  ? "! Paused"
                  : gate.depositLimit === 0n
                    ? "× Cap Reached (0)"
                    : "✓ Open (Capped)"}
            </span>
          </div>
        </div>
        <p className="provenance" style={{ marginTop: "1rem" }}>
          On-chain gate parameters verified from node at block {gate.blockNumber.toString()} ({blockTime(gate.blockTimestamp)} UTC).
        </p>
      </div>

      {gateClosed ? (
        <div role="status" className="banner" data-tone="warn">
          <strong>Deposit gate closed</strong>
          <p>
            {gate.isPaused
              ? "Vault is currently paused by governance. Deposits and redemptions are paused on-chain."
              : gate.isShutdown
                ? "Vault is in shutdown state: deposits are permanently disabled."
                : "Deposit limit is set to 0 USDG. Further deposits are restricted by the deposit_hook guardrail."}
          </p>
        </div>
      ) : (
        <>
          {/* ── Interactive DeFi Input Widget ── */}
          <div
            style={{
              background: "#14221c",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: "16px",
              padding: "1.25rem",
            }}
            className="space-y-4"
          >
            {/* Widget Header Row */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-[#8b929e]">
                Deposit Amount
              </span>
              {account !== null && quote !== null && (
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-[#8b929e]">Balance:</span>
                  <span className="text-[#f8f9fa]"><Amount value={quote.balance} kind="usdg" /></span>
                </div>
              )}
            </div>

            {/* Large Amount Input Container */}
            <div
              className="flex items-center justify-between gap-3"
              style={{
                background: "#0b1310",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "12px",
                padding: "0.875rem 1rem",
              }}
            >
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
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontFamily: "var(--font-mono)",
                  fontSize: "1.75rem",
                  fontVariantNumeric: "tabular-nums",
                  color: "#f8f9fa",
                  minWidth: 0,
                }}
              />

              {/* Asset Badge */}
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-mono font-semibold"
                  style={{
                    color: "#6db89b",
                    border: "1px solid rgba(109,184,155,0.3)",
                    background: "rgba(109,184,155,0.1)",
                  }}
                >
                  {assetSymbol}
                </span>
              </div>
            </div>

            {/* Action Buttons Cluster */}
            <div className="space-y-2.5 pt-1">
              {account === null ? (
                <button
                  type="button"
                  onClick={connect}
                  className="button w-full"
                  style={{
                    minHeight: "48px",
                    background: "#f8f9fa",
                    color: "#0b1310",
                    fontWeight: 600,
                    fontSize: "0.9375rem",
                  }}
                >
                  Connect Wallet
                </button>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={reprice}
                    disabled={phase === "quoting" || phase === "signing" || phase === "pending" || amount.trim() === ""}
                    style={{
                      minHeight: "48px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(109,184,155,0.06)",
                      border: "1px solid rgba(109,184,155,0.4)",
                      borderRadius: "10px",
                      color: "#6db89b",
                      fontWeight: 600,
                      fontSize: "0.875rem",
                      cursor: phase === "quoting" ? "wait" : "pointer",
                      opacity: phase === "quoting" || amount.trim() === "" ? 0.5 : 1,
                    }}
                  >
                    {phase === "quoting" ? "Quoting On-Chain…" : "Calculate Shares"}
                  </button>

                  <button
                    type="button"
                    onClick={submit}
                    disabled={quote === null || blocked.length > 0 || phase === "signing" || phase === "pending"}
                    className="button"
                    style={{
                      minHeight: "48px",
                      background: quote === null || blocked.length > 0 ? "rgba(255,255,255,0.08)" : "#f8f9fa",
                      color: quote === null || blocked.length > 0 ? "#6b7280" : "#0b1310",
                      fontWeight: 600,
                      fontSize: "0.875rem",
                      cursor: quote === null || blocked.length > 0 ? "not-allowed" : "pointer",
                    }}
                  >
                    {phase === "signing"
                      ? "Awaiting Wallet Signature…"
                      : phase === "pending"
                        ? "Awaiting Block Confirmation…"
                        : `Deposit ${assetSymbol}`}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Chain mismatch alert */}
          {chainId !== null && chainId !== AVENOR_CHAIN_ID ? (
            <div role="alert" className="banner" data-tone="warn">
              <strong>Network Mismatch</strong>
              <p>Wallet connected to Chain ID {chainId}. Avenor operates strictly on Robinhood Chain ({AVENOR_CHAIN_ID}).</p>
            </div>
          ) : null}

          {notice !== null ? <p className="provenance">{notice}</p> : null}

          {/* ── Quote Breakdown Receipt Card ── */}
          {quote !== null ? (
            <div
              style={{
                background: "#101b16",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "14px",
                padding: "1.25rem",
              }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
                <span className="text-xs font-mono uppercase tracking-wider text-[#6db89b]">
                  Quote Breakdown (Preview)
                </span>
                <span className="text-[11px] font-mono text-[#8b929e]">
                  Block #{quote.blockNumber.toString()}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
                  <span className="text-[#8b929e]">Estimated Share Allocation</span>
                  <span className="font-mono text-[#f8f9fa] font-medium">
                    <Amount value={quote.shares} kind="shares" />
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
                  <span className="text-[#8b929e]">Available Protocol Capacity</span>
                  <span className="font-mono text-[#f8f9fa]">
                    <Amount value={quote.maxAssets} kind="usdg" />
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
                  <span className="text-[#8b929e]">Wallet USDG Balance</span>
                  <span className="font-mono text-[#f8f9fa]">
                    <Amount value={quote.balance} kind="usdg" />
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
                  <span className="text-[#8b929e]">Current Token Allowance</span>
                  <span className="font-mono text-[#f8f9fa]">
                    <Amount value={quote.allowance} kind="usdg" />
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-[#8b929e]">Approval Requirement</span>
                  <span
                    className="font-mono font-medium"
                    style={{ color: needsApproval(quote.allowance, quote.assets) ? "#e8c468" : "#6db89b" }}
                  >
                    {needsApproval(quote.allowance, quote.assets)
                      ? "Approval required (exact deposit amount)"
                      : "Sufficient allowance active"}
                  </span>
                </div>
              </div>

              <p className="provenance pt-2">
                Share numbers above are previews calculated on-chain at block #{quote.blockNumber.toString()}. Final issued shares are determined strictly by the on-chain Deposit event receipt.
              </p>
            </div>
          ) : null}

          {/* ── Blockers ── */}
          {blocked.length > 0 ? (
            <div className="space-y-2">
              {blocked.map((entry) => (
                <div key={entry.code} className="banner" data-tone="warn">
                  <strong>{entry.code.toUpperCase()}</strong>: {entry.message}
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}

      {/* ── Problem / Error Alert ── */}
      {problem !== null ? (
        <div role="alert" className="banner" data-tone="danger">
          <strong>
            <span className="pill font-mono mr-2 text-[11px]">
              {problem.code}
            </span>
            Transaction Error
          </strong>
          <p className="mt-1">{problem.message}</p>
          {problem.detail === null ? null : <p className="provenance mt-1">({problem.detail})</p>}
        </div>
      ) : null}

      {/* ── Receipt Success Card ── */}
      {receipt !== null ? (
        <div
          role="status"
          className="banner"
          style={{ borderLeftColor: "#6db89b", background: "rgba(109,184,155,0.08)" }}
        >
          <strong className="text-[#6db89b]">Deposit Confirmed on-Chain</strong>
          <p className="mt-1">
            Mined at block #{receipt.blockNumber.toString()}. Final allocated shares:{" "}
            <Amount value={receipt.shares} kind="shares" /> for <Amount value={receipt.assets} kind="usdg" />.
          </p>
          <p className="provenance mt-2">
            Tx: {receipt.depositTx as Hex}
            {receipt.approveTx === null ? "" : ` · Approval Tx: ${receipt.approveTx}`}
          </p>
        </div>
      ) : null}
    </div>
  );
}