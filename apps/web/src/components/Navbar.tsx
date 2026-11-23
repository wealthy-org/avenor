"use client";

import { useState } from "react";
import { AvenorLogo } from "./AvenorLogo";

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    } else {
      window.location.href = `/#${id}`;
    }
  };

  return (
    <header className="fixed top-4 inset-x-0 z-40 px-4">
      <div className="mx-auto max-w-[1200px]">
        <div className="iridescent-border rounded-xl bg-[#0e1814]/85 backdrop-blur-md px-4 sm:px-5 h-14 flex items-center justify-between gap-8 shadow-lg shadow-black/25">
          {/* Brand Logo */}
          <a
            href="/"
            onClick={(e) => {
              if (typeof window !== "undefined" && window.location.pathname === "/") {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
            }}
            aria-label="AVENOR home"
            className="text-[#f8f9fa] hover:opacity-90 transition-opacity shrink-0 cursor-pointer"
          >
            <AvenorLogo />
          </a>

          {/* Center Navigation Links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-6 text-[13px] font-medium text-[#b0b7c3]"
          >
            <button
              type="button"
              onClick={() => scrollTo("vaults")}
              className="hover:text-[#f8f9fa] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Vaults
            </button>
            <button
              type="button"
              onClick={() => scrollTo("how-it-works")}
              className="hover:text-[#f8f9fa] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              How it works
            </button>
            <button
              type="button"
              onClick={() => scrollTo("security")}
              className="hover:text-[#f8f9fa] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Security
            </button>
            <button
              type="button"
              onClick={() => scrollTo("contracts")}
              className="hover:text-[#f8f9fa] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Contracts
            </button>
          </nav>

          {/* Right Action Cluster */}
          <div className="flex items-center gap-3 shrink-0">
            <a
              href="https://x.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="AVENOR on X"
              className="hidden sm:inline-flex items-center gap-2 text-[12px] font-medium tracking-[0.04em] text-[#aeb8b2] hover:text-[#f8f9fa] transition-colors"
            >
              <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border border-white/[0.16] text-[10px] font-semibold leading-none">
                𝕏
              </span>
              <span>Follow</span>
            </a>

            <a
              href="/#vaults"
              onClick={(e) => {
                if (typeof window !== "undefined" && window.location.pathname === "/") {
                  e.preventDefault();
                  scrollTo("vaults");
                }
              }}
              style={{ color: "#0b1310", backgroundColor: "#f8f9fa" }}
              className="hidden md:inline-flex items-center justify-center rounded-lg bg-[#f8f9fa] !text-[#0b1310] px-4 py-2 text-[13px] font-semibold hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span className="text-[#0b1310] font-semibold">Open app</span>
            </a>

            {/* Mobile Menu Toggle Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
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

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="mt-2 rounded-xl bg-[#0e1814]/95 backdrop-blur-md border border-white/[0.08] p-3 space-y-1 shadow-xl">
            <button
              type="button"
              onClick={() => scrollTo("vaults")}
              className="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-[#d1d5db] hover:bg-white/[0.06]"
            >
              Vaults
            </button>
            <button
              type="button"
              onClick={() => scrollTo("how-it-works")}
              className="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-[#d1d5db] hover:bg-white/[0.06]"
            >
              How it works
            </button>
            <button
              type="button"
              onClick={() => scrollTo("security")}
              className="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-[#d1d5db] hover:bg-white/[0.06]"
            >
              Security
            </button>
            <button
              type="button"
              onClick={() => scrollTo("contracts")}
              className="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-[#d1d5db] hover:bg-white/[0.06]"
            >
              Contracts
            </button>
            <a
              href="/#vaults"
              onClick={(e) => {
                if (typeof window !== "undefined" && window.location.pathname === "/") {
                  e.preventDefault();
                  scrollTo("vaults");
                }
              }}
              style={{ color: "#0b1310", backgroundColor: "#f8f9fa" }}
              className="block w-full text-center mt-2 rounded-lg bg-[#f8f9fa] !text-[#0b1310] py-2.5 text-xs font-semibold"
            >
              <span className="text-[#0b1310] font-semibold">Open app</span>
            </a>
          </div>
        )}
      </div>
    </header>
  );
}
