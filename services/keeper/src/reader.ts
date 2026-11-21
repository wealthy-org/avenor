// Production reader: one block tag for every read in a snapshot, because a keeper that mixed blocks
// would compute `available` from one state and `currentDebt` from another.

import { parseAbi } from "viem";
import { vaultV3Abi } from "@avenor/sdk";
import type { StrategySnapshot, VaultReader, VaultSnapshot } from "./jobs.ts";

const STRATEGY_ABI = parseAbi([
  "function totalAssetsIncludingIdle() view returns (uint256)",
]);

export interface ReadClient {
  getBlockNumber(): Promise<bigint>;
  readContract(args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
    blockNumber?: bigint;
  }): Promise<unknown>;
}

export function createVaultReader(client: ReadClient, cfg: { vault: `0x${string}`; strategy: `0x${string}` }): VaultReader {
  return {
    async vault(): Promise<VaultSnapshot> {
      const blockNumber = await client.getBlockNumber();
      const read = (functionName: string) =>
        client.readContract({ address: cfg.vault, abi: vaultV3Abi, functionName, blockNumber }) as Promise<bigint | boolean>;

      const [totalAssets, totalIdle, totalDebt, isShutdown, minimumTotalIdle, depositLimit] = await Promise.all([
        read("totalAssets"),
        read("totalIdle"),
        read("totalDebt"),
        read("isShutdown"),
        read("minimum_total_idle"),
        read("deposit_limit"),
      ]);

      return {
        blockNumber,
        totalAssets: totalAssets as bigint,
        totalIdle: totalIdle as bigint,
        totalDebt: totalDebt as bigint,
        isShutdown: isShutdown as boolean,
        minimumTotalIdle: minimumTotalIdle as bigint,
        depositLimit: depositLimit as bigint,
      };
    },

    async strategy(address: `0x${string}`, blockNumber?: bigint): Promise<StrategySnapshot> {
      const tag = blockNumber ?? (await client.getBlockNumber());
      // The ABI's tuple components are named, so viem decodes to an object; an unnamed ABI would
      // decode to an array. Accept both rather than depend on which shape the artifact has today.
      const result = (await client.readContract({
        address: cfg.vault,
        abi: vaultV3Abi,
        functionName: "strategies",
        args: [address],
        blockNumber: tag,
      })) as { current_debt?: bigint; max_debt?: bigint } | readonly bigint[];
      const currentDebt = Array.isArray(result) ? result[2]! : result.current_debt!;
      const maxDebt = Array.isArray(result) ? result[3]! : result.max_debt!;
      return { currentDebt, maxDebt };
    },

    async strategyAssets(address: `0x${string}`, blockNumber?: bigint): Promise<bigint> {
      const tag = blockNumber ?? (await client.getBlockNumber());
      return (await client.readContract({
        address,
        abi: STRATEGY_ABI,
        functionName: "totalAssetsIncludingIdle",
        blockNumber: tag,
      })) as bigint;
    },
  };
}