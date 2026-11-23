// Contract table. Addresses come from `src/config/staging.ts` and nothing else; a contract that is not
// recorded there is not in this table. No row may claim a mainnet deployment: `eth_getCode` for the
// vault returns `0x` on Robinhood Chain mainnet, so every row here is a staging-fork address.

import { shortAddress } from "@/lib/format";
import {
  STAGING_ACCOUNTANT,
  STAGING_ASSET,
  STAGING_IMPLEMENTATION,
  STAGING_STRATEGY,
  STAGING_TIMELOCK,
  STAGING_VAULT,
  RECORDED_BLOCK,
} from "@/config/staging";

interface Row {
  name: string;
  address: string;
  role: string;
  /** What is actually known about the code at this address. */
  observed: string;
  checked: boolean;
}

const CONTRACTS: Row[] = [
  {
    name: "Avenor Allocator Vault (avUSDG)",
    address: STAGING_VAULT,
    role: "ERC-4626 allocator vault, Yearn V3 lineage",
    observed: "45 bytes: an EIP-1167 proxy. No code on mainnet, so this is a fork-only address.",
    checked: true,
  },
  {
    name: "VaultV3 implementation",
    address: STAGING_IMPLEMENTATION,
    role: "Runtime the vault proxy delegates to",
    observed: "23,462 bytes; keccak256 0x6909c58e…02be6, matching docs/BASELINE.md",
    checked: true,
  },
  {
    name: "steakUSDG Tokenized Strategy",
    address: STAGING_STRATEGY,
    role: "The only strategy in the default queue",
    observed: "Deployed; holds nothing at the recorded block, so it names no venue",
    checked: false,
  },
  {
    name: "Timelock Controller",
    address: STAGING_TIMELOCK,
    role: "role_manager, 48h minimum delay",
    observed: "Deployed on the staging fork",
    checked: false,
  },
  {
    name: "Accountant",
    address: STAGING_ACCOUNTANT,
    role: "Fee reporting, 10% performance / 0% management",
    observed: "Deployed on the staging fork",
    checked: false,
  },
  {
    name: "USDG underlying asset",
    address: STAGING_ASSET,
    role: "Global Dollar, 6 decimals, symbol USDG",
    observed: "170 bytes on mainnet — symbol(), decimals(), name() answered",
    checked: true,
  },
];

export function ContractsSection() {
  return (
    <section id="contracts" className="bg-[#0b1310] py-14 md:py-28 px-4 sm:px-6 border-t border-white/[0.08]">
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-10 border-b border-white/[0.08]">
          <div className="max-w-2xl">
            <h2 className="font-display text-[clamp(2rem,3.6vw,3.1rem)] font-medium tracking-[-0.025em] text-[#f8f9fa]">
              Contracts
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-[#9ca3af]">
              Six addresses the app talks to. Five are staging-fork deployments; only the USDG token is
              confirmed to have code on mainnet. A row says what was observed at the address instead of
              showing a generic checkmark.
            </p>
          </div>
          {/* No `whitespace-nowrap`: on a 390px screen this chip is 404px wide and would push the page
              sideways. It wraps to two lines instead of being clipped. */}
          <span className="font-mono text-xs text-[#6db89b] bg-[#6db89b]/10 border border-[#6db89b]/25 rounded-full px-3.5 py-1.5 self-start sm:self-auto max-w-full break-words">
            Robinhood Chain · chain ID 4663 · recorded at block {RECORDED_BLOCK}
          </span>
        </div>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-white/[0.08] text-[#a3abb8] text-xs font-mono uppercase tracking-wider">
                <th className="py-4 px-3 font-medium">Contract</th>
                <th className="py-4 px-3 font-medium">Role</th>
                <th className="py-4 px-3 font-medium">Address</th>
                <th className="py-4 px-3 font-medium">Observed on chain</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {CONTRACTS.map((row) => (
                <tr key={`${row.name}-${row.address}`} className="hover:bg-white/[0.02] transition-colors align-top">
                  <td className="py-4 px-3 font-medium text-[#f8f9fa]">{row.name}</td>
                  <td className="py-4 px-3 text-[#c3c9d2] text-[13px] leading-relaxed max-w-[26ch]">{row.role}</td>
                  <td className="py-4 px-3 font-mono text-[13px] text-[#6db89b] whitespace-nowrap" title={row.address}>
                    {shortAddress(row.address)}
                  </td>
                  <td
                    className={`py-4 px-3 text-xs leading-relaxed ${
                      row.checked ? "text-[#b0b7c3]" : "text-[#a3abb8]"
                    }`}
                  >
                    {row.observed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 font-mono text-xs leading-relaxed text-[#a3abb8] max-w-3xl">
          Full addresses, the query and the block are in docs/REFERENCE_CAPTURE.md §3. Bytecode
          fingerprint of the vault artifact is checked by scripts/verify-bytecode.py, not by this page.
        </p>
      </div>
    </section>
  );
}