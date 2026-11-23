export function ContractsSection() {
  const contracts = [
    {
      name: "Avenor Allocator Vault (avUSDG)",
      address: "0x5aeBcE3956FeD4542EDBe75d420497378E3B18CA",
      role: "ERC-4626 Vault Core (Yearn V3 API 3.1.1)",
      verified: true,
    },
    {
      name: "SteakUSDG Tokenized Strategy",
      address: "0xB56Ec0F9F523ec366E294101e4a3b68832a8A0bC",
      role: "Morpho Blue Adapter (ERC-4626 Peripheral)",
      verified: true,
    },
    {
      name: "Timelock Controller (≥ 48h)",
      address: "0x2C328D59501Ac36015690b2D08E7764f6eb9491f",
      role: "Governance & Role Manager (OpenZeppelin 5.1)",
      verified: true,
    },
    {
      name: "Accountant Fee Controller",
      address: "0xdEc68A40167d4Eee5B63E78e727827B75E54C287",
      role: "0% Mgmt / 10% Perf Fee Manager",
      verified: true,
    },
    {
      name: "Deposit Cap Hook",
      address: "0xc2B7a01B0Ce6eBE2f542C1a56641264c78dF2309",
      role: "50,000 USDG Guardrail & Whitelist Hook",
      verified: true,
    },
    {
      name: "USDG Underlying Asset",
      address: "0x5c7cd308cb431dd84813fcf442e32906e530fb1d",
      role: "Robinhood Chain Canonical Stablecoin (6 decimals)",
      verified: true,
    },
  ];

  return (
    <section
      id="contracts"
      className="bg-[#0b1310] py-20 md:py-28 px-4 sm:px-6 border-t border-white/[0.08]"
    >
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-10 border-b border-white/[0.08]">
          <div className="max-w-xl">
            <h2 className="font-display text-[clamp(2rem,3.6vw,3.1rem)] font-medium tracking-[-0.025em] text-[#f8f9fa]">
              Smart Contracts
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-[#9ca3af]">
              Verified contract deployments on Robinhood Chain Mainnet (Chain ID 4663).
              Every bytecode deployment is deterministic and pinned to verifiable Git commits.
            </p>
          </div>
          <span className="font-mono text-xs text-[#6db89b] bg-[#6db89b]/10 border border-[#6db89b]/25 rounded-full px-3.5 py-1.5 self-start sm:self-auto">
            Robinhood Chain · 4663
          </span>
        </div>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-white/[0.08] text-[#8b929e] text-xs font-mono uppercase tracking-wider">
                <th className="py-4 px-3 font-medium">Contract</th>
                <th className="py-4 px-3 font-medium">Role / Architecture</th>
                <th className="py-4 px-3 font-medium">Contract Address</th>
                <th className="py-4 px-3 font-medium text-right">Explorer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {contracts.map((c) => (
                <tr key={c.address} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-4.5 px-3 font-medium text-[#f8f9fa]">
                    {c.name}
                  </td>
                  <td className="py-4.5 px-3 text-[#b0b7c3] text-xs">
                    {c.role}
                  </td>
                  <td className="py-4.5 px-3 font-mono text-xs text-[#6db89b]">
                    {c.address}
                  </td>
                  <td className="py-4.5 px-3 text-right">
                    <a
                      href={`https://explorer.robinhood.com/address/${c.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#d1d5db] hover:text-white transition-colors"
                    >
                      <span>View</span>
                      <svg
                        className="w-3.5 h-3.5 text-[#8b929e]"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
