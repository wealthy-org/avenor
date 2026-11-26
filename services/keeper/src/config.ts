// Env parsing, separated from the loop so a missing variable fails at startup with a sentence a
// human can act on, instead of as a revert at 03:00.

export interface KeeperConfig {
  rpcUrl: string;
  fallbackRpcUrls?: string[];
  vault: `0x${string}`;
  strategy: `0x${string}`;
  privateKey: `0x${string}`;
  minGainBps: number;
  maxGainBps?: number;
  hardIdleFloor: bigint;
  intervalMs: number;
  alertWebhookUrl?: string;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const KEY = /^0x[0-9a-fA-F]{64}$/;

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === "") throw new Error(`${name} is required`);
  return value.trim();
}

function address(env: Record<string, string | undefined>, name: string): `0x${string}` {
  const value = required(env, name);
  if (!ADDRESS.test(value)) throw new Error(`${name} must be a 20-byte hex address`);
  return value as `0x${string}`;
}

function integer(env: Record<string, string | undefined>, name: string, min: number, max: number): number {
  const value = required(env, name);
  if (!/^-?\d+$/.test(value)) throw new Error(`${name} must be an integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer in ${min}..${max}`);
  }
  return parsed;
}

export function parseKeeperConfig(env: Record<string, string | undefined>): KeeperConfig {
  const privateKey = required(env, "KEEPER_PRIVATE_KEY");
  if (!KEY.test(privateKey)) throw new Error("KEEPER_PRIVATE_KEY must be a 32-byte hex string");

  const maxGainRaw = env.MAX_GAIN_BPS;
  const alertWebhookUrl = env.ALERT_WEBHOOK_URL;
  const fallbackRaw = env.FALLBACK_RPC_URLS;
  const fallbackRpcUrls = fallbackRaw
    ? fallbackRaw.split(",").map((u) => u.trim()).filter(Boolean)
    : undefined;

  return {
    rpcUrl: required(env, "RPC_URL"),
    fallbackRpcUrls: fallbackRpcUrls && fallbackRpcUrls.length > 0 ? fallbackRpcUrls : undefined,
    vault: address(env, "VAULT_ADDRESS"),
    strategy: address(env, "STRATEGY_ADDRESS"),
    privateKey: privateKey as `0x${string}`,
    minGainBps: integer(env, "MIN_GAIN_BPS", 0, 10_000),
    maxGainBps: maxGainRaw === undefined || maxGainRaw === "" ? undefined : integer(env, "MAX_GAIN_BPS", 0, 10_000),
    hardIdleFloor: BigInt(integer(env, "HARD_IDLE_FLOOR", 0, Number.MAX_SAFE_INTEGER)),
    intervalMs: integer(env, "INTERVAL_MS", 5_000, 86_400_000),
    alertWebhookUrl: alertWebhookUrl === undefined || alertWebhookUrl === "" ? undefined : alertWebhookUrl,
  };
}