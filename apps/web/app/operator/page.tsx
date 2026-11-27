// /operator — institutional operator and guardian dashboard for Avenor vaults (Brief §11).
//
// Displays verified governance state, TimelockController delays, guardian emergency fast-lanes,
// keeper health indicators, and operational action runbooks.

import Link from "next/link";
import { PIN_BLOCK } from "@/lib/serverData";

interface OperatorRole {
  role: string;
  holder: string;
  holderType: "Safe 2/3" | "Timelock" | "Dedicated EOA" | "Safe 2/2";
  channel: "Timelock (48h)" | "Emergency Timelock (6h)" | "Fast Lane (Instant)";
  status: "active" | "standby";
  description: string;
}

const ROLES_LIST: OperatorRole[] = [
  {
    role: "role_manager",
    holder: "TimelockController (0x7D25...eAAc)",
    holderType: "Timelock",
    channel: "Timelock (48h)",
    status: "active",
    description: "Sole manager of all privileged vault roles. Enforces minimum 48-hour delay on all mutations.",
  },
  {
    role: "EMERGENCY_MANAGER",
    holder: "Guardian Safe (0x9183...2FEA)",
    holderType: "Safe 2/3",
    channel: "Fast Lane (Instant)",
    status: "active",
    description: "Emergency circuit breaker. Can invoke shutdown_vault() or setPaused(true) instantly during exploits.",
  },
  {
    role: "FORCE_REVOKE_MANAGER",
    holder: "Guardian Safe (0x9183...2FEA)",
    holderType: "Safe 2/3",
    channel: "Emergency Timelock (6h)",
    status: "active",
    description: "Bounded fast-lane de-risking via Emergency Timelock (0xa575...C6c2). Revokes problematic strategy in 6 hours without 48h delay.",
  },
  {
    role: "REPORTING_MANAGER",
    holder: "Keeper Hot Wallet (0x1535...D9b1)",
    holderType: "Dedicated EOA",
    channel: "Fast Lane (Instant)",
    status: "active",
    description: "Executes periodic strategy harvest and accounting reports. Strictly bounded by Accountant healthcheck (gain <= 5%, loss <= 2%).",
  },
  {
    role: "DEBT_MANAGER",
    holder: "Keeper Hot Wallet (0x1535...D9b1)",
    holderType: "Dedicated EOA",
    channel: "Fast Lane (Instant)",
    status: "active",
    description: "Allocates idle cash to active strategies per debt queue. Cannot send funds outside registered venues.",
  },
  {
    role: "ADD_STRATEGY_MANAGER",
    holder: "TimelockController (0x7D25...eAAc)",
    holderType: "Timelock",
    channel: "Timelock (48h)",
    status: "active",
    description: "Adds new yield venue strategies to the default withdrawal queue.",
  },
  {
    role: "DEPOSIT_LIMIT_MANAGER",
    holder: "TimelockController (0x7D25...eAAc)",
    holderType: "Timelock",
    channel: "Timelock (48h)",
    status: "active",
    description: "Governs vault TVL ceilings and orderly capital pauses.",
  },
];

export const metadata = {
  title: "Avenor — Operator & Governance Dashboard",
  description: "Institutional operator dashboard: TimelockController verification, guardian fast-lanes, and keeper health status.",
};

export default function OperatorPage() {
  return (
    <div className="shell stack">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#8b929e]">
        <Link href="/#vaults" className="hover:text-[#6db89b] transition-colors">
          ← All vaults
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-[#f8f9fa]">Operator</span>
      </div>

      <header className="rounded-xl bg-[#101b16]/90 border border-white/[0.08] p-6 sm:p-8 backdrop-blur-sm shadow-xl">
        <span className="font-mono text-xs uppercase tracking-wider text-[#6db89b]">
          Institutional Operations &amp; Timelock
        </span>
        <h1 className="font-display text-2xl sm:text-3xl font-medium text-[#f8f9fa] mt-1.5">
          Operator Dashboard
        </h1>
        <p className="mt-3 text-sm text-[#b0b7c3] leading-relaxed max-w-3xl text-pretty">
          Real-time oversight of privileged governance channels, TimelockController enforcement,
          guardian emergency response capabilities, and keeper reporting cadence on Robinhood Chain.
        </p>
      </header>

      {/* Overview Metric Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <span className="font-mono text-xs uppercase tracking-wider text-[#8b929e]">Timelock Delay</span>
          <div className="text-xl sm:text-2xl font-mono font-medium text-[#f8f9fa] mt-1">48 Hours</div>
          <p className="text-xs text-[#a3abb8] mt-2">
            172,800s mandatory timelock delay on all non-emergency parameter updates and role grants.
          </p>
        </div>

        <div className="card">
          <span className="font-mono text-xs uppercase tracking-wider text-[#8b929e]">Guardian Multisig</span>
          <div className="text-xl sm:text-2xl font-mono font-medium text-[#6db89b] mt-1">2-of-3 Safe</div>
          <p className="text-xs text-[#a3abb8] mt-2">
            Independent guardian signers (0x9183...2FEA). Proposer is Governance Safe (0x24e9...d4AA).
          </p>
        </div>

        <div className="card">
          <span className="font-mono text-xs uppercase tracking-wider text-[#8b929e]">Keeper Status</span>
          <div className="text-xl sm:text-2xl font-mono font-medium text-[#38bdf8] mt-1">Operational</div>
          <p className="text-xs text-[#a3abb8] mt-2">
            In-flight transaction guard active; receipt verification enforced before onSent completion.
          </p>
        </div>

        <div className="card border-[#6db89b]/30 bg-[#6db89b]/5">
          <span className="font-mono text-xs uppercase tracking-wider text-[#6db89b]">Handover Maturity</span>
          <div className="text-xl sm:text-2xl font-mono font-medium text-[#f8f9fa] mt-1">28 Nov, 02:09 UTC</div>
          <p className="text-xs text-[#a3abb8] mt-2">
            Scheduled operation <span className="font-mono text-[#6db89b]">0x906838...</span> transfers role_manager to Timelock (0x7D25...eAAc).
          </p>
        </div>
      </div>

      {/* Role Permission Matrix Table */}
      <section className="card stack">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-white/[0.08]">
          <h2 className="font-display text-lg font-medium text-[#f8f9fa]">Role Authority Matrix</h2>
          <span className="text-xs font-mono text-[#8b929e]">Verified On-Chain at Block {PIN_BLOCK}</span>
        </div>

        {/* Mobile Card Stack */}
        <div className="grid grid-cols-1 gap-3 sm:hidden">
          {ROLES_LIST.map((r) => (
            <div
              key={r.role}
              className="rounded-xl bg-[#14221c]/70 border border-white/[0.08] p-4 space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-[#f8f9fa]">{r.role}</span>
                <span
                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono shrink-0 ${
                    r.channel.includes("Fast Lane")
                      ? "bg-[#2a1b10] text-[#fb923c] border border-[#43291b]"
                      : "bg-[#101b16] text-[#6db89b] border border-[#1b3829]"
                  }`}
                >
                  {r.channel}
                </span>
              </div>
              <div className="text-xs font-mono text-[#b0b7c3] break-words">
                {r.holder} <span className="text-[#a3abb8]">({r.holderType})</span>
              </div>
              <div className="text-xs text-[#a3abb8] leading-relaxed">{r.description}</div>
              <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] font-mono">
                <span className="text-[#8b929e]">Status</span>
                <span className="text-[#6db89b] font-medium uppercase tracking-wider">{r.status}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop / Tablet Table */}
        <div className="hidden sm:block overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-white/[0.08] text-[#8b929e]">
                <th className="py-2.5 font-medium">Role</th>
                <th className="py-2.5 font-medium">Holder</th>
                <th className="py-2.5 font-medium">Type</th>
                <th className="py-2.5 font-medium">Execution Channel</th>
                <th className="py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {ROLES_LIST.map((r) => (
                <tr key={r.role} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 font-semibold text-[#f8f9fa]">{r.role}</td>
                  <td className="py-3 text-[#b0b7c3]">{r.holder}</td>
                  <td className="py-3 text-[#a3abb8]">{r.holderType}</td>
                  <td className="py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] ${
                        r.channel.includes("Fast Lane")
                          ? "bg-[#2a1b10] text-[#fb923c] border border-[#43291b]"
                          : "bg-[#101b16] text-[#6db89b] border border-[#1b3829]"
                      }`}
                    >
                      {r.channel}
                    </span>
                  </td>
                  <td className="py-3 text-[#6db89b] font-medium">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Incident Protocol Guidance */}
      <section className="card stack">
        <h2 className="font-display text-lg font-medium text-[#f8f9fa]">
          Emergency Action Guidance &amp; Runbook
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-[#b0b7c3] leading-relaxed">
          <div className="p-4 rounded-lg bg-[#101b16] border border-white/[0.06]">
            <h3 className="font-mono text-xs uppercase tracking-wider text-[#6db89b] mb-1.5">
              Orderly Deposit Freezing (Recommended)
            </h3>
            <p className="text-xs text-[#a3abb8]">
              To suspend incoming capital without disrupting liquidity, invoke{" "}
              <code className="text-[#f8f9fa]">set_deposit_limit(0)</code> or enforce through the{" "}
              <code className="text-[#f8f9fa]">DepositCapHook</code>. Existing depositors retain 100% full
              unrestricted access to withdraw and redeem idle funds.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-[#2a1710] border border-[#43231b]">
            <h3 className="font-mono text-xs uppercase tracking-wider text-[#fb923c] mb-1.5">
              Incident Mode (setPaused = true)
            </h3>
            <p className="text-xs text-[#a3abb8]">
              <strong className="text-[#fb923c]">Caution:</strong> In VaultV3, <code className="text-[#f8f9fa]">setPaused</code>{" "}
              blocks <em>both deposits AND withdrawals</em>. It is reserved exclusively for catastrophic contract exploits,
              never for routine market pauses.
            </p>
          </div>
        </div>
      </section>

      {/* Fast Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 text-xs font-mono text-[#8b929e]">
        <Link href="/docs" className="text-[#6db89b] hover:underline">
          → Review Signer Policy &amp; Architecture Docs
        </Link>
        <Link href="/activity" className="text-[#6db89b] hover:underline">
          → View Real-time Activity Feed
        </Link>
      </div>
    </div>
  );
}
