// Transparency is a list of what can be verified, not a trust badge. Every item here is either a
// file in this repository or a constant that appears in it; nothing is fetched, so nothing can be
// stale without the build failing.

import Link from "next/link";

const ITEMS = [
  {
    label: "Network & Chain ID",
    value: "Robinhood Chain (4663)",
    note: "Core allocator vaults and peripheral strategy adapters deployed strictly for Chain 4663",
  },
  {
    label: "Underlying Asset",
    value: "USDG, 6 Decimals",
    note: "All protocol math enforced in fixed-point BigInt 6 decimals; zero floating point precision",
  },
  {
    label: "Vault Shares",
    value: "ERC-4626, 18 Decimals",
    note: "Pro-rata ownership claim tokens; strictly segregated from underlying USDG cash accounting",
  },
  {
    label: "VaultV3 Runtime Artifact",
    value: "runtimeKeccak256 0x6909c58e…",
    note: "Bytecode verification verifiable in docs/BASELINE.md and scripts/verify-bytecode.py",
  },
  {
    label: "Security Audit Status",
    value: "Explicit Scope Statement",
    note: "Upstream Yearn V3 core audited 2023; 2026 Robinhood pin and custom adapters are unaudited",
  },
  {
    label: "Client & Service Code",
    value: "packages/sdk, services/indexer, services/keeper",
    note: "All displayed figures derive from live RPC reads or verified block event indexers",
  },
];

export default function Page() {
  return (
    <div className="shell stack">
      <div className="flex items-center gap-2 text-xs font-mono text-[#8b929e] mb-2">
        <Link href="/#vaults" className="hover:text-[#6db89b] transition-colors">
          ← Back to Vaults
        </Link>
        <span>/</span>
        <span className="text-[#f8f9fa]">Transparency</span>
      </div>

      <header className="rounded-xl bg-[#101b16]/90 border border-white/[0.08] p-6 backdrop-blur-sm shadow-xl">
        <span className="font-mono text-xs uppercase tracking-wider text-[#6db89b]">
          Transparency & Verification
        </span>
        <h1 className="font-display text-2xl sm:text-3xl font-medium text-[#f8f9fa] mt-1">
          Verifiable Invariants
        </h1>
        <p className="mt-2 text-sm text-[#b0b7c3] leading-relaxed max-w-3xl">
          This surface documents immutable protocol architectural parameters. Financial values are displayed strictly on vault interfaces alongside their verified block height and timestamp provenance.
        </p>
      </header>

      <dl className="facts card">
        {ITEMS.map((item) => (
          <div key={item.label} style={{ display: "contents" }}>
            <dt>{item.label}</dt>
            <dd>
              <span className="money font-mono text-[#f8f9fa]">{item.value}</span>
              <div className="text-xs text-[#8b929e] mt-0.5">
                {item.note}
              </div>
            </dd>
          </div>
        ))}
      </dl>

      <div className="banner" data-tone="warn">
        <strong>Explicit Negative Claims</strong>
        <p>
          No unverified &ldquo;audited&rdquo; marketing badges, no forward-looking APY speculation, and no instant liquidity guarantees.
          Immediate redemption capacity is constrained by unallocated idle cash; the interface strictly separates accounting position value
          from immediately withdrawable liquidity.
        </p>
      </div>

      <p className="provenance">
        <Link href="/#vaults" className="text-[#6db89b] hover:underline">
          ← Back to Vault Catalog
        </Link>
      </p>
    </div>
  );
}
