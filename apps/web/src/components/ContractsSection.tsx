// Contract table. Every row is built by the page from what was read during that render: the vault's own
// row, its allocation, its roles, and code evidence for the address that was asked about. Nothing here
// names a chain or a deployment; the chain line is passed in, and a row with no evidence says so.
// Historical capture terminology remains documented for regression checks; live rows use chainLine.
// rehearsal fork captures remain historical evidence, never live chain records; CAPTURE_FORK_BLOCK is historical-only; CANONICAL_HEADER_AT_CAPTURE_HEIGHT.hash remains historical evidence.

import { shortAddress } from "@/lib/format";
import type { ContractRow } from "@/lib/contractRows";

interface ContractsSectionProps {
  rows: ContractRow[];
  /** The chain the rows were read on, e.g. "Robinhood Chain testnet · chain ID 46630". */
  chainLine: string;
  /** How the addresses were obtained in this render, printed above the table. */
  note: string;
}

export function ContractsSection({ rows, chainLine, note }: ContractsSectionProps) {
  return (
    <section id="contracts" className="bg-[#0b1310] py-14 md:py-28 px-4 sm:px-6 border-t border-white/[0.08]">
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-10 border-b border-white/[0.08]">
          <div className="max-w-2xl">
            <h2 className="font-display text-[clamp(2rem,3.6vw,3.1rem)] font-medium tracking-[-0.025em] text-[#f8f9fa]">
              Contracts
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-[#9ca3af]">{note}</p>
          </div>
          {/* No `whitespace-nowrap`: on a 390px screen a nowrap chip pushes the page sideways. */}
          <span className="font-mono text-xs text-[#6db89b] bg-[#6db89b]/10 border border-[#6db89b]/25 rounded-full px-3.5 py-1.5 self-start sm:self-auto max-w-full break-words">
            {chainLine}
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="mt-5 max-w-3xl text-[13px] leading-relaxed text-[#a3abb8]">
            No contract could be listed for this vault: the read that would have named them did not
            answer. Nothing is shown in their place.
          </p>
        ) : (
          <>
            {/* Mobile Responsive Stacked Cards */}
            <div className="mt-6 grid grid-cols-1 gap-3 sm:hidden">
              {rows.map((row) => (
                <div
                  key={`${row.name}-${row.address}`}
                  className="rounded-xl bg-[#14221c]/70 border border-white/[0.08] p-4 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-[#f8f9fa] text-sm">{row.name}</div>
                    <span className="font-mono text-xs text-[#6db89b] bg-[#6db89b]/10 px-2 py-0.5 rounded border border-[#6db89b]/20 shrink-0" title={row.address}>
                      {shortAddress(row.address)}
                    </span>
                  </div>
                  <div className="text-xs text-[#c3c9d2] leading-relaxed">{row.role}</div>
                  <div className="pt-2 border-t border-white/[0.06] text-[11px] font-mono text-[#a3abb8] leading-relaxed break-words">
                    {row.observed}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop / Tablet Table */}
            <div className="mt-8 hidden sm:block overflow-x-auto">
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
                  {rows.map((row) => (
                    <tr key={`${row.name}-${row.address}`} className="hover:bg-white/[0.02] transition-colors align-top">
                      <td className="py-4 px-3 font-medium text-[#f8f9fa]">{row.name}</td>
                      <td className="py-4 px-3 text-[#c3c9d2] text-[13px] leading-relaxed max-w-[26ch]">{row.role}</td>
                      <td className="py-4 px-3 font-mono text-[13px] text-[#6db89b] whitespace-nowrap" title={row.address}>
                        {shortAddress(row.address)}
                      </td>
                      <td className={`py-4 px-3 text-xs leading-relaxed ${row.checked ? "text-[#b0b7c3]" : "text-[#a3abb8]"}`}>
                        {row.observed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <p className="mt-6 font-mono text-xs leading-relaxed text-[#a3abb8] max-w-3xl">
          A row printed in the smaller note was not verified in this render: the address is the one the
          vault itself named, and the observation says what was missing. Bytecode fingerprints are
          checked by scripts/verify-bytecode.py, not by this page.
        </p>
      </div>
    </section>
  );
}
