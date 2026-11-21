// Live monitor snapshot. The venue's own `maxWithdraw` is read for transparency but is not a
// liquidity signal — see `docs/ACCOUNTING.md` §6 and the warning in `MorphoVaultStrategy`.

import { parseAbi, type Address } from "viem";
import { vaultV3Abi } from "@avenor/sdk";
import type { ReadClient } from "./reader.ts";
import type { MonitorSnapshot } from "./monitor.ts";

const VENUE_ABI = parseAbi([
  "function maxWithdraw(address owner) view returns (uint256)",
]);
const ACCOUNTANT_ABI = parseAbi(["function performanceFee() view returns (uint16)"]);

export interface MonitorReader {
  snapshot(): Promise<MonitorSnapshot>;
}

export function createMonitorReader(
  client: ReadClient & { getBlock(args: { blockNumber: bigint }): Promise<{ timestamp: bigint }> },
  cfg: { vault: Address; strategy: Address; owner: Address },
): MonitorReader {
  return {
    async snapshot(): Promise<MonitorSnapshot> {
      const blockNumber = await client.getBlockNumber();
      const readVault = (functionName: string) =>
        client.readContract({ address: cfg.vault, abi: vaultV3Abi, functionName, blockNumber });

      const [isShutdown, isPaused, depositLimit, totalAssets, totalIdle, maxWithdraw, accountant] = await Promise.all([
        readVault("isShutdown"),
        readVault("isPaused"),
        readVault("deposit_limit"),
        readVault("totalAssets"),
        readVault("totalIdle"),
        client.readContract({
          address: cfg.vault,
          abi: vaultV3Abi,
          functionName: "maxWithdraw",
          args: [cfg.owner],
          blockNumber,
        }),
        readVault("accountant"),
      ]);

      const accountantAddress = accountant as Address;
      const [venueMaxWithdraw, performanceFee, block] = await Promise.all([
        client.readContract({
          address: (await client.readContract({
            address: cfg.strategy,
            abi: parseAbi(["function venue() view returns (address)"]),
            functionName: "venue",
            blockNumber,
          })) as Address,
          abi: VENUE_ABI,
          functionName: "maxWithdraw",
          args: [cfg.strategy],
          blockNumber,
        }),
        accountantAddress === "0x0000000000000000000000000000000000000000"
          ? Promise.resolve(undefined)
          : client.readContract({
              address: accountantAddress,
              abi: ACCOUNTANT_ABI,
              functionName: "performanceFee",
              blockNumber,
            }),
        client.getBlock({ blockNumber }),
      ]);

      return {
        blockNumber,
        blockTimestamp: new Date(Number((block as { timestamp: bigint }).timestamp) * 1000),
        isShutdown: isShutdown as boolean,
        isPaused: isPaused as boolean,
        depositLimit: depositLimit as bigint,
        totalAssets: totalAssets as bigint,
        totalIdle: totalIdle as bigint,
        maxWithdraw: maxWithdraw as bigint,
        venueMaxWithdraw: venueMaxWithdraw as bigint,
        performanceFeeBps: performanceFee === undefined ? undefined : Number(performanceFee as bigint),
      };
    },
  };
}