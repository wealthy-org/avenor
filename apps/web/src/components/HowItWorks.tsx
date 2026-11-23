export function HowItWorks() {
  const steps = [
    {
      step: "01",
      title: "Connect",
      description:
        "Review mandate parameters, fee schedules, and smart contract audit status, then connect MetaMask, Robinhood Wallet, or WalletConnect on Robinhood Chain (Chain ID 4663).",
    },
    {
      step: "02",
      title: "Allocate",
      description:
        "Select a designated vault and examine how capital is deployed through deterministic ERC-4626 share accounting and capped strategy adapters with zero-loss bounds.",
    },
    {
      step: "03",
      title: "Monitor & redeem",
      description:
        "Verify reported net asset values and immutable deposit or redemption events via Blockscout, subject to each strategy's stated liquidity and settlement schedule.",
    },
  ];

  return (
    <section
      id="how-it-works"
      className="bg-[#f8f9fa] text-[#0b1310] py-20 md:py-28 px-4 sm:px-6 transition-colors"
    >
      <div className="mx-auto max-w-[1200px]">
        <div className="max-w-xl">
          <h2 className="font-display text-[clamp(2rem,3.6vw,3.1rem)] font-medium tracking-[-0.025em] text-[#0b1310]">
            No black boxes.
          </h2>
          <p className="mt-3 text-sm sm:text-[15px] leading-relaxed text-[#4b5563]">
            Every asset flow is recorded on Robinhood Chain. From deposit authorization to venue deployment and final settlement, logic executes deterministically on-chain.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-10">
          {steps.map((s) => (
            <div
              key={s.step}
              className="pt-6 border-t border-[#0b1310]/15 flex flex-col justify-between"
            >
              <div>
                <div className="font-mono text-xs text-[#6b7280]">{s.step}</div>
                <h3 className="mt-4 font-display text-xl font-medium text-[#0b1310]">
                  {s.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[#4b5563]">
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
