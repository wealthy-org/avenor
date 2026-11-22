// Wallet boundary for the deposit form.
//
// The app never assumes an injected wallet exists and never assumes it is on the right chain: both
// are checked, and a missing wallet is a normal state with its own message, not an exception the
// user has to read from the console.

import type { Address } from "viem";

export const AVENOR_CHAIN_ID = 4663;

/** The subset of EIP-1193 this app uses. `on`/`removeListener` stay optional: not every wallet has them. */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

export type WalletErrorCode = "no_provider" | "no_account" | "wrong_network" | "rejected" | "pending_request";

export class WalletError extends Error {
  code: WalletErrorCode;
  detail: string | null;

  constructor(code: WalletErrorCode, message: string, detail: string | null = null) {
    super(message);
    this.name = "WalletError";
    this.code = code;
    this.detail = detail;
  }
}

export interface ConnectedWallet {
  provider: Eip1193Provider;
  account: Address;
  chainId: number;
}

function toChainId(value: unknown): number {
  if (typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value)) return Number(BigInt(value));
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  throw new WalletError("wrong_network", "Wallet mengembalikan chain id yang tidak dapat dibaca", String(value));
}

function isRejection(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  if (code === 4001) return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && /user rejected|user denied|denied transaction/i.test(message);
}

/** Turn a wallet transport error into one of our codes so the form can show a specific message. */
export function mapWalletError(error: unknown): WalletError | null {
  if (error instanceof WalletError) return error;
  if (isRejection(error)) return new WalletError("rejected", "Permintaan ditolak di wallet. Tidak ada transaksi yang dikirim.");
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (code === -32002) {
      return new WalletError("pending_request", "Wallet masih punya permintaan terbuka. Selesaikan dulu di wallet.");
    }
  }
  return null;
}

export function findInjectedProvider(bag: unknown): Eip1193Provider | null {
  if (typeof bag !== "object" || bag === null) return null;
  const candidate = (bag as { ethereum?: unknown }).ethereum;
  if (typeof candidate !== "object" || candidate === null) return null;
  const request = (candidate as { request?: unknown }).request;
  return typeof request === "function" ? (candidate as Eip1193Provider) : null;
}

/**
 * Ask the wallet for an account and its chain. No account is a distinct outcome from no wallet:
 * the first is the user locking the wallet, the second is a browser without one.
 */
export async function connectWallet(provider: Eip1193Provider | null): Promise<ConnectedWallet> {
  if (provider === null) {
    throw new WalletError("no_provider", "Tidak ada wallet di browser ini. Pasang wallet yang mendukung Robinhood Chain (4663).");
  }
  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    if (!Array.isArray(accounts) || accounts.length === 0 || typeof accounts[0] !== "string") {
      throw new WalletError("no_account", "Wallet tidak memberikan akun. Buka wallet dan izinkan koneksi.");
    }
    const chainId = toChainId(await provider.request({ method: "eth_chainId" }));
    return { provider, account: accounts[0] as Address, chainId };
  } catch (error) {
    const mapped = mapWalletError(error);
    throw mapped ?? new WalletError("no_account", "Wallet gagal dihubungi", error instanceof Error ? error.message : String(error));
  }
}

/** Chain id is re-read, never cached: a user can change networks between two clicks. */
export async function readChainId(provider: Eip1193Provider): Promise<number> {
  try {
    return toChainId(await provider.request({ method: "eth_chainId" }));
  } catch (error) {
    const mapped = mapWalletError(error);
    throw mapped ?? new WalletError("no_provider", "Chain id wallet tidak terbaca", error instanceof Error ? error.message : String(error));
  }
}

export interface SwitchResult {
  switched: boolean;
  /** Why it did not switch. Present when `switched` is false; the form shows it verbatim. */
  reason: string | null;
}

/**
 * Try `wallet_switchEthereumChain`. We do not call `wallet_addEthereumChain` with numbers we did
 * not verify, and we do not pretend a failed switch succeeded.
 */
export async function switchToAvenorChain(provider: Eip1193Provider): Promise<SwitchResult> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${AVENOR_CHAIN_ID.toString(16)}` }],
    });
    const chainId = await readChainId(provider);
    if (chainId !== AVENOR_CHAIN_ID) {
      return { switched: false, reason: `Wallet tetap di chain ${chainId}, bukan ${AVENOR_CHAIN_ID}.` };
    }
    return { switched: true, reason: null };
  } catch (error) {
    const mapped = mapWalletError(error);
    if (mapped !== null) throw mapped;
    const message = error instanceof Error ? error.message : String(error);
    return { switched: false, reason: `Wallet menolak atau tidak bisa pindah chain: ${message}` };
  }
}