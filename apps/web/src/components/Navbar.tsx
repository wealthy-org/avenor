"use client";

import Link from "next/link";
import { useState } from "react";
import { AvenorLogo } from "./AvenorLogo";

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0b1310]/85 backdrop-blur-md border-b border-white/[0.08]">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 h-18 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <Link
          href="/"
          aria-label="Avenor home"
          className="text-[#f8f9fa] hover:opacity-90 transition-opacity shrink-0"
        >
          <AvenorLogo />
        </Link>

        {/* Desktop Primary Nav */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-6 text-[13px] font-medium text-[#b0b7c3]"
        >
          <a
            href="/#vaults"
            className="hover:text-[#f8f9fa] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Vaults
          </a>
          <a
            href="/#how-it-works"
            className="hover:text-[#f8f9fa] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            How it works
          </a>
          <a
            href="/#security"
            className="hover:text-[#f8f9fa] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Security
          </a>
          <a
            href="/#contracts"
            className="hover:text-[#f8f9fa] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Contracts
          </a>
          <Link
            href="/portfolio"
            className="hover:text-[#f8f9fa] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Portfolio
          </Link>
          <Link
            href="/transparency"
            className="hover:text-[#f8f9fa] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Transparency
          </Link>
        </nav>

        {/* Actions Cluster */}
        <div className="flex items-center gap-3.5 shrink-0">
          <a
            href="https://x.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Avenor on X"
            className="hidden sm:inline-flex items-center gap-2 text-[12px] font-medium tracking-[0.04em] text-[#aeb8b2] hover:text-[#f8f9fa] transition-colors"
          >
            <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border border-white/[0.16] text-[10px] font-semibold leading-none">
              𝕏
            </span>
            <span>Follow</span>
          </a>

          <a
            href="/#vaults"
            className="inline-flex items-center justify-center rounded-full bg-[#f8f9fa] text-[#0b1310] px-5 py-2.5 text-xs font-semibold hover:bg-white hover:scale-105 transition-all shadow-[0_0_20px_rgba(255,255,255,0.15)] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Open app
          </a>

          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            className="md:hidden inline-flex items-center justify-center rounded-lg p-2 text-[#f8f9fa] hover:bg-white/[0.08]"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {mobileMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-white/[0.08] bg-[#0b1310] px-4 py-4 space-y-2">
          <a
            href="/#vaults"
            onClick={() => setMobileMenuOpen(false)}
            className="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-[#d1d5db] hover:bg-white/[0.06]"
          >
            Vaults
          </a>
          <a
            href="/#how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            className="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-[#d1d5db] hover:bg-white/[0.06]"
          >
            How it works
          </a>
          <a
            href="/#security"
            onClick={() => setMobileMenuOpen(false)}
            className="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-[#d1d5db] hover:bg-white/[0.06]"
          >
            Security
          </a>
          <a
            href="/#contracts"
            onClick={() => setMobileMenuOpen(false)}
            className="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-[#d1d5db] hover:bg-white/[0.06]"
          >
            Contracts
          </a>
          <Link
            href="/portfolio"
            onClick={() => setMobileMenuOpen(false)}
            className="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-[#d1d5db] hover:bg-white/[0.06]"
          >
            Portfolio
          </Link>
          <Link
            href="/transparency"
            onClick={() => setMobileMenuOpen(false)}
            className="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-[#d1d5db] hover:bg-white/[0.06]"
          >
            Transparency
          </Link>
        </div>
      )}
    </header>
  );
}
