import Link from "next/link";

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
              <Link
                href="/app"
                style={{ color: "#06130d", backgroundColor: "#52b896" }}
                className="group rounded-xl bg-[#52b896] !text-[#06130d] px-7 py-3.5 text-sm font-semibold hover:bg-[#63c7a5] transition-all transform hover:-translate-y-0.5 shadow-[0_0_25px_rgba(82,184,150,0.25)] cursor-pointer inline-flex items-center justify-center gap-2"
              >
                <span>Open app</span>
                <svg
                  className="w-4 h-4 transition-transform group-hover:translate-x-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
              <a
                href="#security"
                className="rounded-xl px-6 py-3.5 text-sm font-medium text-[#d1d5db] hover:text-[#f8f9fa] border border-white/[0.12] hover:border-white/[0.2] bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
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
