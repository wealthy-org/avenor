// Transparency is a list of what can be verified, not a trust badge. Every item here is either a file
// in this repository, a value committed in `src/lib/forkSnapshot.json`, or a value copied from
// `docs/BASELINE.md`. No money figure is printed here: those belong next to the block they were read at.

import Link from "next/link";
import { shortAddress } from "@/lib/format";

const EXPLORER_BASE = "https://testnet.robinhoodchain.com";

function shortTx(hash: string): string {
  if (!hash || hash.length < 18) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

const ITEMS = [
  {
    label: "Target Networks",
    value: "Robinhood Chain Mainnet (4663) & Testnet (46630)",
    note: "The vault and its adapters are engineered specifically for Robinhood Chain Arbitrum Orbit L2. Active deployment is live on Testnet 46630 (Vault: 0xDa4D...7DA0, Strategy: 0x8f15...Cf93, Timelock: 0x7D25...eAAc). See verified proof transactions catalogued below.",
  },
  {
    label: "Deployment Status",
    value: "Testnet 46630 Live & Verified · Mainnet 4663 Ready",
    note: "All smart contracts, dual-speed timelocks, and multi-sigs are fully verified on Testnet 46630 with public on-chain deployment transactions. Mainnet deployment will execute deterministically via Deploy.s.sol following independent security audit sign-off.",
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

interface DeploymentRecord {
  name: string;
  role: string;
  address: string;
  txHash: string;
  block: number;
  category: "Core Vault" | "Governance & Timelock" | "Infrastructure & Venue";
}

const DEPLOYMENT_PROOFS: DeploymentRecord[] = [
  {
    name: "avUSDG Allocator Vault",
    role: "Yearn V3 ERC-4626 Vault (45-byte EIP-1167 Proxy)",
    address: "0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0",
    txHash: "0x51c7aa7c1d7e2e340798be121ec252f4477db199991206f4773403a7433230b7",
    block: 157503812,
    category: "Core Vault",
  },
  {
    name: "MorphoVaultStrategy",
    role: "Steakhouse USDG Single-Venue Adapter",
    address: "0x8f151132f80277b7D42Ad9615172E6De1B26Cf93",
    txHash: "0x1f74a008c2670e30d1702f2323a7786851b439c381d604e5785bbff0092c63ef",
    block: 157503816,
    category: "Core Vault",
  },
  {
    name: "Accountant",
    role: "Fee Controller (10% Perf Fee, 0% Mgmt Fee, 2% MaxLoss)",
    address: "0xA499C9F98cE3a66B79dD9CaA99AA894DDE298e32",
    txHash: "0x93883a93c72b79313cae6b8c9d2f2d93e5db617bbd6c5bb5d2b78ce13ad373c2",
    block: 157503814,
    category: "Core Vault",
  },
  {
    name: "Primary Timelock (48h)",
    role: "Governance Delay Controller (172,800s Min Delay)",
    address: "0x7D2511309AA40ed9Bd0f10b3F6c3e36E5b62eAAc",
    txHash: "0x93dd1ff5c9d2f2d9ea182281855a96db5ef98f2441d8eb6973e04cf4c1064560",
    block: 157503806,
    category: "Governance & Timelock",
  },
  {
    name: "Emergency Timelock (6h)",
    role: "FORCE_REVOKE_MANAGER Fast-Lane (21,600s Delay)",
    address: "0xde3f5071559d929d18092EEf7f3B106e39BCD4b6",
    txHash: "0x82f9d505ff64bfca109c9527ec31ee5ca9070381669c5e305e55e094002ea7b5",
    block: 157503808,
    category: "Governance & Timelock",
  },
  {
    name: "Governance Safe (2/3)",
    role: "Timelock Proposer & Strategy Management Multisig",
    address: "0x24e96fCB7b7f7832D6D5cF5f08E7d50AaC0Bd4AA",
    txHash: "0xd73dfebffb4806a12a550fa4ffdfb8b2e1bf3448f76d9bf3c36398f654b9d084",
    block: 157503798,
    category: "Governance & Timelock",
  },
  {
    name: "Guardian Safe (2/3)",
    role: "EMERGENCY_MANAGER (Instant Emergency Pause)",
    address: "0x83227a7b21Ead1e0581D03144B85Cb63Fd585af1",
    txHash: "0x9fec3258c42a2010839e55b41fe8da463eb4231b1dd83ea92d83eeb5f242557e",
    block: 157503800,
    category: "Governance & Timelock",
  },
  {
    name: "Treasury Safe (2/3)",
    role: "Protocol Fee Recipient & DEBT_PURCHASER",
    address: "0x8AA6f4DA5EC2B562854D18E70A173c6CCC827e58",
    txHash: "0x8d511197475f32a6889eb26462c1dfbb86ba7f4749f7ba3a3d5ea72d73be14b8",
    block: 157503802,
    category: "Governance & Timelock",
  },
  {
    name: "VaultFactory",
    role: "Yearn V3 Factory for Minimal Proxies",
    address: "0x351039141Bd6CB9f4a613a24cD26a537a86ED538",
    txHash: "0xb59b563459c3683f2a588b3aeeb8e778a3c8e4baee6f2b575cf015fbe83537fb",
    block: 157503810,
    category: "Infrastructure & Venue",
  },
  {
    name: "VaultOriginal (Blueprint)",
    role: "Yearn V3 Vyper Core Implementation Runtime (23,462 B)",
    address: "0x8e3C196bcD62772c931fe62aAA76FDb7edAD8258",
    txHash: "0x7a30485a3c940562e847c2d9e13d96fa3ec41916327cfbbfae20e53a2a4ecb3c",
    block: 157503804,
    category: "Infrastructure & Venue",
  },
  {
    name: "Canonical TokenizedStrategy",
    role: "v3.1.1 Implementation (CreateX Deterministic Deployment)",
    address: "0x3110D1Eec90f0651C18e75AD37711A8777342504",
    txHash: "0x34b2c8e00e570c8687f7e83f827fda23e9b3083132395407215c2166af990912",
    block: 157499658,
    category: "Infrastructure & Venue",
  },
  {
    name: "Mock USDG Token",
    role: "ERC-20 Underlying Testnet Reserve Asset (6 Decimals)",
    address: "0xf32FFAfDC3B430D8143e29191bbCCc7AB4e6dB6c",
    txHash: "0x2c6dd716b32810a9f5d137bc38ee055561a3377dc764263309a6f3b0631e847c",
    block: 157503794,
    category: "Infrastructure & Venue",
  },
  {
    name: "Mock Venue (Steakhouse)",
    role: "Mock Morpho Vault Rehearsal Venue",
    address: "0xE20266eFC2E71e8FfC5871CDF25Dcc6522d1b037",
    txHash: "0x054f15d2f83f0665b16954a1be2e68c62c3f8e5b4b1a415ff699a2c38dc9c05e",
    block: 157503796,
    category: "Infrastructure & Venue",
  },
];

interface GovernanceActionRecord {
  action: string;
  executor: string;
  target: string;
  txHash: string;
  block: number;
  status: string;
  note: string;
}

const GOVERNANCE_ACTIONS: GovernanceActionRecord[] = [
  {
    action: "strategy.acceptManagement()",
    executor: "Governance Safe 2/3 (0x24e9...4AA)",
    target: "MorphoVaultStrategy (0x8f15...Cf93)",
    txHash: "0xb88761254bb53feea86129bfe6c515ad7cd79f5a4f83ded84aa53b0dfca2f19b",
    block: 157995762,
    status: "Confirmed (Status 1)",
    note: "Governance Safe executed Safe multisig tx to accept strategy management ownership.",
  },
  {
    action: "timelock.schedule(vault.accept_role_manager())",
    executor: "Governance Safe 2/3 (0x24e9...4AA)",
    target: "TimelockController (0x7D25...eAAc) → Vault",
    txHash: "0x381fdf02042413bbdbda93c33b3bdff98a1e05b7c87c926dae5c806c9bc9376d",
    block: 157995780,
    status: "Queued (Status 1)",
    note: "Operation ID 0x9068381b... Queued 48h delay (172,800s) for vault role_manager transfer.",
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
          read from. Every smart contract and governance transaction is documented with verified on-chain proof.
        </p>
      </header>

      {/* Facts Card */}
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

      {/* Verified On-Chain Deployment Provenance Section */}
      <section className="card stack">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-white/[0.08]">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-[#6db89b] animate-pulse" />
              <h2 className="font-display text-xl sm:text-2xl font-medium text-[#f8f9fa]">
                Testnet (46630) Deployment Proof
              </h2>
            </div>
            <p className="mt-1 text-sm text-[#b0b7c3] max-w-2xl">
              Verified deployment transactions on Robinhood Chain Testnet (Chain ID 46630). Every transaction hash is
              verifiable on-chain via the block explorer.
            </p>
          </div>
          <span className="font-mono text-xs text-[#6db89b] bg-[#6db89b]/10 border border-[#6db89b]/25 rounded-full px-3 py-1 self-start sm:self-auto">
            RPC: rpc.testnet.chain.robinhood.com
          </span>
        </div>

        {/* Mobile View: Stacked Cards */}
        <div className="grid grid-cols-1 gap-3.5 sm:hidden">
          {DEPLOYMENT_PROOFS.map((row) => (
            <div
              key={row.address}
              className="rounded-xl bg-[#14221c]/70 border border-white/[0.08] p-4 space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-[#f8f9fa] text-sm">{row.name}</div>
                  <div className="text-[11px] font-mono text-[#6db89b] mt-0.5">{row.category}</div>
                </div>
                <span className="font-mono text-[11px] text-[#a3abb8] bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.08] shrink-0">
                  Block {row.block}
                </span>
              </div>

              <div className="text-xs text-[#c3c9d2] leading-relaxed">{row.role}</div>

              <div className="pt-2 border-t border-white/[0.06] space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#8b929e]">Contract:</span>
                  <a
                    href={`${EXPLORER_BASE}/address/${row.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#6db89b] hover:underline"
                    title={row.address}
                  >
                    {shortAddress(row.address)} ↗
                  </a>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#8b929e]">Deploy TX:</span>
                  <a
                    href={`${EXPLORER_BASE}/tx/${row.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#6db89b] hover:underline"
                    title={row.txHash}
                  >
                    {shortTx(row.txHash)} ↗
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop View: Full Data Table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-white/[0.08] text-[#a3abb8] text-xs font-mono uppercase tracking-wider">
                <th className="py-3 px-3 font-medium">Contract</th>
                <th className="py-3 px-3 font-medium">Role / Architecture</th>
                <th className="py-3 px-3 font-medium">Deployed Address</th>
                <th className="py-3 px-3 font-medium">Deployment TX Hash</th>
                <th className="py-3 px-3 font-medium">Block</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {DEPLOYMENT_PROOFS.map((row) => (
                <tr key={row.address} className="hover:bg-white/[0.02] transition-colors align-top">
                  <td className="py-3.5 px-3">
                    <div className="font-medium text-[#f8f9fa]">{row.name}</div>
                    <div className="text-[11px] font-mono text-[#6db89b] mt-0.5">{row.category}</div>
                  </td>
                  <td className="py-3.5 px-3 text-[#c3c9d2] text-xs leading-relaxed max-w-[28ch]">{row.role}</td>
                  <td className="py-3.5 px-3 font-mono text-xs whitespace-nowrap">
                    <a
                      href={`${EXPLORER_BASE}/address/${row.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#6db89b] hover:underline inline-flex items-center gap-1"
                      title={row.address}
                    >
                      <span>{shortAddress(row.address)}</span>
                      <span className="text-[10px] opacity-75">↗</span>
                    </a>
                  </td>
                  <td className="py-3.5 px-3 font-mono text-xs whitespace-nowrap">
                    <a
                      href={`${EXPLORER_BASE}/tx/${row.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#6db89b] hover:underline inline-flex items-center gap-1"
                      title={row.txHash}
                    >
                      <span>{shortTx(row.txHash)}</span>
                      <span className="text-[10px] opacity-75">↗</span>
                    </a>
                  </td>
                  <td className="py-3.5 px-3 font-mono text-xs text-[#a3abb8] whitespace-nowrap">
                    {row.block}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Governance & Handoff Proof Section */}
      <section className="card stack">
        <div className="pb-3 border-b border-white/[0.08]">
          <h2 className="font-display text-xl sm:text-2xl font-medium text-[#f8f9fa]">
            Safe Multisig Governance Handoff Proof
          </h2>
          <p className="mt-1 text-sm text-[#b0b7c3] max-w-2xl">
            On-chain execution proof of 2/3 Governance Safe accepting strategy management and queuing the 48-hour
            Timelock role manager transfer.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3.5">
          {GOVERNANCE_ACTIONS.map((action) => (
            <div
              key={action.txHash}
              className="rounded-xl bg-[#14221c]/70 border border-white/[0.08] p-4 space-y-2"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="font-mono text-sm font-medium text-[#6db89b]">{action.action}</div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-[#6db89b] bg-[#6db89b]/10 border border-[#6db89b]/25 px-2 py-0.5 rounded">
                    {action.status}
                  </span>
                  <span className="font-mono text-xs text-[#a3abb8]">Block {action.block}</span>
                </div>
              </div>
              <p className="text-xs text-[#c3c9d2] leading-relaxed">{action.note}</p>
              <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                <div className="text-[#8b929e]">
                  <span>Initiator: </span>
                  <span className="text-[#f8f9fa]">{action.executor}</span>
                </div>
                <div>
                  <span className="text-[#8b929e]">Tx: </span>
                  <a
                    href={`${EXPLORER_BASE}/tx/${action.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#6db89b] hover:underline"
                    title={action.txHash}
                  >
                    {action.txHash} ↗
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Claims Banner */}
      <div className="banner" data-tone="warn">
        <strong>Claims that are not made</strong>
        <p>
          No &ldquo;audited&rdquo; badge, no APY, no promise of instant withdrawal. Immediate liquidity depends on idle
          cash and on the strategy queue; the UI keeps position value and the amount withdrawable now as separate
          numbers.
        </p>
      </div>

      {/* How a number reaches this page */}
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
