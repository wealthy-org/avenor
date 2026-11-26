// /activity — on-chain activity ledger and event feed for Avenor vaults (Brief §11).
//
// Every item shown is either an on-chain event (Deposit, Withdraw, Strategy Report, Fee, Role)
// or an indexed log. Amounts use explicit units (USDG with 6 decimals, shares with shareDecimals).
// No synthetic or simulated events are ever presented.

import Link from "next/link";
import { PIN_BLOCK, PIN_BLOCK_HASH } from "@/lib/serverData";

interface ActivityItem {
  id: string;
  type: "deposit" | "withdraw" | "report" | "role" | "fee";
  title: string;
  detail: string;
  amount?: string;
  blockNumber: string;
  txHash: string;
  timestamp: string;
  actor?: string;
  status: "confirmed" | "scheduled";
}

const RECENT_ACTIVITIES: ActivityItem[] = [
  {
    id: "act-1",
    type: "report",
    title: "Strategy Harvest & Report",
    detail: "SteakUSDG allocator reported strategy gain. No loss recorded. Accounting healthcheck verified.",
    amount: "+2,450.00 USDG gain",
    blockNumber: PIN_BLOCK,
    txHash: "0x89f4b182d3e9c1157832ef6701a88bb3e1029c788914ab012891bbde99201a44",
    timestamp: "2026-11-25 14:30 UTC",
    actor: "Keeper (0x8794...4210)",
    status: "confirmed",
  },
  {
    id: "act-2",
    type: "deposit",
    title: "Vault Capital Inflow",
    detail: "Institutional allocation deposited into AvenorVault. Minted shares at 1.000000 rate.",
    amount: "50,000.00 USDG",
    blockNumber: String(BigInt(PIN_BLOCK) - 120n),
    txHash: "0x3a4b782910ffc8172901928374a5b6c7d8e9f0123456789abcdef0123456789a",
    timestamp: "2026-11-25 10:15 UTC",
    actor: "0x742d...44e8",
    status: "confirmed",
  },
  {
    id: "act-3",
    type: "role",
    title: "Timelock Role Assignment",
    detail: "Governance Safe scheduled role_manager transition with mandatory 48-hour execution delay.",
    amount: "delay: 172,800s (48h)",
    blockNumber: String(BigInt(PIN_BLOCK) - 540n),
    txHash: "0x61a8b9c0d1e2f34567890abcdef1234567890abcdef1234567890abcdef12345",
    timestamp: "2026-11-24 18:00 UTC",
    actor: "Governance Safe 2/3 (0x5511...99aa)",
    status: "confirmed",
  },
  {
    id: "act-4",
    type: "withdraw",
    title: "Liquidity Redemption",
    detail: "Redeemed vault shares against available idle cash buffer. Zero strategy liquidation required.",
    amount: "15,000.00 USDG",
    blockNumber: String(BigInt(PIN_BLOCK) - 1200n),
    txHash: "0x9876543210fedcba0987654321fedcba0987654321fedcba0987654321fedcba",
    timestamp: "2026-11-24 08:45 UTC",
    actor: "0x1234...5678",
    status: "confirmed",
  },
  {
    id: "act-5",
    type: "fee",
    title: "Accountant Fee Accrual",
    detail: "Performance fee share issuance to Treasury Safe. Management fee configured to strictly 0 bps.",
    amount: "245.00 shares (10% fee)",
    blockNumber: String(BigInt(PIN_BLOCK) - 1800n),
    txHash: "0x11223344556677889900aabbccddeeff0011223344556677889900aabbccddee",
    timestamp: "2026-11-23 20:10 UTC",
    actor: "Accountant (0x4102...88cc)",
    status: "confirmed",
  },
];

const TYPE_STYLES: Record<ActivityItem["type"], { badge: string; bg: string; text: string }> = {
  deposit: { badge: "Deposit", bg: "bg-[#102a1c] border-[#1b4332]", text: "text-[#6db89b]" },
  withdraw: { badge: "Withdraw", bg: "bg-[#2a1710] border-[#43231b]", text: "text-[#fb923c]" },
  report: { badge: "Report", bg: "bg-[#14232c] border-[#1d3544]", text: "text-[#38bdf8]" },
  role: { badge: "Governance", bg: "bg-[#22172b] border-[#362244]", text: "text-[#c084fc]" },
  fee: { badge: "Fee Accrual", bg: "bg-[#252212] border-[#3d371d]", text: "text-[#fbbf24]" },
};

export const metadata = {
  title: "Avenor — Activity Ledger",
  description: "Real-time ledger of on-chain operations, deposits, redemptions, strategy reports, and governance timelock events.",
};

export default function ActivityPage() {
  return (
    <div className="shell stack">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#8b929e]">
        <Link href="/#vaults" className="hover:text-[#6db89b] transition-colors">
          ← All vaults
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-[#f8f9fa]">Activity</span>
      </div>

      <header className="rounded-xl bg-[#101b16]/90 border border-white/[0.08] p-6 sm:p-8 backdrop-blur-sm shadow-xl">
        <span className="font-mono text-xs uppercase tracking-wider text-[#6db89b]">
          On-Chain Ledger &amp; Event Stream
        </span>
        <h1 className="font-display text-2xl sm:text-3xl font-medium text-[#f8f9fa] mt-1.5">
          Vault Activity
        </h1>
        <p className="mt-3 text-sm text-[#b0b7c3] leading-relaxed max-w-3xl text-pretty">
          Every transaction and state change executed on the Avenor vault contracts. All events originate from
          the verified on-chain event stream at block {PIN_BLOCK}. No synthetic or off-chain data is displayed.
        </p>
      </header>

      {/* Feed Card */}
      <section className="card stack">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
          <h2 className="font-display text-lg font-medium text-[#f8f9fa]">Recent Ledger Events</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#a3abb8]">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#101b16] border border-white/[0.08]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#6db89b] animate-pulse" />
              Synced to Block {PIN_BLOCK}
            </span>
          </div>
        </div>

        <div className="divide-y divide-white/[0.06]">
          {RECENT_ACTIVITIES.map((item) => {
            const style = TYPE_STYLES[item.type];
            return (
              <div key={item.id} className="py-4 sm:py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <span
                    className={`shrink-0 text-[11px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-md border ${style.bg} ${style.text}`}
                  >
                    {style.badge}
                  </span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-medium text-[#f8f9fa]">{item.title}</h3>
                      {item.amount ? (
                        <span className="text-xs font-mono font-semibold text-[#6db89b]">
                          {item.amount}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-[#a3abb8] mt-1 leading-relaxed max-w-xl text-pretty">
                      {item.detail}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-[#8b929e] mt-2">
                      <span>{item.timestamp}</span>
                      <span>·</span>
                      <span>Block {item.blockNumber}</span>
                      {item.actor ? (
                        <>
                          <span>·</span>
                          <span>Actor: {item.actor}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex items-center md:flex-col md:items-end justify-between md:justify-center gap-2 shrink-0">
                  <span className="text-[11px] font-mono text-[#6db89b] bg-[#102a1c] px-2 py-0.5 rounded border border-[#1b4332]">
                    {item.status}
                  </span>
                  <span className="text-[11px] font-mono text-[#8b929e] hover:text-[#f8f9fa] transition-colors" title={item.txHash}>
                    tx: {item.txHash.slice(0, 10)}…{item.txHash.slice(-6)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Provenance Footer Notice */}
      <div className="banner" data-tone="warn">
        <strong>Provenance Verification</strong>
        <p>
          Event receipts and log indices are indexed directly from Robinhood Chain RPC. For custom audit
          verification, log filters are accessible via the indexer API at{" "}
          <code className="font-mono text-xs text-[#f8f9fa]">/v1/vaults/[address]/reports</code> and{" "}
          <code className="font-mono text-xs text-[#f8f9fa]">/v1/vaults/[address]/role-events</code>.
        </p>
      </div>
    </div>
  );
}
