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
    note: "The vault and its adapters are engineered specifically for Robinhood Chain Arbitrum Orbit L2. Active deployment is the Testnet 46630 v2 stack (Vault: 0xFB60...4Dd9, Strategy: 0xc964...8291, Timelock: 0x2Bfa...09D). See verified proof transactions catalogued below.",
  },
  {
    label: "Deployment Status",
    value: "Testnet 46630 Live & Verified · Mainnet 4663 Deferred",
    note: "All smart contracts, dual-speed timelocks, and multi-sigs are deployed and verified on Testnet 46630 with public on-chain deployment transactions. Mainnet deployment is deferred pending independent external security audit sign-off and on-chain lifecycle drills.",
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
    address: "0xFB6064C2A4CedaD01b2a873E43890D18e1Cb4Dd9",
    txHash: "0x4d00d5274625c65ba556ccd48433d6bb371ebca00c9f614a7fac4d174261b683",
    block: 158777022,
    category: "Core Vault",
  },
  {
    name: "MorphoVaultStrategy",
    role: "Mock Steakhouse USDG Single-Venue Adapter (Testnet)",
    address: "0xc96479EF4274F7619E1e78FA40bfdb3a367d8291",
    txHash: "0x2d0ae2005ed9f16609521db04a604c5d45e45d30d83a594920f1d0724efcd812",
    block: 158777022,
    category: "Core Vault",
  },
  {
    name: "Accountant",
    role: "Fee Controller (10% Perf Fee, 0% Mgmt Fee, 2% MaxLoss)",
    address: "0xE72b69440D6ddb12F07A4f0A335062f7aeD3Ad7C",
    txHash: "0xc81aaae18b4f6e226a60d4a370fa94b0725ff5b645293d8578809b5950bfb6f0",
    block: 158777022,
    category: "Core Vault",
  },
  {
    name: "Primary Timelock (48h)",
    role: "Governance Delay Controller (172,800s Min Delay)",
    address: "0x2Bfa51B313AA76d2ED0d8D5971Dd8b3e4235609D",
    txHash: "0x89e22d417ee039051ab8c2d79c27483836be3dc91be007635c669ddab1d361a5",
    block: 158777022,
    category: "Governance & Timelock",
  },
  {
    name: "Emergency Timelock (6h)",
    role: "FORCE_REVOKE_MANAGER Fast-Lane (21,600s Delay)",
    address: "0x4B80C02fee19efc0BEb41D921fb3cD54412ad895",
    txHash: "0x52cf1fbbf96fb77000bf03d0096eb1858db55f0d01bbab0fdc6a6206da21d013",
    block: 158777022,
    category: "Governance & Timelock",
  },
  {
    name: "Governance Safe (2/3)",
    role: "Timelock Proposer & Strategy Management Multisig",
    address: "0x68b80E963a8D8029d5D3814A7230887c1Ce0251e",
    txHash: "0xa21a4a06c380f960cb420b90805a6ad7d9ae011c409c1fc9de3d5f93a45b5325",
    block: 158777022,
    category: "Governance & Timelock",
  },
  {
    name: "Guardian (EOA)",
    role: "EMERGENCY_MANAGER (Instant Emergency Pause via 6h Timelock)",
    address: "0x1a7202181f7bDdeFd031C5C45aADA3479A173796",
    txHash: "0xac979c0302cdd7c62e0df9106893133a9263d3d52f4aa8b7de06203c0d9b97cf",
    block: 158777022,
    category: "Governance & Timelock",
  },
  {
    name: "Treasury (EOA)",
    role: "Protocol Fee Recipient",
    address: "0x43bD76147a1c897Fd7e9FDdED517E392528e556b",
    txHash: "0xaff9c2b0d63a8d1c6d81743c7692dd4c4e84bb6152565bd329814a5d8495c183",
    block: 158777022,
    category: "Governance & Timelock",
  },
  {
    name: "VaultFactory",
    role: "Yearn V3 Factory for Minimal Proxies",
    address: "0xcA83591e36949a6190957E22DDDB9dad249a57B2",
    txHash: "0x8a7b519d797038c4f69499ce0a57573229cd8381177cfac9c05fe927934399ff",
    block: 158777022,
    category: "Infrastructure & Venue",
  },
  {
    name: "VaultOriginal (Blueprint)",
    role: "Yearn V3 Vyper Core Implementation Runtime (23,462 B)",
    address: "0x64Dc3C0913744a27E31Eb8322c36ee9494DAdef8",
    txHash: "0xeea3f45ec8d8b0e50b1f66c7b30f71bc008dc05678f5b3d913728c14c16f6d81",
    block: 158777022,
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
    address: "0x686Ba15fdd36A40161a9c64AF21cD5AadA4b5Cf3",
    txHash: "0x41dc570d837c34fd9852dd5bbcb691696636e17157e17f8c1fe6f74c0badb619",
    block: 158777022,
    category: "Infrastructure & Venue",
  },
  {
    name: "Mock Venue (Steakhouse)",
    role: "Mock Morpho Vault Rehearsal Venue",
    address: "0xd6f72a73108eba0e5bfc382bb6cd9d3dda751f05",
    txHash: "0x4ffce55627e745b9ef1044e0d8102299c22e513bed2772e719ebcaf35a188cca",
    block: 158777022,
    category: "Infrastructure & Venue",
  },
  {
    name: "DepositCapHook",
    role: "Deposit Gate: Allowlist + Global Cap 250,000 + Wallet Cap 25,000 (ADR-13)",
    address: "0xf1363c4a6e257e7b0798013f4b241acd439ac6bf",
    txHash: "0xf7c1a8344ee429c02b037d8b2bae36bec73840a1ad1cc7202c3c708109fea514",
    block: 158792521,
    category: "Governance & Timelock",
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
    action: "strategy.setPendingManagement(govSafe)",
    executor: "Deployer (0xf6BA...4c76A)",
    target: "MorphoVaultStrategy (0xc964...8291)",
    txHash: "0xc0720c27b8d40ce1aad9ae0237b33acc3401de5e4c910d8a6f81f2c7a04ae350",
    block: 158777022,
    status: "Confirmed (Status 1)",
    note: "Deployer proposed the Governance Safe as future strategy management at deploy time.",
  },
  {
    action: "strategy.acceptManagement()",
    executor: "Governance Safe 2/3 (0x68b8...51e)",
    target: "MorphoVaultStrategy (0xc964...8291)",
    txHash: "0x7918213812377a777fa761a79ac2d40d0f4b40adc4bd17cca8929a2fa3340787",
    block: 158780713,
    status: "Confirmed (Status 1)",
    note: "Governance Safe executed Safe multisig tx (nonce 0) to accept strategy management ownership.",
  },
  {
    action: "timelock.schedule(vault.accept_role_manager())",
    executor: "Governance Safe 2/3 (0x68b8...51e)",
    target: "TimelockController (0x2Bfa...09D) → Vault",
    txHash: "0xfdfc2efc3945de68b7ce1e6e8c756a56a370bad139efc82fac491ddfbcb17347",
    block: 158780738,
    status: "Queued (Status 1)",
    note: "Operation ID 0xf4d2cee4... Queued 48h delay (172,800s); executable from 2026-11-30T10:20:31Z.",
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
              Deployment records for Robinhood Chain Testnet (Chain ID 46630). Contracts exist at the addresses listed below; deployment transaction receipts are subject to testnet node history retention.
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
