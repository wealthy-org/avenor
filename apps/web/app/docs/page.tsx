// /docs — Operational reference, architecture, and guides for Avenor (W-7, D-22).
//
// Follows Kassora 3-column documentation architecture:
// 1. Left Sidebar: Categorized navigational hierarchy (Start Here, Product, Guides, Reference, Legal)
// 2. Center Content Area: Institutional documentation, key metrics at a glance, specifications
// 3. Right Sidebar: Sticky "On This Page" table of contents with deep anchor links
//
// Static server page: always renders reliably even when RPC is unavailable.

import Link from "next/link";
import { DocsLayout, type NavCategory, type TocItem } from "@/components/DocsLayout";

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

const SIDEBAR_NAV: NavCategory[] = [
  {
    category: "START HERE",
    items: [
      { title: "Welcome to AVENOR", href: "#welcome" },
      { title: "Why AVENOR", href: "#why-avenor" },
    ],
  },
  {
    category: "PRODUCT",
    items: [
      { title: "Architecture", href: "#architecture" },
      { title: "Vault mechanics", href: "#mechanics" },
      { title: "Security & Governance", href: "#roles" },
      { title: "Investment Mandates", href: "#mandates-doc" },
    ],
  },
  {
    category: "GUIDES",
    items: [
      { title: "Getting started", href: "#getting-started" },
      { title: "Deposit & withdraw", href: "#deposit-withdraw" },
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

const ON_THIS_PAGE: TocItem[] = [
  { label: "What AVENOR is", href: "#welcome" },
  { label: "Why AVENOR", href: "#why-avenor" },
  { label: "AVENOR at a glance", href: "#at-a-glance" },
  { label: "Architecture", href: "#architecture" },
  { label: "Vault mechanics", href: "#mechanics" },
  { label: "Security & Governance", href: "#roles" },
  { label: "Investment Mandates", href: "#mandates-doc" },
  { label: "Getting started", href: "#getting-started" },
  { label: "Deposit & withdraw", href: "#deposit-withdraw" },
  { label: "Portfolio telemetry", href: "#portfolio-guide" },
  { label: "Fee Configuration", href: "#fees" },
  { label: "Deployed contracts", href: "#deployed-contracts" },
  { label: "Known Limitations", href: "#limitations" },
  { label: "Capital Disclosures", href: "#disclosures" },
  { label: "Operational References", href: "#operations" },
  { label: "FAQ", href: "#faq" },
];

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 pb-16 space-y-8">
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

      {/* Main 3-Column Interactive Documentation Grid */}
      <DocsLayout sidebarNav={SIDEBAR_NAV} onThisPage={ON_THIS_PAGE}>
        {/* Section: Welcome to AVENOR */}
        <section id="welcome" className="scroll-mt-28 space-y-4">
          <div className="text-xs font-mono uppercase tracking-wider text-[#6db89b] font-semibold">
            START HERE · Operational reference
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-[#f8f9fa]">
            Welcome to AVENOR
          </h1>
          <p className="font-mono text-sm sm:text-base text-[#6db89b] leading-relaxed">
            On-chain investment strategies for USDG on Robinhood Chain, built to be checked rather than trusted.
          </p>

          <div className="text-sm text-[#b0b7c3] leading-relaxed space-y-3.5 pt-2">
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
          </div>
        </section>

        {/* Section: Why AVENOR */}
        <section id="why-avenor" className="scroll-mt-28 space-y-4 pt-6 border-t border-white/[0.08]">
          <h2 className="font-display text-2xl font-medium text-[#f8f9fa]">
            Why AVENOR
          </h2>
          <div className="text-sm text-[#b0b7c3] leading-relaxed space-y-3">
            <p>
              Most yield protocols treat transparency as marketing — showing vanity APY numbers that hide underlying protocol risk,
              unbounded loss exposure, and centralized admin keys. AVENOR is engineered around three core principles:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs font-mono">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                <div className="text-[#52b896] font-semibold">1. Provenance Over Promises</div>
                <p className="text-[#8b929e]">Every number carries the block it came from. No hand-typed marketing yields.</p>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                <div className="text-[#52b896] font-semibold">2. Honest Liquidity</div>
                <p className="text-[#8b929e]">Position value and immediately withdrawable cash are kept strictly separate.</p>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                <div className="text-[#52b896] font-semibold">3. Timelocked Risk</div>
                <p className="text-[#8b929e]">Every change adding risk must wait a 48-hour timelock delay before taking effect.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Section: AVENOR at a glance (4-Box Stat Card + Spec Table) */}
        <section id="at-a-glance" className="scroll-mt-28 space-y-4 pt-6 border-t border-white/[0.08]">
          <h2 className="font-display text-xl sm:text-2xl font-medium text-[#f8f9fa]">
            AVENOR at a glance
          </h2>

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
        <section id="architecture" className="scroll-mt-28 space-y-4 pt-6 border-t border-white/[0.08]">
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

        {/* Section: Vault mechanics */}
        <section id="mechanics" className="scroll-mt-28 space-y-4 pt-6 border-t border-white/[0.08]">
          <h2 className="font-display text-2xl font-medium text-[#f8f9fa]">
            Vault Mechanics
          </h2>
          <div className="text-sm text-[#b0b7c3] leading-relaxed space-y-3">
            <p>
              Avenor conforms strictly to the <strong>ERC-4626 Tokenized Vault Standard</strong>. The vault acts as an asset-allocating proxy,
              splitting assets between an unallocated liquid idle buffer and allocated yield venues:
            </p>
            <div className="rounded-xl bg-[#0e1613] border border-white/[0.08] p-4 text-xs font-mono text-[#a3abb8] space-y-2">
              <div>• <strong>deposit(assets, receiver)</strong>: Transfers exact USDG units, mints proportional aUSDG shares.</div>
              <div>• <strong>withdraw(assets, receiver, owner, max_loss)</strong>: Burns shares to release exact USDG. Requires explicit max_loss.</div>
              <div>• <strong>update_debt(strategy, target_debt)</strong>: Rebalances capital between idle cash buffer and strategy venues.</div>
              <div>• <strong>report()</strong>: Invoked by keeper to realize yield accrued in venues and credit performance fees.</div>
            </div>
          </div>
        </section>

        {/* Section: Security & Governance */}
        <section id="roles" className="scroll-mt-28 space-y-4 pt-6 border-t border-white/[0.08]">
          <h2 className="font-display text-2xl font-medium text-[#f8f9fa]">
            Security, Governance &amp; Role Permission Matrix
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

        {/* Section: Investment Mandates */}
        <section id="mandates-doc" className="scroll-mt-28 space-y-4 pt-6 border-t border-white/[0.08]">
          <h2 className="font-display text-2xl font-medium text-[#f8f9fa]">
            Investment Mandates
          </h2>
          <div className="text-sm text-[#b0b7c3] leading-relaxed space-y-3">
            <p>
              AVENOR organizes capital into distinct institutional mandates tailored for different risk tolerances and liquidity constraints:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                <div className="text-[#52b896] font-semibold">1. Systematic Liquidity Markets (Live)</div>
                <p className="text-[#8b929e]">Allocates USDG across overcollateralized lending and savings vaults on Robinhood Chain, starting with Steakhouse spUSDG.</p>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                <div className="text-[#8b929e] font-semibold">2. Treasury Reserve (Roadmap Phase 1)</div>
                <p className="text-[#8b929e]">Conservative savings reserve focusing on capital preservation and maximum idle availability.</p>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                <div className="text-[#8b929e] font-semibold">3. Managed Liquidity (Roadmap Phase 2)</div>
                <p className="text-[#8b929e]">Actively rebalanced concentrated liquidity positions on Uniswap v4 pools.</p>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                <div className="text-[#8b929e] font-semibold">4. Basis &amp; Funding Capture (Roadmap Phase 3)</div>
                <p className="text-[#8b929e]">Delta-neutral basis arbitrage capturing perpetual funding rate spreads.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Getting Started */}
        <section id="getting-started" className="scroll-mt-28 space-y-4 pt-6 border-t border-white/[0.08]">
          <h2 className="font-display text-2xl font-medium text-[#f8f9fa]">
            Getting Started
          </h2>
          <div className="text-sm text-[#b0b7c3] leading-relaxed space-y-3">
            <p>
              Interacting with AVENOR requires a Web3 wallet (such as MetaMask, Rabby, or WalletConnect) connected to <strong>Robinhood Chain Testnet</strong>:
            </p>
            <div className="rounded-xl bg-[#0e1613] border border-white/[0.08] p-4 text-xs font-mono space-y-1.5">
              <div>Network Name: <strong>Robinhood Chain Testnet</strong></div>
              <div>RPC URL: <code>https://rpc.testnet.chain.robinhood.com</code></div>
              <div>Chain ID: <code>46630</code></div>
              <div>Currency Symbol: <code>ETH</code></div>
            </div>
          </div>
        </section>

        {/* Section: Deposit & Withdraw */}
        <section id="deposit-withdraw" className="scroll-mt-28 space-y-4 pt-6 border-t border-white/[0.08]">
          <h2 className="font-display text-2xl font-medium text-[#f8f9fa]">
            Deposit &amp; Withdraw Workflows
          </h2>
          <div className="text-sm text-[#b0b7c3] leading-relaxed space-y-3">
            <p>
              Every transaction executes deterministically on-chain without opaque intermediary steps:
            </p>
            <div className="space-y-2 text-xs font-mono text-[#a3abb8]">
              <div>1. <strong>Allowance &amp; Approval</strong>: You approve exact USDG units to the vault contract. No infinite approvals requested.</div>
              <div>2. <strong>Deposit Simulation</strong>: The UI runs <code>eth_call</code> simulation against <code>previewDeposit</code> to verify minted shares match expectations.</div>
              <div>3. <strong>Explicit max_loss Redemption</strong>: When withdrawing, an explicit <code>maxLoss</code> parameter (e.g. 0 bps for zero loss) must be provided. The SDK refuses default assumptions.</div>
            </div>
          </div>
        </section>

        {/* Section: Portfolio Telemetry */}
        <section id="portfolio-guide" className="scroll-mt-28 space-y-4 pt-6 border-t border-white/[0.08]">
          <h2 className="font-display text-2xl font-medium text-[#f8f9fa]">
            Portfolio Telemetry
          </h2>
          <div className="text-sm text-[#b0b7c3] leading-relaxed space-y-3">
            <p>
              The Portfolio dashboard ([`/portfolio`](/portfolio)) provides real-time on-chain telemetry:
            </p>
            <div className="rounded-xl bg-[#0e1613] border border-white/[0.08] p-4 text-xs font-mono space-y-1.5 text-[#a3abb8]">
              <div>• <strong>Live Native Balance</strong>: Read directly via <code>client.getBalance(owner)</code>.</div>
              <div>• <strong>Position Value vs Liquid Now</strong>: Discloses total share valuation alongside immediately available idle cash.</div>
              <div>• <strong>CSV Export</strong>: Downloads raw unrounded base units, block citations, and error rows for audit trail.</div>
            </div>
          </div>
        </section>

        {/* Section: Fee Configuration */}
        <section id="fees" className="scroll-mt-28 space-y-4 pt-6 border-t border-white/[0.08]">
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

        {/* Section: Deployed Contracts */}
        <section id="deployed-contracts" className="scroll-mt-28 space-y-4 pt-6 border-t border-white/[0.08]">
          <h2 className="font-display text-2xl font-medium text-[#f8f9fa]">
            Deployed Contracts &amp; Verification
          </h2>
          <div className="text-sm text-[#b0b7c3] leading-relaxed space-y-3">
            <p>
              Verified smart contracts deployed on Robinhood Chain Testnet (Chain ID <code>46630</code>):
            </p>
            <div className="rounded-xl bg-[#0e1613] border border-white/[0.08] overflow-hidden text-xs font-mono">
              <div className="divide-y divide-white/[0.06]">
                <div className="p-3 flex items-center justify-between">
                  <span className="text-[#8b929e]">Avenor USDG Managed Vault (Proxy)</span>
                  <code className="text-[#52b896]">0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0</code>
                </div>
                <div className="p-3 flex items-center justify-between">
                  <span className="text-[#8b929e]">MorphoVaultStrategy Adapter</span>
                  <code className="text-[#f8f9fa]">0x8f151132f80277b7D42Ad9615172E6De1B26Cf93</code>
                </div>
                <div className="p-3 flex items-center justify-between">
                  <span className="text-[#8b929e]">TimelockController (role_manager)</span>
                  <code className="text-[#f8f9fa]">0x7D2511309AA40ed9Bd0f10b3F6c3e36E5b62eAAc</code>
                </div>
                <div className="p-3 flex items-center justify-between">
                  <span className="text-[#8b929e]">DepositCapHook</span>
                  <code className="text-[#f8f9fa]">0x980bAc25633bC5f269EaC26f743D75e3a8907869</code>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Known Limitations */}
        <section id="limitations" className="scroll-mt-28 space-y-4 pt-6 border-t border-white/[0.08]">
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

        {/* Section: Capital Disclosures */}
        <section id="disclosures" className="scroll-mt-28 space-y-4 pt-6 border-t border-white/[0.08]">
          <h2 className="font-display text-2xl font-medium text-[#f8f9fa]">
            Capital Risk &amp; Launch Disclosures
          </h2>
          <div className="text-sm text-[#b0b7c3] leading-relaxed space-y-3">
            <p>
              Participation in AVENOR vaults carries inherent technical, smart contract, and financial risks:
            </p>
            <div className="rounded-xl bg-amber-500/[0.04] border border-amber-500/20 p-4 text-xs font-mono space-y-2 text-[#a3abb8]">
              <div>1. <strong>Underlying Protocol Risk</strong>: Capital deployed to lending venues (e.g. Steakhouse spUSDG on Morpho Blue) is subject to insolvency, bad debt, and liquidation latency risks of the venue.</div>
              <div>2. <strong>Smart Contract Risk</strong>: While core contracts utilize audited Yearn V3 code, custom adapters and integration hooks carry risks of bugs or unexpected EVM behavior.</div>
              <div>3. <strong>No Capital Guarantees</strong>: Past performance does not guarantee future results. Yield fluctuates dynamically based on market demand.</div>
            </div>
          </div>
        </section>

        {/* Section: Operational References */}
        <section id="operations" className="scroll-mt-28 space-y-4 pt-6 border-t border-white/[0.08]">
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

        {/* Section: FAQ */}
        <section id="faq" className="scroll-mt-28 space-y-4 pt-6 border-t border-white/[0.08]">
          <h2 className="font-display text-2xl font-medium text-[#f8f9fa]">
            Frequently Asked Questions
          </h2>
          <div className="space-y-3 text-xs font-mono">
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
              <div className="text-[#f8f9fa] font-semibold">Q: Can emergency pause prevent me from withdrawing my funds?</div>
              <p className="text-[#8b929e]">A: Yes. In Yearn V3, <code>setPaused</code> freezes both deposits and withdrawals during emergencies. For normal deposit gating, AVENOR uses <code>deposit_limit = 0</code> which leaves withdrawals completely open.</p>
            </div>
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
              <div className="text-[#f8f9fa] font-semibold">Q: Why are there 6 decimals on USDG?</div>
              <p className="text-[#8b929e]">A: USDG is pegged to USD and follows standard 6-decimal precision matching stablecoin conventions. Vault shares (aUSDG) match asset decimals (6 decimals) directly.</p>
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
      </DocsLayout>
    </div>
  );
}
