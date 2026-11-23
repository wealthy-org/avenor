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
    <div className="stack">
      <dl className="facts">
        <dt>Nilai posisi</dt>
        <dd>{quote === null ? "—" : <Amount value={quote.positionAssets} kind="usdg" />}</dd>
        <dt>Dapat ditarik sekarang</dt>
        <dd>{quote === null ? "—" : <Amount value={quote.maxAssets} kind="usdg" />}</dd>
        <dt>Kas idle vault</dt>
        <dd>
          <Amount value={live.totalIdle} kind="usdg" /> ({quote === null ? "—" : percentBps(idleCoverageBps(quote))} dari permintaan)
        </dd>
        <dt>Toleransi loss</dt>
        <dd>
          {quote === null ? `${lossBps} bps` : `${quote.maxLossBps} bps = ${maxLossAssets(quote).toString()} unit aset`}
        </dd>
      </dl>
      <p className="provenance">
        Angka vault dari chain pada blok {live.blockNumber.toString()} ({blockTime(live.blockTimestamp)}). Nilai posisi
        bukan janji likuiditas: {assetSymbol} yang bisa ditarik sekarang dibatasi `maxWithdraw`/`maxRedeem`, dan angka itu
        bergerak bersama kas venue.
      </p>

      {live.isPaused ? (
        <p role="alert">
          Vault dijeda. `withdraw` dan `redeem` revert selama pause (`assert not self.paused` di `VaultV3.vy`), jadi tidak
          ada tombol kirim. Ini bukan sekadar UI: chain akan menolak.
        </p>
      ) : null}

      <div className="row">
        <label htmlFor="withdraw-mode">Jenis</label>
        <select
          id="withdraw-mode"
          value={mode}
          onChange={(event) => {
            setMode(event.target.value === "shares" ? "shares" : "assets");
            setQuote(null);
          }}
        >
          <option value="assets">Tarik aset ({assetSymbol})</option>
          <option value="shares">Bakar share (redeem)</option>
        </select>
        <button type="button" onClick={connect} disabled={account !== null}>
          {account === null ? "Hubungkan wallet" : `Terhubung: ${account.slice(0, 6)}…${account.slice(-4)}`}
        </button>
      </div>

      <div className="row">
        <label htmlFor="withdraw-amount">Jumlah ({mode === "assets" ? assetSymbol : "share"})</label>
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
        />
        <button type="button" onClick={setMax} disabled={quote === null}>
          Maks
        </button>
      </div>

      <fieldset className="row">
        <legend>Toleransi loss (dikirim sebagai `max_loss`, wajib eksplisit)</legend>
        {PRESETS.map((preset) => (
          <label key={preset}>
            <input
              type="radio"
              name="loss"
              checked={customLoss.trim() === "" && lossBps === preset}
              onChange={() => {
                setLossBps(preset);
                setCustomLoss("");
                setQuote(null);
              }}
            />
            {preset} bps
          </label>
        ))}
        <label htmlFor="loss-custom">lain (0–9999)</label>
        <input
          id="loss-custom"
          inputMode="numeric"
          value={customLoss}
          onChange={(event) => {
            setCustomLoss(event.target.value);
            setQuote(null);
          }}
          placeholder="9999"
        />
      </fieldset>
      {lossTooHigh ? (
        <p role="alert">10000 bps berarti menerima kehilangan seluruh nilai. SDK menolaknya; angka itu tidak dikirim.</p>
      ) : null}
      <p className="provenance">
        `withdraw` di chain punya default 0 dan `redeem` default 10000. Form ini selalu mengirim nilai pilihan Anda, jadi
        tidak ada default yang tidak terlihat.
      </p>

      <button type="button" onClick={reprice} disabled={phase === "quoting" || phase === "signing"}>
        {phase === "quoting" ? "Membaca chain…" : "Hitung penarikan"}
      </button>

      {chainId !== null && chainId !== AVENOR_CHAIN_ID ? (
        <p role="alert">Wallet di chain {chainId}. Form hanya mengirim ke chain {AVENOR_CHAIN_ID}.</p>
      ) : null}

      {quote !== null ? (
        <>
          <dl className="facts">
            <dt>Aset yang akan diterima (perkiraan)</dt>
            <dd>
              <Amount value={quote.assets} kind="usdg" />
            </dd>
            <dt>Share yang dibakar (perkiraan)</dt>
            <dd>
              <Amount value={quote.shares} kind="shares" />
            </dd>
            <dt>Batas atas aset</dt>
            <dd>
              <Amount value={quote.maxAssets} kind="usdg" />
            </dd>
            <dt>Batas atas share</dt>
            <dd>
              <Amount value={quote.maxShares} kind="shares" />
            </dd>
            <dt>Saldo share</dt>
            <dd>
              <Amount value={quote.shareBalance} kind="shares" />
            </dd>
          </dl>
          {withdrawWarnings(quote, { isPaused: live.isPaused, isShutdown: live.isShutdown }).map((warning) => (
            <p key={warning.case} role={warning.case === "W6" ? "alert" : undefined}>
              <strong>{warning.case}</strong>: {warning.message}
              {warning.case === "idle" ? ` Kas idle menutup ${percentBps(idleCoverageBps(quote))} permintaan.` : ""}
            </p>
          ))}
        </>
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
        disabled={quote === null || blocked.length > 0 || live.isPaused || lossTooHigh || phase === "signing"}
      >
        {phase === "signing" ? "Menunggu tanda tangan…" : mode === "assets" ? "Withdraw" : "Redeem"}
      </button>
      <p className="provenance">
        Share di atas adalah perkiraan pada blok {quote === null ? "—" : quote.blockNumber.toString()}. Angka final hanya
        dari event Withdraw di receipt.
      </p>

      {problem !== null ? (
        <div role="alert">
          <strong>{problem.code}</strong>: {problem.message}
          {problem.detail === null ? null : <span className="provenance"> ({problem.detail})</span>}
        </div>
      ) : null}

      {receipt !== null ? (
        <div role="status">
          <p>
            Penarikan masuk di blok {receipt.blockNumber.toString()}, dengan `max_loss` {receipt.maxLossBps} bps. Dari
            event: <Amount value={receipt.assets} kind="usdg" /> untuk <Amount value={receipt.shares} kind="shares" />.
          </p>
          <p className="provenance">
            tx {receipt.withdrawTx as Hex} · penerima <AddressText address={receipt.receiver} />
            {live.isShutdown ? " · vault shutdown: penarikan tetap jalan, deposit tidak" : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}