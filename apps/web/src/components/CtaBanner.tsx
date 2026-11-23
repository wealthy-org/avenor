export function CtaBanner() {
  return (
    <section className="bg-[#0f1915]/80 py-12 md:py-24 px-4 sm:px-6">
      <div className="mx-auto max-w-[1200px]">
        <div className="iridescent-border rounded-2xl bg-[#0b1310] bg-dot-matrix px-6 py-16 sm:py-20 text-center border border-white/[0.1] relative overflow-hidden">
          {/* Ambient glow in center */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-64 w-96 rounded-full bg-[#6db89b]/10 blur-[90px]"
          />

          <div className="relative z-10 max-w-xl mx-auto">
            <h2 className="font-display text-[clamp(2rem,3.6vw,3.1rem)] font-medium tracking-[-0.025em] text-[#f8f9fa]">
              Read the contract first.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-[#b0b7c3]">
              The vault page shows the numbers, the block they came from, and the addresses behind
              them. Nothing on it is a projection.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <a
                href="#vaults"
                style={{ color: "#0b1310", backgroundColor: "#f8f9fa" }}
                className="rounded-full bg-[#f8f9fa] !text-[#0b1310] px-7 py-3 text-sm font-semibold hover:bg-white hover:scale-105 transition-all shadow-[0_0_24px_rgba(255,255,255,0.2)] cursor-pointer"
              >
                <span className="text-[#0b1310] font-semibold">Open the vault</span>
              </a>
              <a
                href="#security"
                className="rounded-full px-6 py-3 text-sm font-medium text-[#d1d5db] hover:text-[#f8f9fa] border border-white/[0.12] hover:border-white/[0.2] bg-white/[0.03] transition-colors"
              >
                Review security
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
