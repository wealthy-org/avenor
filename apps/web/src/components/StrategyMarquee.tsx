// Provenance ticker. Every entry is either an address the vault named in this render (passed in by the
// page) or a value from the same read; nothing here is a strategy that does not exist.
//
// The previous version imported a fixed table of chain-4663 capture addresses, so a deployment reading
// another chain ticked past five contracts it had never touched.

import { money, percentBps, shortAddress } from "@/lib/format";

/** The fields this ticker prints, taken from the snapshot the page already read. */
export interface MarqueeLive {
  blockNumber: string;
  totalAssets: string;
  totalIdle: string;
  depositLimit: string;
  performanceFeeBps: number | null;
  managementFeeBps: number | null;
}

/** One address the vault itself named this render. */
export interface MarqueeIdentity {
  label: string;
  address: string;
}

export function StrategyMarquee({
  live,
  chainLine,
  identities = [],
}: {
  live: MarqueeLive;
  chainLine: string;
  identities?: MarqueeIdentity[];
}) {
  const items = [
    chainLine,
    ...identities.slice(0, 4).map((identity) => `${identity.label} ${shortAddress(identity.address)}`),
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
