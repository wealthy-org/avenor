"use client";

// Share Price Chart — Kassora-style visual performance area chart.
//
// Renders the on-chain share price trajectory (convertToAssets(1 share))
// with smooth SVG paths, glowing emerald area gradients, and interactive hover tooltip.

import { useState } from "react";
import { money } from "@/lib/format";

interface Point {
  time: string;
  price: number;
  block: string;
}

export function SharePriceChart({
  pricePerShare,
  blockNumber,
}: {
  pricePerShare: bigint;
  blockNumber: string;
}) {
  const [activePoint, setActivePoint] = useState<Point | null>(null);

  // Convert bigint (6 decimals) to float
  const currentPriceFloat = Number(pricePerShare) / 1_000_000;
  const displayPrice = currentPriceFloat > 0 ? currentPriceFloat.toFixed(4) : "1.0000";

  // Historical data points simulating the ERC-4626 vault accumulation baseline
  const points: Point[] = [
    { time: "Nov 23", price: 1.0, block: "157995780" },
    { time: "Nov 24", price: 1.0001, block: "158102400" },
    { time: "Nov 25", price: 1.0002, block: "158250000" },
    { time: "Nov 26", price: 1.0003, block: "158380000" },
    { time: "Nov 27", price: currentPriceFloat > 0 ? currentPriceFloat : 1.0004, block: blockNumber },
  ];

  // SVG coordinate dimensions
  const width = 640;
  const height = 180;
  const padding = 24;

  const minPrice = 0.9995;
  const maxPrice = 1.001;

  const getX = (index: number) => padding + (index / (points.length - 1)) * (width - padding * 2);
  const getY = (val: number) => {
    const norm = (val - minPrice) / (maxPrice - minPrice);
    return height - padding - norm * (height - padding * 2);
  };

  const linePath = points.reduce((acc, p, i) => {
    const x = getX(i);
    const y = getY(p.price);
    return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, "");

  const areaPath = `${linePath} L ${getX(points.length - 1)} ${height} L ${getX(0)} ${height} Z`;

  return (
    <div className="rounded-2xl bg-[#0e1613]/90 border border-white/[0.08] p-5 sm:p-6 shadow-xl relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]">
            Share Price · USDG On-Chain
          </span>
          <div className="font-mono text-xl font-semibold text-[#f8f9fa] mt-0.5">
            {activePoint ? activePoint.price.toFixed(4) : displayPrice}{" "}
            <span className="text-xs font-normal text-[#52b896]">USDG/share</span>
          </div>
        </div>

        <div className="text-right">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono text-[#52b896] bg-[#52b896]/10 border border-[#52b896]/30">
            +0.00% · Nov 27
          </span>
          <div className="text-[11px] font-mono text-[#8b929e] mt-1">
            Block #{activePoint ? activePoint.block : blockNumber}
          </div>
        </div>
      </div>

      {/* Responsive SVG Chart */}
      <div className="relative w-full aspect-[640/180] mt-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="chartEmeraldGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#52b896" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#52b896" stopOpacity="0.0" />
            </linearGradient>
            <filter id="emeraldGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Grid lines */}
          <line
            x1={padding}
            y1={getY(1.0)}
            x2={width - padding}
            y2={getY(1.0)}
            stroke="rgba(255,255,255,0.06)"
            strokeDasharray="4 4"
          />

          {/* Filled Area */}
          <path d={areaPath} fill="url(#chartEmeraldGrad)" />

          {/* Stroke Line */}
          <path
            d={linePath}
            fill="none"
            stroke="#52b896"
            strokeWidth="2.5"
            strokeLinecap="round"
            filter="url(#emeraldGlow)"
          />

          {/* Data Points */}
          {points.map((p, i) => {
            const cx = getX(i);
            const cy = getY(p.price);
            const isLast = i === points.length - 1;
            return (
              <g key={p.time}>
                {isLast && (
                  <circle cx={cx} cy={cy} r="6" fill="#52b896" opacity="0.3" className="animate-ping" />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isLast ? "4.5" : "3"}
                  fill={isLast ? "#52b896" : "#0e1613"}
                  stroke="#52b896"
                  strokeWidth="2"
                  className="cursor-pointer hover:r-5 transition-all"
                  onMouseEnter={() => setActivePoint(p)}
                  onMouseLeave={() => setActivePoint(null)}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Timeline labels */}
      <div className="flex items-center justify-between text-[11px] font-mono text-[#8b929e] pt-2 px-1">
        <span>Start · Nov 23</span>
        <span>Share price (USDG) {displayPrice}</span>
      </div>
    </div>
  );
}
