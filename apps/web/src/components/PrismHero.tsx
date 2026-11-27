"use client";

import Link from "next/link";
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
  /** The chain this render talked to, e.g. "Robinhood Chain testnet · chain ID 46630". */
  chainLine: string;
  metrics: HeroMetric[];
}

export function PrismHero({ blockNumber, rpcReachable, chainLine, metrics }: PrismHeroProps) {
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
      className="relative bg-[#13201b]/50 min-h-[720px] sm:min-h-[860px] flex flex-col justify-between pt-24 sm:pt-32 pb-8 sm:pb-12 px-4 sm:px-6 overflow-hidden"
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
      <div className="relative z-10 mx-auto max-w-[900px] text-center pt-16 sm:pt-24 pb-16">
        <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border border-white/[0.1] bg-white/[0.04] backdrop-blur-md mb-6 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-[#52b896] animate-pulse" />
          <span className="font-mono text-xs tracking-wider uppercase text-[#a3abb8]">
            Robinhood Chain Testnet · Chain 46630
          </span>
        </div>

        <h1
          className="font-display text-[clamp(2.4rem,4.6vw,4.2rem)] font-medium leading-[1.06] tracking-[-0.035em] text-[#f8f9fa]"
          style={{ textWrap: "balance" }}
        >
          Managed yield,<br />
          <span className="bg-gradient-to-r from-[#6db89b] via-[#8ed1b7] to-[#7f9fd8] bg-clip-text text-transparent">
            readable on-chain.
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-[620px] text-[15px] sm:text-base leading-relaxed text-[#b0b7c3] font-normal">
          ERC-4626 allocator vaults for USDG, built on Yearn V3. Every figure is read from the node with its block number. No APY promises, no black boxes.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3.5">
          <Link
            href="/app"
            style={{ color: "#06130d", backgroundColor: "#52b896" }}
            className="group rounded-xl bg-[#52b896] !text-[#06130d] px-7 py-3.5 text-sm font-semibold hover:bg-[#63c7a5] transition-all transform hover:-translate-y-0.5 shadow-[0_0_25px_rgba(82,184,150,0.25)] whitespace-nowrap shrink-0 inline-flex items-center justify-center gap-2 cursor-pointer"
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
            href="#how-it-works"
            className="rounded-xl px-6 py-3.5 text-sm font-medium text-[#d1d5db] hover:text-[#f8f9fa] bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] hover:border-white/[0.2] transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            How it works
          </a>
        </div>
      </div>

      {/* Metric tiles — server-rendered from the pin read, not authored copy */}
      <div className="relative z-10 mx-auto w-full max-w-[1200px] space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4 px-1">
          <span className="text-[11px] font-mono uppercase tracking-wider text-[#a3abb8] flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${rpcReachable ? "bg-[#6db89b]" : "bg-[#e8c468]"}`} />
            {rpcReachable
              ? "Live On-Chain State"
              : `State retained from a capture at block ${blockNumber}: the node did not answer`}
          </span>
          <span className="text-[11px] font-mono text-[#6b7280]">
            {chainLine} · Block {blockNumber}
          </span>
        </div>
        <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {metrics.map((metric, index) => (
          <div
            key={metric.label}
            className="rounded-2xl bg-[#0f1713]/85 backdrop-blur-md border border-white/[0.08] hover:border-[#6db89b]/40 p-5 sm:p-6 flex flex-col justify-between min-h-[136px] sm:min-h-[160px] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.45)]"
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
            <div className="mt-4 sm:mt-6">
              <div className="font-display text-2xl sm:text-3xl font-medium tabular-nums text-[#f8f9fa] leading-tight break-words">
                {metric.value}
              </div>
              <div className="mt-1 text-xs text-[#9ca3af] leading-snug">{metric.label}</div>
              {metric.detail && (
                <div className="mt-0.5 text-[11px] text-[#6b7280] leading-snug break-words font-mono">
                  {metric.detail}
                </div>
              )}
            </div>
          </div>
        ))}
        </div>
      </div>
    </section>
  );
}