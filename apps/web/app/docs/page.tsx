// /docs — operational reference for Avenor vault operators and integrators (W-7, D-22).
//
// This is a static server page; it imports no on-chain data so it always renders even when the
// RPC is unavailable. Numbers shown here are configuration constants, not on-chain reads: the
// vault page carries live numbers with their block citations.

import Link from "next/link";

export const metadata = {
  title: "Avenor — Docs",
  description:
    "Architecture, fee configuration, role permission matrix, and operational references for the Avenor USDG vault.",
};

const SECTIONS = [
  {
    id: "architecture",
    title: "Architecture",
    content: [
      {
        heading: "Overview",
        body: `Avenor is an ERC-4626 vault for USDG on Robinhood Chain Testnet (chain ID 46630; Mainnet 4663 deferred), layered on
Yearn V3 Allocator Vault API 3.1.1. Deposits flow: user → AvenorVault (ERC-4626 proxy) →
MorphoVaultStrategy adapter → SteakUSDG venue adapter (Steakhouse USDG).`,
      },
      {
        heading: "Deploy order",
        body: `1. Deploy TimelockController (≥ 48 h delay) as role_manager.
2. Deploy MorphoVaultStrategy with the vault as its vault and the timelock as role_manager.
3. Deploy DepositCapHook; set it as the vault's deposit_hook.
4. Grant GUARDIAN role to a separate guardian address (not the timelock proposer).
5. Set deposit_limit to 0 until the timelock delay has elapsed; then raise via governance proposal.`,
      },
      {
        heading: "Key invariants",
        body: `• setPaused is for incidents only and blocks both deposits and withdrawals.
• Deposit freezing uses deposit_limit or deposit_hook, never setPaused.
• role_manager must be a TimelockController answering getMinDelay() ≥ 48 h before public deposits.
• Guardian address must not be the timelock proposer.
• All amounts are uint256 with 6 decimals (USDG). No floats anywhere in the stack.`,
      },
      {
        heading: "Source of truth",
        body: `docs/ARCHITECTURE.md — ADRs and deploy sequence.
docs/BASELINE.md — toolchain pins, bytecode hash, block pin.
docs/WITHDRAWAL_SEMANTICS.md — withdrawal behaviour and 12 test cases.
docs/ROLE_PERMISSION_MATRIX.md — role bits and their assignments.
docs/DEPLOYMENT.md — environment variables, deploy modes, post-deploy assertions.`,
      },
    ],
  },
  {
    id: "fees",
    title: "Fee Configuration",
    content: [
      {
        heading: "Current parameters",
        body: `All fee values are read from the on-chain accountant at the named block; none are
hard-coded here. The vault page shows the live values next to their block citation.
See docs/FEE_CONFIG.md for the governance history of each parameter.`,
      },
      {
        heading: "Fee types",
        body: `Management fee: charged continuously on assets under management (basis points per year).
Performance fee: charged on strategy gains at report time (basis points of gain).
Refund ratio: fraction of losses that the accountant refunds from its own buffer.
Protocol fee: set by the Yearn protocol factory; not under Avenor control.`,
      },
      {
        heading: "Fee mechanics",
        body: `Fees are minted as new shares, not deducted from assets. This means totalAssets does not
decrease when fees are charged; instead totalSupply rises and pricePerShare dilutes. The
reconciliation formula accounts for this correctly: gain/loss events exclude fee shares,
and the indexed formula never double-counts. See reconcile.ts §S-11 comment.`,
      },
    ],
  },
  {
    id: "roles",
    title: "Role Permission Matrix",
    content: [
      {
        heading: "Role bits (VaultV3)",
        body: `ADD_STRATEGY_MANAGER     — adds / removes strategies from the queue.
REVOKE_STRATEGY_MANAGER  — emergency revoke; sits on the bounded fast lane.
FORCE_REVOKE_MANAGER     — forced revoke regardless of debt; highest risk.
ACCOUNTANT_MANAGER       — sets the accountant address.
QUEUE_MANAGER            — sets the default withdrawal queue order.
REPORTING_MANAGER        — calls report() on strategies to realize gains/losses.
DEBT_MANAGER             — sets per-strategy debt limits.
MAX_DEBT_MANAGER         — raises the global debt ceiling.
DEPOSIT_LIMIT_MANAGER    — raises/lowers deposit_limit.
WITHDRAW_LIMIT_MANAGER   — sets minimum_total_idle.
MINIMUM_IDLE_MANAGER     — alias of WITHDRAW_LIMIT_MANAGER in some API versions.
PROFIT_UNLOCK_MANAGER    — sets profit_max_unlock_time.
DEBT_PURCHASER           — purchases bad debt at par.
EMERGENCY_MANAGER        — shuts the vault down (irreversible).`,
      },
      {
        heading: "Assignment policy",
        body: `All roles are assigned exclusively via the TimelockController (role_manager). No role
may be granted directly by an EOA after public deposit opens. The guardian holds a
subset of roles on the bounded fast lane for emergency response; it is never the
timelock proposer. Full matrix: docs/ROLE_PERMISSION_MATRIX.md.`,
      },
    ],
  },
  {
    id: "limitations",
    title: "Known Limitations",
    content: [
      {
        heading: "Instant liquidity",
        body: `Only idle cash (totalIdle) is available for withdrawal without a strategy queue cycle.
At the captured block: idle = 27,024,457.98 USDG vs TVL = 538,856,055.99 USDG (5.02%).
maxWithdraw() on the steakUSDG venue returns 0 at this block and must not be used as a
liquidity signal. The UI always shows "position value" and "withdrawable now" as separate
figures. See docs/WITHDRAWAL_SEMANTICS.md for the full withdrawal flow and all 12 test cases.`,
      },
      {
        heading: "Audit status",
        body: `The 2023 upstream Yearn V3 audit covers packages/core with its stated scope and date.
The 2026 Robinhood Chain pin, Avenor adapters, and Avenor configuration have not been
independently audited. No "audited" badge is claimed for any Avenor-authored code.`,
      },
      {
        heading: "Deployment status",
        body: `All contracts are deployed and verified on Robinhood Chain Testnet (chain ID 46630). Mainnet (4663)
deployment is deferred pending independent external security audit sign-off. eth_getCode for the vault returns 0x on mainnet.`,
      },
      {
        heading: "max_loss parameter",
        body: `The SDK always requires an explicit max_loss parameter for redeem() and withdraw().
Callers may not rely on the VaultV3 defaults (10000 for redeem, 0 for withdraw). Every
SDK call enforces this; see packages/sdk/src/reads.ts and writes.ts.`,
      },
      {
        heading: "Timelock delay",
        body: `The TimelockController enforces a minimum delay of 48 hours before any governance
action takes effect. Emergency actions via the guardian bypass the timelock only for
the roles explicitly listed on the bounded fast lane. Shutdown is irreversible.`,
      },
      {
        heading: "Deposit and withdrawal tracking",
        body: `The indexer monitors on-chain events on Testnet 46630. User balance and position value
are always verified directly against the live contract snapshot at the named block.`,
      },
    ],
  },
  {
    id: "operations",
    title: "Operational References",
    content: [
      {
        heading: "Key documents",
        body: `docs/SIGNER_POLICY.md   — key management, who holds which keys, rotation procedures.
docs/BACKUP_RECOVERY.md — backup procedures, emergency access, recovery runbook.
docs/KNOWN_LIMITATIONS.md — exhaustive limitations list (mirrors this page).
docs/REMEDIATION.md     — audit findings and their remediation status.`,
      },
      {
        heading: "Verification",
        body: `python scripts/verify-all.py — full gate: secrets, vendor, interfaces, build, fmt, tests, bytecode.
python scripts/fork-status.py — diagnose fork RPC connectivity and pin health.
python scripts/fork-test.py  — run Foundry fork tests via local anvil (required; do not use --fork-url directly).`,
      },
      {
        heading: "Keeper service",
        body: `services/keeper/ — monitors the vault and submits report() calls when due.
Keeper confirms transaction inclusion (waitForTransactionReceipt) before marking a job done.
In-flight guard prevents double-submission during pending transactions.
Max nominal per allocation and cooldown interval are enforced in keeper.ts.`,
      },
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="shell stack">
      {/* breadcrumb */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#8b929e]">
        <Link href="/#vaults" className="hover:text-[#6db89b] transition-colors">
          ← All vaults
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-[#f8f9fa]">Docs</span>
      </div>

      <header className="rounded-xl bg-[#101b16]/90 border border-white/[0.08] p-6 sm:p-8 backdrop-blur-sm shadow-xl">
        <span className="font-mono text-xs uppercase tracking-wider text-[#6db89b]">
          Operational reference
        </span>
        <h1 className="font-display text-2xl sm:text-3xl font-medium text-[#f8f9fa] mt-1.5">
          Avenor Vault Docs
        </h1>
        <p className="mt-3 text-sm text-[#b0b7c3] leading-relaxed max-w-3xl text-pretty">
          Architecture, fee configuration, role permission matrix, and operational references.
          Numbers here are configuration constants; live on-chain values are on the{" "}
          <Link href="/#vaults" className="text-[#6db89b] hover:underline">
            vault page
          </Link>{" "}
          with their block citations.
        </p>
      </header>

      {/* in-page nav */}
      <nav className="card">
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-mono">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-[#6db89b] hover:underline">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {SECTIONS.map((section) => (
        <section key={section.id} id={section.id} className="card stack">
          <h2 className="font-display text-lg font-medium text-[#f8f9fa]">{section.title}</h2>
          {section.content.map((block) => (
            <div key={block.heading}>
              <h3 className="font-mono text-xs uppercase tracking-wider text-[#6db89b] mb-1">
                {block.heading}
              </h3>
              <pre className="text-sm text-[#b0b7c3] leading-relaxed whitespace-pre-wrap break-words font-sans">
                {block.body}
              </pre>
            </div>
          ))}
        </section>
      ))}

      <div className="banner" data-tone="warn">
        <strong>Reminder</strong>
        <p>
          This page reflects the repository at the time it was built. Live vault state — totalAssets,
          totalIdle, pricePerShare — is on the vault page, always read from the node at a named block.
        </p>
      </div>

      <p className="provenance text-xs font-mono text-[#8b929e]">
        Sources:{" "}
        <span className="text-[#f8f9fa]">
          docs/ARCHITECTURE.md · docs/FEE_CONFIG.md · docs/ROLE_PERMISSION_MATRIX.md ·
          docs/WITHDRAWAL_SEMANTICS.md · docs/DEPLOYMENT.md
        </span>
      </p>
    </div>
  );
}
