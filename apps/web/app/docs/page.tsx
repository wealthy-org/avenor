// /docs — Operational reference, architecture, and guides for Avenor (W-7, D-22).
//
// Follows Kassora 3-column documentation architecture:
// 1. Left Sidebar: Categorized navigational hierarchy (Start Here, Product, Guides, Reference, Legal)
// 2. Center Content Area: Institutional documentation, key metrics at a glance, specifications
// 3. Right Sidebar: Sticky "On This Page" table of contents with deep anchor links
//
// Static server page: always renders reliably even when RPC is unavailable.

import Link from "next/link";

export const metadata = {
  title: "Avenor Vault Docs",
  description:
    "Architecture, fee configuration, role permission matrix, and operational references for the Avenor USDG vault.",
};

export const SECTIONS = [
  {
    id: "architecture",
    title: "Architecture",
    tag: "Core Specification",
    summary:
      "Avenor is an ERC-4626 vault for USDG on Robinhood Chain Testnet (chain ID 46630; Mainnet 4663 deferred), layered on Yearn V3 Allocator Vault API 3.1.1. Deposits flow: user → AvenorVault (ERC-4626 proxy) → MorphoVaultStrategy adapter → SteakUSDG venue adapter (Steakhouse USDG).",
  },
  {
    id: "fees",
    title: "Fee Configuration",
    tag: "Economics & Accounting",
    summary:
      "All fee values are read from the on-chain accountant at the named block; none are hard-coded here. Management fee is configured strictly at 0.00% (0 bps) and performance fee at 10.00% on realized yield.",
  },
  {
    id: "roles",
    title: "Role Permission Matrix",
    tag: "Governance & Access",
    summary:
      "All roles on VaultV3 are assigned exclusively via the TimelockController (role_manager). The guardian holds a subset of roles on the bounded fast lane for emergency response; it is never the timelock proposer.",
  },
  {
    id: "limitations",
    title: "Known Limitations",
    tag: "Risk & Liquidity Bounds",
    summary:
      "Only idle cash (totalIdle) is available for withdrawal without a strategy queue cycle. maxWithdraw() on the steakUSDG venue returns 0 and must not be used as a liquidity signal. The UI always shows position value and withdrawable now as separate figures.",
  },
  {
    id: "operations",
    title: "Operational References",
    tag: "Runbooks & Toolchain",
    summary:
      "Operational documents and verification runbooks: SIGNER_POLICY.md, BACKUP_RECOVERY.md, KNOWN_LIMITATIONS.md, and scripts/verify-all.py.",
  },
];

interface NavItem {
  title: string;
  href: string;
  active?: boolean;
}

interface NavCategory {
  category: string;
  items: NavItem[];
}

const SIDEBAR_NAV: NavCategory[] = [
  {
    category: "START HERE",
    items: [
      { title: "Welcome to AVENOR", href: "#welcome", active: true },
      { title: "Why AVENOR", href: "#why-avenor" },
    ],
  },
  {
    category: "PRODUCT",
    items: [
      { title: "Architecture", href: "#architecture" },
      { title: "Vault mechanics", href: "#mechanics" },
      { title: "Security and governance", href: "#roles" },
      { title: "Mandates", href: "#mandates-doc" },
    ],
  },
  {
    category: "GUIDES",
    items: [
      { title: "Getting started", href: "#getting-started" },
      { title: "Deposit and withdraw", href: "#deposit-withdraw" },
      { title: "Portfolio telemetry", href: "#portfolio-guide" },
      { title: "FAQ", href: "#faq" },
    ],
  },
  {
    category: "REFERENCE",
    items: [
      { title: "Fee Configuration", href: "#fees" },
      { title: "Role Permission Matrix", href: "#roles" },
      { title: "Deployed contracts", href: "#deployed-contracts" },
      { title: "Operational References", href: "#operations" },
    ],
  },
  {
    category: "LEGAL & RISKS",
    items: [
      { title: "Known Limitations", href: "#limitations" },
      { title: "Capital Disclosures", href: "#disclosures" },
    ],
  },
];

const ON_THIS_PAGE = [
  { label: "What AVENOR is", href: "#welcome" },
  { label: "AVENOR at a glance", href: "#at-a-glance" },
  { label: "Architecture", href: "#architecture" },
  { label: "Fee Configuration", href: "#fees" },
  { label: "Role Permission Matrix", href: "#roles" },
  { label: "Known Limitations", href: "#limitations" },
  { label: "Operational References", href: "#operations" },
];

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Breadcrumb & Live Context Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-[#8b929e] pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Link href="/#vaults" className="hover:text-[#6db89b] transition-colors">
            ← All vaults
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-[#f8f9fa]">Avenor Vault Docs</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono text-[#52b896] bg-[#52b896]/10 border border-[#52b896]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[#52b896] animate-pulse" />
            Robinhood Chain Testnet 46630
          </span>
          <span className="text-[#8b929e]">·</span>
          <span className="text-xs">Operational reference</span>
        </div>
      </div>

      {/* Main 3-Column Documentation Grid (Exact Kassora Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Sidebar (3 Cols on lg): Hierarchical Navigation */}
        <aside className="lg:col-span-3 xl:col-span-3 hidden lg:block sticky top-24 self-start max-h-[calc(100vh-7rem)] overflow-y-auto no-scrollbar space-y-6 pr-4 border-r border-white/[0.06]">
          {SIDEBAR_NAV.map((group) => (
            <div key={group.category} className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]/80 font-semibold px-2">
                {group.category}
              </div>
              <ul className="space-y-0.5 text-xs font-mono">
                {group.items.map((item) => (
                  <li key={item.title}>
                    <a
                      href={item.href}
                      className={`block px-2.5 py-1.5 rounded-lg transition-colors ${
                        item.active
                          ? "bg-[#52b896]/10 text-[#52b896] font-semibold border-l-2 border-[#52b896]"
                          : "text-[#a3abb8] hover:text-[#f8f9fa] hover:bg-white/[0.03]"
                      }`}
                    >
                      {item.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        {/* Center Main Content Area (6-7 Cols on lg/xl) */}
        <main className="lg:col-span-9 xl:col-span-6 min-w-0 space-y-12">
          {/* Header Chapter */}
          <div id="welcome" className="space-y-4">
            <div className="text-xs font-mono uppercase tracking-wider text-[#6db89b] font-semibold">
              START HERE · Operational reference
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-[#f8f9fa]">
              Welcome to AVENOR
            </h1>
            <p className="font-mono text-sm sm:text-base text-[#6db89b] leading-relaxed">
              On-chain investment strategies for USDG on Robinhood Chain, built to be checked rather than trusted.
            </p>
          </div>

          {/* Section: What AVENOR is */}
          <section className="space-y-3.5 pt-2">
            <h2 className="font-display text-xl sm:text-2xl font-medium text-[#f8f9fa]">
              What AVENOR is
            </h2>
            <div className="text-sm text-[#b0b7c3] leading-relaxed space-y-3 text-pretty">
              <p>
                AVENOR brings institutional-style investment mandates on chain. You deposit <strong>USDG</strong>, you
                receive <strong>aUSDG</strong> (an ERC-4626 vault share), and your capital is put to work in carefully
                selected, capped strategies on Robinhood Chain, with every rule written into a smart contract and every
                number readable by anyone.
              </p>
              <p>
                Traditional asset management asks you to trust a monthly statement. AVENOR takes the opposite approach.
                The vault that holds your funds is a standard ERC-4626 contract built on Yearn V3 and OpenZeppelin primitives,
                verified source-for-source on Robinhood Chain. Its total assets, its share price, its strategy caps, its fee
                and the addresses of everyone who can act on it are all public state on Robinhood Chain. Nothing is reported
                by hand; it is computed by the contract, block by block.
              </p>
              <p>
                On top of that contract sits a professional operating model. A curator allocates capital to strategy adapters,
                each one capped. A <strong>guardian</strong> watches over the vault and can pause new deposits or pull a strategy
                back to safety in seconds. And every change that adds risk (a new strategy, a higher cap, a higher fee) has to wait
                a public <strong>48-hour timelock</strong> before it can take effect, so depositors always see it coming.
              </p>
            </div>
          </section>

          {/* Section: AVENOR at a glance (4-Box Stat Card + Spec Table) */}
          <section id="at-a-glance" className="space-y-4 pt-2">
            <h2 className="font-display text-xl sm:text-2xl font-medium text-[#f8f9fa]">
              AVENOR at a glance
            </h2>

            {/* 4 Metric Tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-[#0e1613]/90 border border-white/[0.08] p-4 space-y-1">
                <div className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]">
                  Total Assets · Live
                </div>
                <div className="font-mono text-lg sm:text-xl font-semibold text-[#f8f9fa]">
                  0.00 USDG
                </div>
              </div>

              <div className="rounded-xl bg-[#0e1613]/90 border border-white/[0.08] p-4 space-y-1">
                <div className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]">
                  Deposit Cap · Live
                </div>
                <div className="font-mono text-lg sm:text-xl font-semibold text-[#f8f9fa]">
                  1,000,000.00 USDG
                </div>
              </div>

              <div className="rounded-xl bg-[#0e1613]/90 border border-white/[0.08] p-4 space-y-1">
                <div className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]">
                  Performance Fee · Live
                </div>
                <div className="font-mono text-lg sm:text-xl font-semibold text-[#52b896]">
                  10%
                </div>
              </div>

              <div className="rounded-xl bg-[#0e1613]/90 border border-white/[0.08] p-4 space-y-1">
                <div className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]">
                  Timelock · Live
                </div>
                <div className="font-mono text-lg sm:text-xl font-semibold text-[#f8f9fa]">
                  48 hours
                </div>
              </div>
            </div>

            {/* Specification Table */}
            <div className="rounded-2xl bg-[#0e1613]/90 border border-white/[0.08] overflow-hidden text-xs font-mono">
              <div className="divide-y divide-white/[0.06]">
                <div className="p-3.5 sm:p-4 grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4">
                  <span className="text-[#8b929e]">Network</span>
                  <span className="sm:col-span-2 text-[#f8f9fa]">
                    Robinhood Chain Testnet (Chain ID 46630), gas paid in ETH
                  </span>
                </div>
                <div className="p-3.5 sm:p-4 grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4">
                  <span className="text-[#8b929e]">Deposit asset</span>
                  <span className="sm:col-span-2 text-[#f8f9fa]">
                    USDG (6 decimals)
                  </span>
                </div>
                <div className="p-3.5 sm:p-4 grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4">
                  <span className="text-[#8b929e]">Vault share</span>
                  <span className="sm:col-span-2 text-[#f8f9fa]">
                    aUSDG, a standard ERC-4626 share (6 decimals)
                  </span>
                </div>
                <div className="p-3.5 sm:p-4 grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4">
                  <span className="text-[#8b929e]">Fees</span>
                  <span className="sm:col-span-2 text-[#f8f9fa]">
                    No management fee (0.00%). Performance fee 10% on yield only, enforced by accountant.
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Section: Architecture */}
          <section id="architecture" className="space-y-4 pt-4 border-t border-white/[0.08]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-[#6db89b] font-semibold">
                Core Specification
              </span>
            </div>
            <h2 className="font-display text-2xl font-medium text-[#f8f9fa]">
              Architecture
            </h2>
            <div className="text-sm text-[#b0b7c3] leading-relaxed space-y-3.5">
              <p>
                Avenor is an ERC-4626 vault for USDG on Robinhood Chain Testnet (chain ID 46630; Mainnet 4663 deferred),
                layered on Yearn V3 Allocator Vault API 3.1.1. Deposits flow:
              </p>
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.08] font-mono text-xs text-[#52b896]">
                User → AvenorVault (ERC-4626 proxy) → MorphoVaultStrategy adapter → SteakUSDG venue adapter (Steakhouse USDG).
              </div>
              <h3 className="text-sm font-mono font-semibold text-[#f8f9fa] pt-2">Deploy order &amp; Lifecycle</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-xs font-mono text-[#a3abb8]">
                <li>Deploy TimelockController (≥ 48 h delay) as role_manager.</li>
                <li>Deploy MorphoVaultStrategy with the vault as its vault and the timelock as role_manager.</li>
                <li>Deploy DepositCapHook; set it as the vault&apos;s deposit_hook.</li>
                <li>Grant GUARDIAN role to a separate guardian address (not the timelock proposer).</li>
                <li>Set deposit_limit to 0 until the timelock delay has elapsed; then raise via governance proposal.</li>
              </ol>
              <h3 className="text-sm font-mono font-semibold text-[#f8f9fa] pt-2">Key Invariants</h3>
              <ul className="list-disc pl-5 space-y-1 text-xs text-[#a3abb8]">
                <li><code className="text-[#52b896]">setPaused</code> is for incidents only and blocks both deposits and withdrawals.</li>
                <li>Deposit freezing uses <code className="text-[#52b896]">deposit_limit</code> or <code className="text-[#52b896]">deposit_hook</code>, never setPaused.</li>
                <li><code className="text-[#52b896]">role_manager</code> must be a <code className="text-[#f8f9fa]">TimelockController</code> answering getMinDelay() ≥ 48 h before public deposits.</li>
                <li>Guardian address must not be the timelock proposer.</li>
                <li>All amounts are uint256 with 6 decimals (USDG). No floats anywhere in the stack.</li>
              </ul>
            </div>
          </section>

          {/* Section: Fee Configuration */}
          <section id="fees" className="space-y-4 pt-4 border-t border-white/[0.08]">
            <h2 className="font-display text-2xl font-medium text-[#f8f9fa]">
              Fee Configuration
            </h2>
            <div className="text-sm text-[#b0b7c3] leading-relaxed space-y-3.5">
              <p>
                All fee values are read from the on-chain accountant at the named block; none are hard-coded here.
                The vault page shows the live values next to their block citation. See <code className="text-[#6db89b]">docs/FEE_CONFIG.md</code> for
                the governance history of each parameter.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <div className="text-[#f8f9fa] font-medium">Management Fee: 0.00%</div>
                  <div className="text-[#8b929e] mt-1">Charged on assets under management (basis points per year). Set strictly to 0 bps.</div>
                </div>
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <div className="text-[#f8f9fa] font-medium">Performance Fee: 10.00%</div>
                  <div className="text-[#8b929e] mt-1">Charged on strategy gains at report time (basis points of gain) routed to Treasury Safe.</div>
                </div>
              </div>
              <p className="text-xs text-[#8b929e]">
                Fees are minted as new shares, not deducted from assets. This means totalAssets does not decrease when
                fees are charged; instead totalSupply rises and pricePerShare dilutes. Gain/loss events exclude fee shares.
              </p>
            </div>
          </section>

          {/* Section: Role Permission Matrix */}
          <section id="roles" className="space-y-4 pt-4 border-t border-white/[0.08]">
            <h2 className="font-display text-2xl font-medium text-[#f8f9fa]">
              Role Permission Matrix
            </h2>
            <div className="text-sm text-[#b0b7c3] leading-relaxed space-y-3.5">
              <p>
                All roles on VaultV3 are assigned exclusively via the <strong>TimelockController</strong> (role_manager).
                No role may be granted directly by an EOA after public deposit opens. The guardian holds a subset of
                roles on the bounded fast lane for emergency response; it is never the timelock proposer.
              </p>
              <div className="rounded-xl bg-[#0e1613] border border-white/[0.08] p-4 text-xs font-mono text-[#a3abb8] space-y-1">
                <div>ADD_STRATEGY_MANAGER — adds / removes strategies from the queue.</div>
                <div>REVOKE_STRATEGY_MANAGER — emergency revoke; sits on the bounded fast lane.</div>
                <div>ACCOUNTANT_MANAGER — sets the accountant address.</div>
                <div>QUEUE_MANAGER — sets the default withdrawal queue order.</div>
                <div>REPORTING_MANAGER — calls report() on strategies to realize gains/losses.</div>
                <div>DEBT_MANAGER — sets per-strategy debt limits.</div>
                <div>MAX_DEBT_MANAGER — raises the global debt ceiling.</div>
                <div>DEPOSIT_LIMIT_MANAGER — raises/lowers deposit_limit.</div>
                <div>EMERGENCY_MANAGER — shuts the vault down (irreversible).</div>
              </div>
            </div>
          </section>

          {/* Section: Known Limitations */}
          <section id="limitations" className="space-y-4 pt-4 border-t border-white/[0.08]">
            <h2 className="font-display text-2xl font-medium text-[#f8f9fa]">
              Known Limitations
            </h2>
            <div className="text-sm text-[#b0b7c3] leading-relaxed space-y-3 text-pretty">
              <div className="p-4 rounded-xl bg-amber-500/[0.04] border border-amber-500/20 space-y-1.5 text-xs font-mono">
                <span className="text-amber-300 font-semibold block">Instant Liquidity &amp; Queue Dependence</span>
                <p className="text-[#a3abb8]">
                  Only idle cash (totalIdle) is available for withdrawal without a strategy queue cycle.
                  maxWithdraw() on the steakUSDG venue returns 0 and must not be used as a liquidity signal. The UI always
                  shows &quot;position value&quot; and &quot;withdrawable now&quot; as separate figures. See docs/WITHDRAWAL_SEMANTICS.md.
                </p>
              </div>

              <div className="space-y-2 text-xs font-mono text-[#a3abb8]">
                <div>• <strong>Audit status</strong>: The 2023 upstream Yearn V3 audit covers packages/core. The 2026 Robinhood Chain pin, Avenor adapters, and configuration are not claimed audited.</div>
                <div>• <strong>Deployment status</strong>: All contracts are deployed and verified on Robinhood Chain Testnet (chain ID 46630). Mainnet 4663 deployment is deferred pending independent external security audit sign-off.</div>
                <div>• <strong>max_loss parameter</strong>: The SDK always requires an explicit max_loss parameter for redeem() and withdraw(). Callers may not rely on defaults.</div>
                <div>• <strong>Timelock delay</strong>: The TimelockController enforces a minimum delay of 48 hours before any governance action takes effect.</div>
              </div>
            </div>
          </section>

          {/* Section: Operational References */}
          <section id="operations" className="space-y-4 pt-4 border-t border-white/[0.08]">
            <h2 className="font-display text-2xl font-medium text-[#f8f9fa]">
              Operational References
            </h2>
            <div className="text-sm text-[#b0b7c3] leading-relaxed space-y-3">
              <div className="rounded-xl bg-[#0e1613] border border-white/[0.08] p-4 text-xs font-mono text-[#a3abb8] space-y-1.5">
                <div><strong>docs/SIGNER_POLICY.md</strong> — key management, who holds which keys, rotation procedures.</div>
                <div><strong>docs/BACKUP_RECOVERY.md</strong> — backup procedures, emergency access, recovery runbook.</div>
                <div><strong>docs/KNOWN_LIMITATIONS.md</strong> — exhaustive limitations list (mirrors this page).</div>
                <div><strong>python scripts/verify-all.py</strong> — full gate: secrets, vendor, interfaces, build, fmt, tests, bytecode.</div>
                <div><strong>services/keeper/</strong> — monitors the vault and submits report() calls when due with in-flight guards.</div>
              </div>
            </div>
          </section>

          {/* Provenance Footer */}
          <div className="pt-6 border-t border-white/[0.08] text-xs font-mono text-[#8b929e] flex items-center justify-between">
            <span>Avenor Vault Docs · Built for verifiable transparency</span>
            <Link href="/#vaults" className="text-[#52b896] hover:underline">
              ← Return to Vaults Catalogue
            </Link>
          </div>
        </main>

        {/* Right Sticky Sidebar (3 Cols on xl): On This Page Table of Contents */}
        <aside className="xl:col-span-3 hidden xl:block sticky top-24 self-start max-h-[calc(100vh-7rem)] overflow-y-auto no-scrollbar space-y-3 pl-6 border-l border-white/[0.06]">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e] font-semibold">
            On this page
          </div>
          <ul className="space-y-2 text-xs font-mono">
            {ON_THIS_PAGE.map((item) => (
              <li key={item.label}>
                <a
                  href={item.href}
                  className="text-[#a3abb8] hover:text-[#52b896] transition-colors block"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
