"use client";

import { useState } from "react";

interface SecurityLayer {
  index: string;
  title: string;
  subtitle: string;
  description: string;
}

const LAYERS: SecurityLayer[] = [
  {
    index: "01",
    title: "Dual-Speed Timelock",
    subtitle: "≥ 48-Hour Execution Delay",
    description:
      "All administrative changes, role handoffs, fee updates, and strategy additions are queued behind an OpenZeppelin TimelockController with a mandatory 48-hour minimum delay before execution. The Guardian holds emergency pause capability only and cannot alter allocations.",
  },
  {
    index: "02",
    title: "Explicit Zero-Loss Exit",
    subtitle: "max_loss = 0 Enforcement",
    description:
      "Unlike standard implementations that risk hidden slippage or defaulted debt haircuts, Avenor's SDK and smart contract interfaces strictly require explicit max_loss = 0 on redemptions and withdrawals. Unsolicited losses revert immediately on-chain.",
  },
  {
    index: "03",
    title: "Immutable Yearn V3 Core",
    subtitle: "Pinned ERC-4626 Upstream",
    description:
      "The vault allocator core uses upstream Yearn V3 (API 3.1.1) byte-for-byte with zero custom core modifications. All strategy adapters operate as isolated peripheral contracts, ensuring the fundamental accounting remains mathematically proven and audited.",
  },
  {
    index: "04",
    title: "On-Chain Integer Provenance",
    subtitle: "Pure BigInt Math · No Floats",
    description:
      "Every financial metric, debt allocation, and share price calculation is represented in pure fixed-point BigInt integers (6 decimals for USDG, 18 decimals for shares). All UI data includes verifiable block numbers and UTC timestamps directly from the chain.",
  },
];

export function SecuritySection() {
  const [selectedLayer, setSelectedLayer] = useState(0);

  return (
    <section
      id="security"
      className="bg-[#0b1310]/85 py-20 md:py-28 px-4 sm:px-6 relative overflow-hidden"
    >
      <div className="mx-auto max-w-[1200px]">
        {/* Section Header */}
        <div className="max-w-xl">
          <h2 className="font-display text-[clamp(2rem,3.6vw,3.1rem)] font-medium tracking-[-0.025em] text-[#f8f9fa]">
            Security, before yield.
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#9ca3af]">
            Examine our custody architecture, programmatic risk controls, and
            governance timelock prerequisites prior to capital deployment.
          </p>
        </div>

        {/* 2-Column Layer Browser */}
        <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: Tab list */}
          <div
            role="tablist"
            aria-label="Security architecture layers"
            className="divide-y divide-white/[0.08] overflow-hidden"
          >
            {LAYERS.map((layer, idx) => {
              const isSelected = idx === selectedLayer;
              return (
                <button
                  key={layer.index}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setSelectedLayer(idx)}
                  className={`w-full min-w-0 text-left py-5 transition-all cursor-pointer ${
                    isSelected ? "border-t-2 border-t-[#6db89b]" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div className="flex items-baseline gap-4">
                      <span
                        className={`font-mono text-xs ${
                          isSelected ? "text-[#6db89b]" : "text-[#6b7280]"
                        }`}
                      >
                        {layer.index}
                      </span>
                      <span
                        className={`font-display text-lg font-medium ${
                          isSelected ? "text-[#f8f9fa]" : "text-[#8b929e]"
                        }`}
                      >
                        {layer.title}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] tracking-[0.08em] text-[#6b7280] uppercase">
                      {layer.subtitle}
                    </span>
                  </div>

                  {isSelected && (
                    <p className="mt-3 pl-8 text-sm leading-relaxed text-[#b0b7c3]">
                      {layer.description}
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right: 3D Isometric Levitating Plate Stack */}
          <div className="flex items-center justify-center py-8">
            <div className="scale-75 sm:scale-100 origin-center">
            <div className="animate-plate-levitate relative w-72 h-80 flex flex-col items-center justify-center">
              {LAYERS.map((layer, idx) => {
                const isSelected = idx === selectedLayer;
                const offset = idx * 42;
                return (
                  <button
                    key={layer.index}
                    type="button"
                    onClick={() => setSelectedLayer(idx)}
                    aria-label={`Select security layer ${layer.index} ${layer.title}`}
                    style={{
                      transform: `translateY(${offset - 64}px) rotateX(56deg) rotateZ(-42deg)`,
                      zIndex: LAYERS.length - idx,
                    }}
                    className={`absolute w-52 h-52 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col justify-between p-4 text-left ${
                      isSelected
                        ? "bg-[#14261f]/95 border-[#6db89b] shadow-[0_0_36px_rgba(109,184,155,0.25)]"
                        : "bg-[#101b16]/85 border-white/[0.12] hover:border-white/[0.25]"
                    }`}
                  >
                    <span
                      className={`font-mono text-[10px] tracking-[0.12em] uppercase ${
                        isSelected ? "text-[#6db89b]" : "text-[#8b929e]"
                      }`}
                    >
                      {layer.title}
                    </span>
                    <span
                      className={`self-end font-display text-2xl font-medium ${
                        isSelected ? "text-[#6db89b]" : "text-[#4b5563]"
                      }`}
                    >
                      {layer.index}
                    </span>
                  </button>
                );
              })}
            </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
