export function HowItWorks() {
  const steps = [
    {
      step: "01",
      title: "Connect",
      description:
        "The app reads the chain id from the node, asks your wallet to switch to that chain and no other, and refuses to sign anywhere else.",
      tag: "Chain 46630",
    },
    {
      step: "02",
      title: "Allocate",
      description:
        "Deposit USDG against a cap the contract enforces. Shares mint at the price per share read in the same block, with an exact allowance and slippage guard.",
      tag: "Exact Allowance",
    },
    {
      step: "03",
      title: "Monitor and redeem",
      description:
        "Position value and withdrawable amounts are separate figures. A withdrawal carries an explicit max_loss budget, visible before signing.",
      tag: "max_loss explicit",
    },
  ];

  return (
    <section
      id="how-it-works"
      className="bg-[#0e1612] text-[#e9efeb] py-16 md:py-28 px-4 sm:px-6 relative overflow-hidden border-y border-white/[0.06]"
    >
      <div className="mx-auto max-w-[1200px]">
        {/* Header */}
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#52b896]/30 bg-[#52b896]/10 text-xs font-mono uppercase tracking-widest text-[#52b896] mb-4">
            Deterministic Execution
          </div>
          <h2 className="font-display text-[clamp(2.1rem,3.8vw,3.2rem)] font-medium tracking-[-0.03em] text-[#f8f9fa] leading-tight">
            No black boxes.<br />
            <span className="text-[#52b896]">Follow the money, block by block.</span>
          </h2>
          <p className="mt-4 text-sm sm:text-base leading-relaxed text-[#a3abb8]">
            Every asset flow is recorded on Robinhood Chain. From deposit authorization to venue deployment and final settlement, logic executes deterministically on-chain.
          </p>
        </div>

        {/* Visual Architecture Fund Flow Box */}
        <div className="mt-10 rounded-2xl bg-[#080d0b] border border-white/[0.08] p-5 sm:p-8 overflow-hidden shadow-2xl">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#6db89b] mb-4 flex items-center justify-between">
            <span>On-Chain Fund Flow Architecture</span>
            <span className="text-[#a3abb8]">Arbitrum Orbit L2</span>
          </div>
          <div className="overflow-x-auto pb-2">
            <svg
              viewBox="0 0 1240 170"
              role="img"
              aria-label="Fund flow from wallet to vault to strategy to venue"
              className="w-full min-w-[840px] h-auto block"
            >
              <defs>
                <marker
                  id="flow-arrow"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto"
                >
                  <path d="M 1 2 L 8 5 L 1 8 z" fill="#52b896" />
                </marker>
              </defs>

              {/* Step Boxes */}
              <g fill="#101b16" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5">
                <rect x="15" y="45" width="180" height="80" rx="14" />
                <rect x="345" y="45" width="200" height="80" rx="14" stroke="#52b896" strokeWidth="2" />
                <rect x="715" y="45" width="200" height="80" rx="14" />
                <rect x="1045" y="45" width="180" height="80" rx="14" />
              </g>

              {/* Connecting Flow Lines */}
              <g stroke="#52b896" strokeWidth="2" fill="none">
                <path strokeDasharray="5 7" className="animate-pulse" d="M195 85H338" markerEnd="url(#flow-arrow)" />
                <path strokeDasharray="5 7" className="animate-pulse" d="M545 85H708" markerEnd="url(#flow-arrow)" />
                <path strokeDasharray="5 7" className="animate-pulse" d="M915 85H1038" markerEnd="url(#flow-arrow)" />
              </g>

              {/* Connector Step Badges (Pills behind text prevent line overlap) */}
              <g fill="#080d0b" stroke="rgba(82, 184, 150, 0.4)" strokeWidth="1">
                <rect x="215" y="59" width="110" height="24" rx="12" />
                <rect x="555" y="59" width="150" height="24" rx="12" />
                <rect x="925" y="59" width="105" height="24" rx="12" />
              </g>

              {/* Connector Step Texts */}
              <g fontFamily="monospace" fontSize="11" fill="#8ed1b7" textAnchor="middle" fontWeight="500">
                <text x="270" y="75">1. deposit()</text>
                <text x="630" y="75">2. update_debt()</text>
                <text x="977" y="75">3. supply()</text>
              </g>

              {/* Box Titles */}
              <g fontFamily="system-ui, -apple-system, sans-serif" fontSize="16" fontWeight="600" fill="#f8f9fa" textAnchor="middle">
                <text x="105" y="91">Your Wallet</text>
                <text x="445" y="91" fill="#52b896">Avenor Vault</text>
                <text x="815" y="91">Tokenized Strategy</text>
                <text x="1135" y="91">Steakhouse USDG</text>
              </g>

              {/* Subtitles Below Boxes */}
              <g fontFamily="monospace" fontSize="12" fill="#8fa198" textAnchor="middle">
                <text x="105" y="148">USDG (6 dec)</text>
                <text x="445" y="148" fill="#52b896">ERC-4626 avUSDG</text>
                <text x="815" y="148">default queue</text>
                <text x="1135" y="148">Morpho Blue Venue</text>
              </g>
            </svg>
          </div>
        </div>

        {/* 3 Steps Cards */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((s) => (
            <div
              key={s.step}
              className="rounded-2xl bg-[#121c17]/90 border border-white/[0.08] hover:border-[#52b896]/30 p-6 sm:p-7 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/40"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-sm font-semibold text-[#52b896] bg-[#52b896]/10 px-2.5 py-1 rounded-lg">
                    {s.step}
                  </span>
                  <span className="text-[11px] font-mono text-[#a3abb8] uppercase tracking-wider">
                    {s.tag}
                  </span>
                </div>
                <h3 className="font-display text-xl font-medium text-[#f8f9fa]">
                  {s.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[#a3abb8]">
                  {s.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
