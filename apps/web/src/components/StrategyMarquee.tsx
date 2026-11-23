export function StrategyMarquee() {
  const items = [
    "USDG Managed Yield",
    "Treasury Reserve",
    "ETH Basis Yield",
    "Liquid Staking Relative Value",
    "Macro Factor Rebalancing",
    "Custom Institutional Mandates",
  ];

  return (
    <section className="bg-[#0b1310]/85 border-y border-white/[0.06] py-4.5 overflow-hidden">
      <div className="animate-marquee flex items-center gap-12 whitespace-nowrap">
        {[...items, ...items, ...items].map((item, idx) => (
          <span
            key={`${item}-${idx}`}
            className="inline-flex items-center gap-3 text-sm font-medium tracking-tight text-[#8b929e]"
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-[#6db89b]/40"
              aria-hidden="true"
            />
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}
