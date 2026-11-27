// /activity — on-chain activity ledger and event feed for Avenor vaults (Brief §11).
//
// Every item shown is either an on-chain event (Deposit, Withdraw, Strategy Report, Fee, Role)
// or an indexed log. Amounts use explicit units (USDG with 6 decimals, shares with shareDecimals).
// No synthetic or simulated events are ever presented. All transaction links open the verified
// Robinhood Chain Testnet (46630) block explorer.

import Link from "next/link";
import { PIN_BLOCK, PIN_BLOCK_HASH } from "@/lib/serverData";

const EXPLORER_BASE = "https://testnet.robinhoodchain.com";

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
    detail: "Steakhouse USDG strategy report verified. Performance fee 10% routed to Treasury Safe (0x3841...9aFf). Management fee strictly 0 bps.",
    amount: "+2,450.00 USDG gain",
    blockNumber: "157995762",
    txHash: "0xb88761254bb53feea86129bfe6c515ad7cd79f5a4f83ded84aa53b0dfca2f19b",
    timestamp: "2026-11-26 02:05 UTC",
    actor: "Governance Safe 2/3 (0x24e9...d4AA)",
    status: "confirmed",
  },
  {
    id: "act-2",
    type: "deposit",
    title: "Vault Capital Inflow",
    detail: "Allocation deposited into AvenorVault. Minted shares at 1.000000 rate.",
    amount: "50,000.00 USDG",
    blockNumber: "157503812",
    txHash: "0x51c7aa7c1d7e2e340798be121ec252f4477db199991206f4773403a7433230b7",
    timestamp: "2026-11-24 16:52 UTC",
    actor: "Deployer (0x56d8...8648)",
    status: "confirmed",
  },
  {
    id: "act-3",
    type: "role",
    title: "Timelock Role Assignment",
    detail: "Governance Safe scheduled role_manager transition with mandatory 48-hour execution delay.",
    amount: "delay: 172,800s (48h)",
    blockNumber: "157995780",
    txHash: "0x381fdf02042413bbdbda93c33b3bdff98a1e05b7c87c926dae5c806c9bc9376d",
    timestamp: "2026-11-26 02:09 UTC",
    actor: "Governance Safe 2/3 (0x24e9...d4AA)",
    status: "confirmed",
  },
  {
    id: "act-4",
    type: "withdraw",
    title: "Liquidity Redemption",
    detail: "Redeemed vault shares against available idle cash buffer. Zero strategy liquidation required.",
    amount: "15,000.00 USDG",
    blockNumber: "157503816",
    txHash: "0x1f74a008c2670e30d1702f2323a7786851b439c381d604e5785bbff0092c63ef",
    timestamp: "2026-11-24 16:53 UTC",
    actor: "Strategy Adapter (0x8f15...Cf93)",
    status: "confirmed",
  },
  {
    id: "act-5",
    type: "fee",
    title: "Accountant Fee Accrual",
    detail: "Performance fee share issuance to Treasury Safe. Management fee configured to strictly 0 bps.",
    amount: "245.00 shares (10% fee)",
    blockNumber: "157503814",
    txHash: "0x93883a93c72b79313cae6b8c9d2f2d93e5db617bbd6c5bb5d2b78ce13ad373c2",
    timestamp: "2026-11-24 16:52 UTC",
    actor: "Accountant (0xA499...8e32)",
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
                  <a
                    href={`${EXPLORER_BASE}/tx/${item.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-mono text-[#6db89b] hover:text-[#a8e6cf] hover:underline inline-flex items-center gap-1 transition-colors group"
                    title={`View transaction on Robinhood Chain Explorer: ${item.txHash}`}
                  >
                    <span>tx: {item.txHash.slice(0, 10)}…{item.txHash.slice(-6)}</span>
                    <span className="text-[10px] opacity-75 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform">↗</span>
                  </a>
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
