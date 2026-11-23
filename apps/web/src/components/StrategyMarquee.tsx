// Provenance ticker. Every entry is either an address recorded in `src/config/staging.ts` or a value
// passed in from the server read of this request; nothing here is a strategy that does not exist.
// The previous version advertised six products, one of which was deployed.

import { money, percentBps, shortAddress } from "@/lib/format";
import {
  STAGING_ACCOUNTANT,
  STAGING_ASSET,
  STAGING_IMPLEMENTATION,
  STAGING_STRATEGY,
  STAGING_TIMELOCK,
  STAGING_VAULT,
} from "@/config/staging";

/** The fields this ticker prints, taken from the snapshot the page already read. */
export interface MarqueeLive {
  blockNumber: string;
  totalAssets: string;
  totalIdle: string;
  depositLimit: string;
  performanceFeeBps: number | null;
  managementFeeBps: number | null;
}

export function StrategyMarquee({ live }: { live: MarqueeLive }) {
  const items = [
    `Vault ${shortAddress(STAGING_VAULT)} · avUSDG`,
    `Implementation ${shortAddress(STAGING_IMPLEMENTATION)} · VaultV3`,
    `Asset USDG ${shortAddress(STAGING_ASSET)} · 6 decimals`,
    `Strategy ${shortAddress(STAGING_STRATEGY)} · one allocation`,
    `role_manager ${shortAddress(STAGING_TIMELOCK)} · 48h timelock`,
    `accountant ${shortAddress(STAGING_ACCOUNTANT)}`,
    `Total assets ${money(BigInt(live.totalAssets))} USDG`,
    `Idle cash ${money(BigInt(live.totalIdle))} USDG`,
    `Deposit limit ${money(BigInt(live.depositLimit))} USDG`,
    live.performanceFeeBps === null
      ? "Performance fee not readable"
      : `Performance fee ${percentBps(live.performanceFeeBps)} · management ${
          live.managementFeeBps === null ? "not readable" : percentBps(live.managementFeeBps)
        }`,
    `Block ${live.blockNumber}`,
    `Withdrawals require an explicit max_loss · no default`,
  ];

  return (
    <section
      // The ticker is wider than the viewport by design; the mask makes the cut look deliberate
      // instead of like clipped text at both edges.
      className="bg-[#0b1310]/85 border-y border-white/[0.06] py-3.5 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_4%,#000_96%,transparent)]"
      aria-label="Vault facts at the block shown on this page"
    >
      <div className="animate-marquee flex items-center gap-10 whitespace-nowrap">
        {[...items, ...items, ...items].map((item, index) => (
          <span
            key={`${item}-${index}`}
            className="inline-flex items-center gap-2.5 font-mono text-xs tracking-tight text-[#a3abb8]"
          >
            <span className="h-1 w-1 rounded-full bg-[#6db89b]/50" aria-hidden="true" />
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}