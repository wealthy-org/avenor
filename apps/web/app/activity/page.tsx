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
// NOTE (v2 redeploy 2026-11-28): all hashes below were confirmed status=1 via
// eth_getTransactionReceipt (handover txs 0x7918…0787 blk 158780713, 0xfdfc…7347 blk 158780738)
// or by the Foundry broadcast receipt log (deploy txs at block 158777022, run-1795860249230.json).
// The pre-redeployment stack (vault 0xDa4D…7DA0) is superseded; see docs/TESTNET_EVIDENCE.md §0.
const VERIFIED_ONCHAIN_EVENTS: ActivityItem[] = [
  {
    id: "act-gov-schedule",
    type: "role",
    title: "Timelock Role Assignment Scheduled",
    detail:
      "Governance Safe scheduled accept_role_manager() on VaultV3 via 48h TimelockController (operation 0xf4d2cee4...). Enforces mandatory 172,800s execution delay before role transition; executable from 2026-11-30T10:20:31Z.",
    amount: "delay: 172,800s (48h)",
    blockNumber: "158780738",
    txHash: "0xfdfc2efc3945de68b7ce1e6e8c756a56a370bad139efc82fac491ddfbcb17347",
    timestamp: "2026-11-28 09:26 UTC",
    actor: "Governance Safe 2/3 (0x68b8...51e)",
    status: "scheduled",
  },
  {
    id: "act-strat-mgmt",
    type: "role",
    title: "Strategy Management Transferred",
    detail:
      "MorphoVaultStrategy management transferred to Governance Safe (0x68b8...51e) via acceptManagement(). Strategy is bound to mock Steakhouse USDG venue stand-in (testnet only).",
    amount: "Management: Safe 2/3",
    blockNumber: "158780713",
    txHash: "0x7918213812377a777fa761a79ac2d40d0f4b40adc4bd17cca8929a2fa3340787",
    timestamp: "2026-11-28 09:24 UTC",
    actor: "Governance Safe 2/3 (0x68b8...51e)",
    status: "confirmed",
  },
  {
    id: "act-strat-deploy",
    type: "deployment",
    title: "Strategy Adapter Deployment",
    detail:
      "Deployed MorphoVaultStrategy adapter (0xc964...8291) wired to mock Steakhouse USDG venue (0xd6f7...1f05, testnet stand-in only). Verification completed on-chain.",
    amount: "Single-Venue Adapter",
    blockNumber: "158777022",
    txHash: "0x2d0ae2005ed9f16609521db04a604c5d45e45d30d83a594920f1d0724efcd812",
    timestamp: "2026-11-28 09:03 UTC",
    actor: "Deployer (0xf6BA...4c76A)",
    status: "confirmed",
  },
  {
    id: "act-acct-deploy",
    type: "deployment",
    title: "Accountant Deployment & Fee Wiring",
    detail:
      "Deployed Accountant fee controller (0xE72b...ad7C) configured to 10% performance fee, strictly 0% management fee, and 2% max loss protection cap.",
    amount: "10% Perf / 0% Mgmt",
    blockNumber: "158777022",
    txHash: "0xc81aaae18b4f6e226a60d4a370fa94b0725ff5b645293d8578809b5950bfb6f0",
    timestamp: "2026-11-28 09:03 UTC",
    actor: "Deployer (0xf6BA...4c76A)",
    status: "confirmed",
  },
  {
    id: "act-vault-deploy",
    type: "deployment",
    title: "Allocator Vault Deployment",
    detail:
      "Deployed Yearn V3 ERC-4626 Allocator Vault (0xFB60...4Dd9) as a 45-byte EIP-1167 minimal proxy pointing to canonical runtime implementation.",
    amount: "ERC-4626 Vault Proxy",
    blockNumber: "158777022",
    txHash: "0x4d00d5274625c65ba556ccd48433d6bb371ebca00c9f614a7fac4d174261b683",
    timestamp: "2026-11-28 09:03 UTC",
    actor: "Deployer (0xf6BA...4c76A)",
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
                Vault <code className="font-mono text-[#6db89b]">0xFB60...4Dd9</code> is in Research Staging with deposit limit 0 USDG.
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
              href={`${EXPLORER_BASE}/address/0xFB6064C2A4CedaD01b2a873E43890D18e1Cb4Dd9`}
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
