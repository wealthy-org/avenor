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
    subtitle: "48-hour minimum delay",
    description:
      "Administrative calls — role handoffs, fee updates, strategy additions — are queued behind a TimelockController with a 172800-second minimum delay before they can execute. The guardian holds an emergency brake only; it is a separate address and cannot propose through the timelock, so it cannot move funds.",
  },
  {
    index: "02",
    title: "Explicit Loss Budget",
    subtitle: "max_loss is never defaulted",
    description:
      "The SDK refuses to build a withdraw or redeem call without a max_loss argument. That matters because the contract defaults differ: redeem assumes 10000 bps and withdraw assumes 0, and either default decides on the depositor's behalf. A withdrawal that exceeds the stated budget reverts on chain instead of silently haircutting.",
  },
  {
    index: "03",
    title: "Untouched Yearn V3 Core",
    subtitle: "Upstream pin, adapters only",
    description:
      "The allocator core is upstream Yearn V3 with no local modification; a repository rule rejects any patch to that package. Everything this project adds lives in adapters, hooks and tests. The 2023 upstream audit covers the vendored core only — this deployment, its adapters and its configuration are not audited, and nothing here claims otherwise.",
  },
  {
    index: "04",
    title: "Integer Provenance",
    subtitle: "bigint, 6 decimals, named block",
    description:
      "Balances, debt and share price stay bigint end to end: 6 decimals for USDG, 18 for shares, never a float. Each figure on the vault page is printed with the block it was read at, and a section that failed to read says so instead of rendering zero.",
  },
];

export function SecuritySection() {
  const [selectedLayer, setSelectedLayer] = useState(0);

  return (
    <section
      id="security"
      className="bg-[#0b1310]/85 py-14 md:py-28 px-4 sm:px-6 relative overflow-hidden"
    >
      <div className="mx-auto max-w-[1200px]">
        {/* Section Header */}
        <div className="max-w-xl">
          <h2 className="font-display text-[clamp(2rem,3.6vw,3.1rem)] font-medium tracking-[-0.025em] text-[#f8f9fa]">
            Security, before yield.
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#9ca3af]">
            What the contracts enforce, and what this project does not claim. There is no audit badge
            on this page: the vendored Yearn V3 core carries a 2023 audit, the adapters and the
            configuration do not.
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
                          isSelected ? "text-[#6db89b]" : "text-[#a3abb8]"
                        }`}
                      >
                        {layer.index}
                      </span>
                      <span
                        className={`font-display text-lg font-medium ${
                          isSelected ? "text-[#f8f9fa]" : "text-[#a3abb8]"
                        }`}
                      >
                        {layer.title}
                      </span>
                    </div>
                    <span className="font-mono text-xs tracking-[0.08em] text-[#a3abb8] uppercase">
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

          {/* Right: 3D Isometric Levitating Plate Stack.
              The plates carry only their index. A title inside the rotated plate cannot be laid out
              without colliding with the plate behind it: the projection shrinks the vertical step
              between plates (42px x cos56) while it grows the axis-aligned box of the text
              (len x sin42). The selected layer's title is printed below the stack, unrotated. */}
          <div className="flex flex-col items-center justify-center gap-6 py-8">
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
                      className={`font-display text-3xl font-medium leading-none transition-opacity ${
                        isSelected ? "text-[#6db89b] opacity-100" : "text-[#4b5563] opacity-30"
                      }`}
                    >
                      {isSelected ? layer.index : ""}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`self-end h-2 w-2 rounded-full transition-colors ${
                        isSelected ? "bg-[#6db89b]" : "bg-white/20"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
            </div>
            <p className="max-w-xs text-center font-mono text-xs uppercase tracking-[0.14em] text-[#a3abb8]">
              <span className="text-[#6db89b]">{LAYERS[selectedLayer]!.index}</span>{" "}
              {LAYERS[selectedLayer]!.title}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
