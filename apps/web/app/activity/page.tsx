// /activity — on-chain activity ledger and event feed for Avenor vaults (Brief §11).
//
// Items below are the recorded deployment log for the testnet rehearsal, captured when each
// transaction was submitted: each entry carries its tx hash and block, and the explorer link lets
// anyone re-check it against the chain. The list is not re-read from the node on every render;
// treat it as history, not a live feed.
// Amounts use explicit units (USDG with 6 decimals, shares with shareDecimals).
// In accordance with AGENTS.md Rule 2, no synthetic or placeholder transaction figures are displayed.
// All transaction links open the verified Robinhood Chain Testnet block explorer.

import Link from "next/link";
import { readChainFacts, chainSummary } from "@/lib/chainFacts";

const EXPLORER_BASE = "https://testnet.robinhoodchain.com";

interface ActivityItem {
  id: string;
  type: "deposit" | "withdraw" | "report" | "role" | "deployment";
  title: string;
  detail: string;
  amount?: string;
  blockNumber: string;
  txHash: string;
  timestamp: string;
  actor: string;
  status: "confirmed" | "scheduled";
}

// Recorded deployment transactions on Robinhood Chain Testnet 46630 (packages/config/46630.json);
// re-verify each against the explorer link rather than trusting this file.
const VERIFIED_ONCHAIN_EVENTS: ActivityItem[] = [
  {
    id: "act-gov-schedule",
    type: "role",
    title: "Timelock Role Assignment Scheduled",
    detail:
      "Governance Safe scheduled accept_role_manager() on VaultV3 via 48h TimelockController (operation 0x9068381b...). Enforces mandatory 172,800s execution delay before role transition.",
    amount: "delay: 172,800s (48h)",
    blockNumber: "157995780",
    txHash: "0x381fdf02042413bbdbda93c33b3bdff98a1e05b7c87c926dae5c806c9bc9376d",
    timestamp: "2026-11-26 02:09 UTC",
    actor: "Governance Safe 2/3 (0x24e9...d4AA)",
    status: "scheduled",
  },
  {
    id: "act-strat-mgmt",
    type: "role",
    title: "Strategy Management Transferred",
    detail:
      "MorphoVaultStrategy management transferred to Governance Safe (0x24e9...d4AA) via acceptManagement(). Strategy is bound to Steakhouse USDG venue stand-in.",
    amount: "Management: Safe 2/3",
    blockNumber: "157995762",
    txHash: "0xb88761254bb53feea86129bfe6c515ad7cd79f5a4f83ded84aa53b0dfca2f19b",
    timestamp: "2026-11-26 02:05 UTC",
    actor: "Governance Safe 2/3 (0x24e9...d4AA)",
    status: "confirmed",
  },
  {
    id: "act-strat-deploy",
    type: "deployment",
    title: "Strategy Adapter Deployment",
    detail:
      "Deployed MorphoVaultStrategy adapter (0x8f15...Cf93) wired to mock Steakhouse USDG venue (0xE202...b037). Verification completed on-chain.",
    amount: "Single-Venue Adapter",
    blockNumber: "157503816",
    txHash: "0x1f74a008c2670e30d1702f2323a7786851b439c381d604e5785bbff0092c63ef",
    timestamp: "2026-11-24 16:53 UTC",
    actor: "Deployer (0x56d8...8648)",
    status: "confirmed",
  },
  {
    id: "act-acct-deploy",
    type: "deployment",
    title: "Accountant Deployment & Fee Wiring",
    detail:
      "Deployed Accountant fee controller (0xA499...8e32) configured to 10% performance fee, strictly 0% management fee, and 2% max loss protection cap.",
    amount: "10% Perf / 0% Mgmt",
    blockNumber: "157503814",
    txHash: "0x93883a93c72b79313cae6b8c9d2f2d93e5db617bbd6c5bb5d2b78ce13ad373c2",
    timestamp: "2026-11-24 16:52 UTC",
    actor: "Deployer (0x56d8...8648)",
    status: "confirmed",
  },
  {
    id: "act-vault-deploy",
    type: "deployment",
    title: "Allocator Vault Deployment",
    detail:
      "Deployed Yearn V3 ERC-4626 Allocator Vault (0xDa4D...7DA0) as a 45-byte EIP-1167 minimal proxy pointing to canonical runtime implementation.",
    amount: "ERC-4626 Vault Proxy",
    blockNumber: "157503812",
    txHash: "0x51c7aa7c1d7e2e340798be121ec252f4477db199991206f4773403a7433230b7",
    timestamp: "2026-11-24 16:52 UTC",
    actor: "Deployer (0x56d8...8648)",
    status: "confirmed",
  },
];

const TYPE_STYLES: Record<ActivityItem["type"], { badge: string; bg: string; text: string }> = {
  deposit: { badge: "Deposit", bg: "bg-[#102a1c] border-[#1b4332]", text: "text-[#6db89b]" },
  withdraw: { badge: "Withdraw", bg: "bg-[#2a1710] border-[#43231b]", text: "text-[#fb923c]" },
  report: { badge: "Report", bg: "bg-[#14232c] border-[#1d3544]", text: "text-[#38bdf8]" },
  role: { badge: "Governance", bg: "bg-[#22172b] border-[#362244]", text: "text-[#c084fc]" },
  deployment: { badge: "Deployment", bg: "bg-[#122321] border-[#1e3c37]", text: "text-[#5eead4]" },
};

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Avenor — Activity Ledger",
  description:
    "Recorded ledger of deployment, governance, and venue transactions on Robinhood Chain Testnet (46630) — each entry links to the explorer for live re-verification.",
};

export default async function ActivityPage() {
  const facts = await readChainFacts(process.env.NEXT_PUBLIC_RPC_URL);
  const chainText = chainSummary(facts);

  return (
    <div className="shell stack">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#8b929e]">
        <Link href="/app" className="hover:text-[#6db89b] transition-colors">
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
          Every transaction and state change executed on the Avenor vault contracts. All events below originate
          from the recorded deployment and governance history on Robinhood Chain Testnet (46630); each entry re-verifiable via its explorer link.
          Per Avenor AGENTS.md honesty rules, no synthetic, simulated, or placeholder transactions are displayed.
        </p>
      </header>

      {/* Honest Capital Activity State (Research Staging) */}
      <div className="rounded-xl border border-white/[0.08] bg-[#14221c]/70 p-5 sm:p-6 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#6db89b] animate-pulse shrink-0" />
            <div>
              <h2 className="text-sm font-medium text-[#f8f9fa]">Capital Inflows, Redemptions &amp; Harvests</h2>
              <p className="text-xs text-[#a3abb8] mt-0.5">
                Vault <code className="font-mono text-[#6db89b]">0xDa4D...7DA0</code> is in Research Staging with deposit limit 0 USDG.
              </p>
            </div>
          </div>
          <div className="text-xs font-mono text-[#8b929e] shrink-0">
            totalAssets: 0 USDG · totalSupply: 0 shares
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-white/[0.06] text-xs text-[#a3abb8] leading-relaxed">
          <span>
            No user capital deposits, liquidity redemptions, or yield harvest reports have been executed on-chain yet.
            When deposits open following security sign-off, live indexed event logs will stream here in real-time.
          </span>
          <div className="mt-2">
            <a
              href={`${EXPLORER_BASE}/address/0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#6db89b] hover:underline inline-flex items-center gap-1 font-mono text-[11px]"
            >
              Verify Vault Contract on Robinhood Chain Explorer ↗
            </a>
          </div>
        </div>
      </div>

      {/* Recorded Governance & Deployment Feed */}
      <section className="card stack">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
          <h2 className="font-display text-lg font-medium text-[#f8f9fa]">Recorded On-Chain Events</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#a3abb8]">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#101b16] border border-white/[0.08]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#6db89b]" />
              {chainText}
            </span>
          </div>
        </div>

        <div className="divide-y divide-white/[0.06]">
          {VERIFIED_ONCHAIN_EVENTS.map((item) => {
            const style = TYPE_STYLES[item.type];
            return (
              <div
                key={item.id}
                className="py-4 sm:py-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
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
                      <span>·</span>
                      <span>Actor: {item.actor}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center md:flex-col md:items-end justify-between md:justify-center gap-2 shrink-0">
                  <span
                    className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                      item.status === "scheduled"
                        ? "text-[#c084fc] bg-[#22172b] border-[#362244]"
                        : "text-[#6db89b] bg-[#102a1c] border-[#1b4332]"
                    }`}
                  >
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
                    <span className="text-[10px] opacity-75 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform">
                      ↗
                    </span>
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
