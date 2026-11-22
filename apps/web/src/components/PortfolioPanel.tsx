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
      <div className="row">
        <button type="button" onClick={connect} disabled={busy}>
          {account === null ? "Hubungkan wallet" : `Muat ulang posisi ${account.slice(0, 6)}…${account.slice(-4)}`}
        </button>
        <button type="button" onClick={download} disabled={rows.length === 0}>
          Unduh CSV
        </button>
        <span className="provenance">
          Saldo share dibaca dari indexer; nilai dan batas tarik dibaca dari chain pada satu blok. CSV memuat satuan
          dasar (bukan angka yang sudah dibulatkan) dan nomor blok, termasuk baris yang gagal beserta errornya.
        </span>
      </div>

      {problem !== null ? (
        <div role="alert">
          <strong>{problem.code}</strong>: {problem.message}
          {problem.detail === null ? null : <span className="provenance"> ({problem.detail})</span>}
        </div>
      ) : null}

      {rows.length === 0 && account !== null ? <p>Tidak ada vault di konfigurasi aplikasi.</p> : null}

      {rows.map((row) => (
        <section key={row.vault.address} className="card stack">
          <h2>{row.vault.label}</h2>
          <p className="provenance">
            <AddressText address={row.vault.address as `0x${string}`} />
          </p>
          {row.positionError !== null ? (
            <p role="alert">
              <strong>{row.positionError.code}</strong>: {row.positionError.message}
            </p>
          ) : row.position === null ? null : (
            <dl className="facts">
              <dt>Share (indekser)</dt>
              <dd>
                <Amount value={row.position.shares} kind="shares" />
              </dd>
              <dt>Aktivitas terakhir</dt>
              <dd>blok {row.position.lastActivityBlock.toString()}</dd>
              {row.quoteError !== null ? (
                <>
                  <dt>Nilai posisi</dt>
                  <dd>
                    <span className="provenance">
                      tidak terbaca ({row.quoteError.code}): {row.quoteError.message}
                    </span>
                  </dd>
                  <dt>Dapat ditarik sekarang</dt>
                  <dd>
                    <span className="provenance">tidak diisi dengan angka karangan</span>
                  </dd>
                </>
              ) : row.quote === null ? (
                <>
                  <dt>Nilai posisi</dt>
                  <dd>share nol, tidak ada posisi untuk dihitung</dd>
                </>
              ) : (
                <>
                  <dt>Nilai posisi</dt>
                  <dd>
                    <Amount value={row.quote.positionAssets} kind="usdg" />
                  </dd>
                  <dt>Dapat ditarik sekarang</dt>
                  <dd>
                    <Amount value={row.quote.maxAssets} kind="usdg" /> (
                    {percentBps(row.quote.positionAssets === 0n ? 0 : Number((row.quote.maxAssets * 10_000n) / row.quote.positionAssets))}{" "}
                    dari nilai posisi)
                  </dd>
                  <dt>Kas idle vault</dt>
                  <dd>
                    <Amount value={row.quote.totalIdle} kind="usdg" />
                  </dd>
                  <dt>Dibaca pada blok</dt>
                  <dd>{row.quote.blockNumber.toString()}</dd>
                </>
              )}
            </dl>
          )}
          {row.quote !== null && row.quote.positionAssets > row.quote.maxAssets ? (
            <p role="alert">
              Sebagian nilai posisi tidak bisa ditarik sekarang: batas mengikuti likuiditas venue, bukan kemauan UI.
              Keluar penuh butuh `max_loss` eksplisit dan bisa parsial.
            </p>
          ) : null}
          {row.position === null || row.positionError !== null ? null : (
            <p className="provenance">
              Dibaca {blockTime(new Date().toISOString())} untuk ditampilkan; bukti angka ada di blok yang disebut di
              atas, bukan di jam ini.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}