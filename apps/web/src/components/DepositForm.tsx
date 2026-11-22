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
          sendTransaction: (request) => walletClient.sendTransaction(request as Parameters<typeof walletClient.sendTransaction>[0]),
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
      <dl className="facts">
        <dt>Vault</dt>
        <dd>
          <AddressText address={vault} />
        </dd>
        <dt>Aset</dt>
        <dd>
          {assetSymbol} <AddressText address={asset} />
        </dd>
        <dt>Batas deposit on-chain</dt>
        <dd>
          <Amount value={gate.depositLimit} kind="usdg" />
        </dd>
        <dt>Status</dt>
        <dd>
          {gate.isShutdown
            ? "shutdown: deposit tertutup permanen"
            : gate.isPaused
              ? "dijeda (deposit dan penarikan diblokir)"
              : gate.depositLimit === 0n
                ? "deposit_limit = 0: deposit ditutup"
                : "terbuka menurut deposit_limit"}
        </dd>
      </dl>
      <p className="provenance">
        Angka gerbang dari chain pada blok {gate.blockNumber.toString()} ({blockTime(gate.blockTimestamp)}).
      </p>

      {gateClosed ? (
        <p role="status">Form tidak diaktifkan: {gate.isPaused ? "vault dijeda" : gate.isShutdown ? "vault shutdown" : "deposit_limit = 0"}. Tidak ada tombol deposit.</p>
      ) : (
        <>
          <div className="row">
            <label htmlFor="deposit-amount">Jumlah {assetSymbol}</label>
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
            />
            <button type="button" onClick={reprice} disabled={phase === "quoting" || phase === "signing" || phase === "pending"}>
              {phase === "quoting" ? "Membaca chain…" : "Hitung share"}
            </button>
            <button type="button" onClick={connect} disabled={account !== null}>
              {account === null ? "Hubungkan wallet" : `Terhubung: ${account.slice(0, 6)}…${account.slice(-4)}`}
            </button>
          </div>

          {chainId !== null && chainId !== AVENOR_CHAIN_ID ? (
            <p role="alert">Wallet di chain {chainId}. Form hanya mengirim transaksi ke chain {AVENOR_CHAIN_ID}.</p>
          ) : null}

          {notice !== null ? <p className="provenance">{notice}</p> : null}

          {quote !== null ? (
            <dl className="facts">
              <dt>Perkiraan share</dt>
              <dd>
                <Amount value={quote.shares} kind="shares" />
              </dd>
              <dt>Kapasitas deposit sekarang</dt>
              <dd>
                <Amount value={quote.maxAssets} kind="usdg" />
              </dd>
              <dt>Saldo USDG</dt>
              <dd>
                <Amount value={quote.balance} kind="usdg" />
              </dd>
              <dt>Allowance sekarang</dt>
              <dd>
                <Amount value={quote.allowance} kind="usdg" />
              </dd>
              <dt>Approve dibutuhkan</dt>
              <dd>{needsApproval(quote.allowance, quote.assets) ? "ya, sebesar jumlah deposit" : "tidak"}</dd>
            </dl>
          ) : null}

          {blocked.length > 0 ? (
            <ul>
              {blocked.map((entry) => (
                <li key={entry.code}>
                  <strong>{entry.code}</strong>: {entry.message}
                </li>
              ))}
            </ul>
          ) : null}

          <button
            type="button"
            onClick={submit}
            disabled={quote === null || blocked.length > 0 || phase === "signing" || phase === "pending"}
          >
            {phase === "signing" ? "Menunggu tanda tangan…" : phase === "pending" ? "Menunggu receipt…" : "Deposit"}
          </button>
          <p className="provenance">
            Share di atas adalah perkiraan pada blok {quote === null ? "—" : quote.blockNumber.toString()}. Angka final
            hanya dari event Deposit di receipt.
          </p>
        </>
      )}

      {problem !== null ? (
        <div role="alert">
          <strong>{problem.code}</strong>: {problem.message}
          {problem.detail === null ? null : <span className="provenance"> ({problem.detail})</span>}
        </div>
      ) : null}

      {receipt !== null ? (
        <div role="status">
          <p>
            Deposit masuk di blok {receipt.blockNumber.toString()}. Share final dari event:{" "}
            <Amount value={receipt.shares} kind="shares" /> untuk <Amount value={receipt.assets} kind="usdg" />.
          </p>
          <p className="provenance">
            tx {receipt.depositTx as Hex}
            {receipt.approveTx === null ? "" : ` · approve ${receipt.approveTx}`}
          </p>
        </div>
      ) : null}
    </div>
  );
}