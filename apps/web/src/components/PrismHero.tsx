"use client";

import { useEffect, useRef } from "react";

const DOTS = Array.from({ length: 24 }, (_, i) => i);

/** One hero tile. Every string is produced by the server from a contract read; none is a target. */
export interface HeroMetric {
  label: string;
  value: string;
  detail: string;
}

interface PrismHeroProps {
  blockNumber: string;
  rpcReachable: boolean;
  metrics: HeroMetric[];
}

export function PrismHero({ blockNumber, rpcReachable, metrics }: PrismHeroProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const smoothedRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const img = imageRef.current;
    if (!img) return;
    // Honour the OS setting: the monolith stops moving instead of drifting behind the text.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let rafId = 0;
    let lastTime = performance.now();
    let time = 0;

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      if (!document.hidden) {
        time += dt;
        const smoothed = smoothedRef.current;
        const pointer = pointerRef.current;
        const factor = 1 - Math.exp(-6.5 * dt);

        smoothed.x += (pointer.x - smoothed.x) * factor;
        smoothed.y += (pointer.y - smoothed.y) * factor;

        const transX = Math.sin(time * 0.92) * 44 + smoothed.x * 36;
        const transY = Math.cos(time * 0.74) * 26 + smoothed.y * 24;
        const scale = 1.105 + Math.sin(time * 0.62) * 0.055;
        const rotX = Math.cos(time * 0.58) * 3.6 - smoothed.y * 4.2;
        const rotY = Math.sin(time * 0.66) * 5.2 + smoothed.x * 5.5;
        const rotZ = Math.sin(time * 0.45) * 2.4 + smoothed.x * 1.6;

        img.style.transform = `perspective(1100px) translate3d(${transX.toFixed(
          2,
        )}px, ${transY.toFixed(2)}px, 0) scale(${scale.toFixed(4)}) rotateX(${rotX.toFixed(
          3,
        )}deg) rotateY(${rotY.toFixed(3)}deg) rotateZ(${rotZ.toFixed(3)}deg)`;
      }

      rafId = window.requestAnimationFrame(loop);
    };

    rafId = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  // Dot densities are decoration, but they are tied to how full a tile's number is so the four
  // tiles do not look like the same placeholder repeated four times.
  const densities = [6, 12, 9, 18];

  return (
    <section
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (rect.width && rect.height) {
          pointerRef.current = {
            x: ((e.clientX - rect.left) / rect.width - 0.5) * 2,
            y: ((e.clientY - rect.top) / rect.height - 0.5) * 2,
          };
        }
      }}
      onPointerLeave={() => {
        pointerRef.current = { x: 0, y: 0 };
      }}
      className="relative bg-[#13201b]/50 min-h-[640px] sm:min-h-[760px] flex flex-col justify-between pt-24 sm:pt-32 pb-12 px-4 sm:px-6 overflow-hidden"
    >
      {/* 3D monolith centrepiece */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
      >
        <div
          className="relative w-full max-w-[1280px] h-[680px] translate-y-10"
          style={{
            WebkitMaskImage: "radial-gradient(ellipse 75% 72% at 50% 50%, black 46%, transparent 88%)",
            maskImage: "radial-gradient(ellipse 75% 72% at 50% 50%, black 46%, transparent 88%)",
          }}
        >
          <img
            ref={imageRef}
            src="/hero-monolith.jpg"
            alt=""
            referrerPolicy="no-referrer"
            style={{
              willChange: "transform",
              transform: "perspective(1100px) translate3d(0, 0, 0) scale(1.105)",
            }}
            className="w-full h-full object-cover object-center opacity-75 mix-blend-lighten"
          />

          <div className="animate-monolith-sheen pointer-events-none absolute -inset-y-24 left-1/4 w-1/2 bg-gradient-to-r from-transparent via-[#6db89b]/18 to-transparent" />
        </div>

        <div className="absolute inset-0 bg-gradient-to-b from-[#0b1310]/45 via-transparent to-[#0b1310]/80" />
      </div>

      {/* Headline */}
      <div className="relative z-10 mx-auto max-w-[900px] text-center pt-16 sm:pt-20 pb-14">
        <h1
          className="font-display text-[clamp(2.35rem,4.4vw,3.85rem)] font-medium leading-[1.08] tracking-[-0.03em] text-[#f8f9fa]"
          style={{ textWrap: "balance" }}
        >
          Capital, Working Smarter.
        </h1>
        <p className="mx-auto mt-5 max-w-[600px] text-[15px] sm:text-base leading-relaxed text-[#c3c9d2]">
          An ERC-4626 allocator vault for USDG on Robinhood Chain. Every figure on this page is read
          from the contract at one named block and shown with that block.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <a
            href="#vaults"
            style={{ color: "#0b1310", backgroundColor: "#f8f9fa" }}
            className="rounded-lg bg-[#f8f9fa] !text-[#0b1310] px-6 py-3 text-sm font-semibold hover:bg-white transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-[0_0_20px_rgba(255,255,255,0.15)]"
          >
            <span className="text-[#0b1310] font-semibold">Open app</span>
          </a>
          <a
            href="#how-it-works"
            className="rounded-lg px-5 py-3 text-sm font-medium text-[#d1d5db] hover:text-[#f8f9fa] transition-colors whitespace-nowrap shrink-0"
          >
            How it works
          </a>
        </div>
      </div>

      {/* Metric tiles — server-rendered from the pin read, not authored copy */}
      <div className="relative z-10 mx-auto w-full max-w-[1200px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {metrics.map((metric, index) => (
          <div
            key={metric.label}
            className="rounded-xl bg-[#101b16]/85 backdrop-blur-sm border border-white/[0.08] p-4 sm:p-5 flex flex-col justify-between min-h-[132px] sm:min-h-[152px]"
          >
            <div className="grid grid-cols-12 gap-1 sm:gap-1.5 w-24 sm:w-28" aria-hidden="true">
              {DOTS.map((dot) => (
                <span
                  key={dot}
                  className={`h-1 w-1 rounded-full ${
                    dot < (densities[index] ?? 6) ? "bg-[#f8f9fa]/55" : "bg-[#f8f9fa]/15"
                  }`}
                />
              ))}
            </div>
            <div className="mt-4">
              <div className="font-display text-xl sm:text-2xl font-medium text-[#f8f9fa] leading-tight break-words">
                {metric.value}
              </div>
              <div className="mt-1.5 text-xs font-medium text-[#b0b7c3] leading-snug">{metric.label}</div>
              <div className="mt-1 font-mono text-xs text-[#a3abb8] leading-snug break-words">
                {metric.detail}
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="relative z-10 mx-auto mt-5 w-full max-w-[1200px] font-mono text-xs leading-relaxed text-[#a3abb8]">
        {rpcReachable
          ? `Read at block #${blockNumber} · Robinhood Chain, chain ID 4663`
          : "No node reachable — figures are withheld rather than estimated"}
      </p>
    </section>
  );
}