// Transparency is a list of what can be verified, not a trust badge. Every item here is either a file
// in this repository, a value committed in `src/lib/forkSnapshot.json`, or a value copied from
// `docs/BASELINE.md`. No money figure is printed here: those belong next to the block they were read at.

import Link from "next/link";
import { CANONICAL_HEADER_AT_CAPTURE_HEIGHT, PIN_BLOCK, PIN_BLOCK_HASH } from "@/lib/serverData";

const ITEMS = [
  {
    label: "Target Networks",
    value: "Robinhood Chain Mainnet (4663) & Testnet (46630)",
    note: "The vault and its adapters are engineered specifically for Robinhood Chain Arbitrum Orbit L2. Active deployment is live on Testnet 46630 (Vault: 0xDa4D...7DA0, Strategy: 0x8f15...Cf93, Timelock: 0x7D25...eAAc).",
  },
  {
    label: "Deployment Status",
    value: "Testnet 46630 Live & Verified · Mainnet 4663 Ready",
    note: "All smart contracts, dual-speed timelocks, and multi-sigs are fully verified on Testnet 46630. Mainnet deployment will execute deterministically via Deploy.s.sol following independent security audit sign-off.",
  },
  {
    label: "Asset",
    value: "USDG · 6 decimals",
    note: "Every amount in the app is a bigint with 6 decimals, never a float.",
  },
  {
    label: "Shares",
    value: "6 decimals at the captured block",
    note: "Share decimals are read from the vault (shareDecimals = 6 here), not assumed. A share is not money and is never added to a USDG balance.",
  },
  {
    label: "VaultV3 artifact",
    value: "runtimeKeccak256 0x6909c58e…02be6",
    suffix: "23,462 bytes of runtime code",
    note: "The vault address is a 45-byte EIP-1167 proxy; the hash and size describe the implementation runtime it delegates to. Recorded in docs/BASELINE.md and re-computed by scripts/verify-bytecode.py on the same commit.",
  },
  {
    label: "Audit status",
    value: "not claimed",
    note: "The 2023 upstream audit is cited with its scope and date; the 2026 pin is unaudited.",
  },
  {
    label: "Code",
    value: "packages/sdk · services/indexer · services/keeper",
    note: "A number in the app comes from an SDK read of the chain, or from an API that names its block.",
  },
];

export default function Page() {
  return (
    <div className="shell stack">
      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#8b929e]">
        <Link href="/#vaults" className="hover:text-[#6db89b] transition-colors">
          ← All vaults
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-[#f8f9fa]">Transparency</span>
      </div>

      <header className="rounded-xl bg-[#101b16]/90 border border-white/[0.08] p-6 sm:p-8 backdrop-blur-sm shadow-xl">
        <span className="font-mono text-xs uppercase tracking-wider text-[#6db89b]">Transparency &amp; verification</span>
        <h1 className="font-display text-2xl sm:text-3xl font-medium text-[#f8f9fa] mt-1.5">What can be checked</h1>
        <p className="mt-3 text-sm text-[#b0b7c3] leading-relaxed max-w-3xl text-pretty">
          This page shows no money figures. Money appears only on the vault page, next to the block and the source it was
          read from.
        </p>
      </header>

      <div className="card">
        <dl className="facts">
          {ITEMS.map((item) => (
            <div key={item.label} style={{ display: "contents" }}>
              <dt>{item.label}</dt>
              <dd>
                <span className="money font-mono text-[#f8f9fa] break-words">{item.value}</span>
                {"suffix" in item ? (
                  <div className="font-mono text-xs text-[#a3abb8] mt-0.5">{item.suffix}</div>
                ) : null}
                <div className="text-xs text-[#a3abb8] mt-1 leading-relaxed max-w-2xl text-pretty">{item.note}</div>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="banner" data-tone="warn">
        <strong>Claims that are not made</strong>
        <p>
          No &ldquo;audited&rdquo; badge, no APY, no promise of instant withdrawal. Immediate liquidity depends on idle
          cash and on the strategy queue; the UI keeps position value and the amount withdrawable now as separate
          numbers.
        </p>
      </div>

      <section className="card stack">
        <h2>How a number reaches this page</h2>
        <ol className="grid grid-cols-1 gap-y-2 pl-5 list-decimal text-sm text-[#b0b7c3] max-w-3xl">
          <li>The SDK reads the contract at a named block; nothing is estimated.</li>
          <li>The API returns the value as a decimal string plus the block and its hash.</li>
          <li>The page rejects a value that arrives as a JSON number, because parsing it already rounded it.</li>
          <li>Each section prints the block it was read at; a section that failed says so instead of showing zero.</li>
        </ol>
        <p className="provenance">
          <Link href="/#vaults" className="text-[#6db89b] hover:underline">
            ← Back to the vault catalogue
          </Link>
        </p>
      </section>
    </div>
  );
}
