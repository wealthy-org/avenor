"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AvenorLogo } from "./AvenorLogo";
import { connectWallet, findInjectedProvider } from "@/lib/wallet";

export function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setDropdownOpen(false);
  }, [pathname]);

  // Read injected Web3 account
  useEffect(() => {
    if (typeof window === "undefined") return;
    const bag = (globalThis as { ethereum?: unknown }).ethereum;
    const provider = findInjectedProvider({ ethereum: bag });
    if (!provider) return;

    provider
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        if (Array.isArray(accounts) && accounts.length > 0 && typeof accounts[0] === "string") {
          setAccount(accounts[0]);
        }
      })
      .catch(() => {});

    const onAccountsChanged = (accounts: unknown) => {
      if (Array.isArray(accounts) && accounts.length > 0 && typeof accounts[0] === "string") {
        setAccount(accounts[0]);
      } else {
        setAccount(null);
      }
    };

    provider.on?.("accountsChanged", onAccountsChanged);
    return () => {
      provider.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, []);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    try {
      const bag = (globalThis as { ethereum?: unknown }).ethereum;
      const provider = findInjectedProvider({ ethereum: bag });
      const connected = await connectWallet(provider);
      setAccount(connected.account);
    } catch {
      // User rejection or missing provider handled safely
    } finally {
      setConnecting(false);
    }
  }, []);

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    setDropdownOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    } else {
      window.location.href = `/#${id}`;
    }
  };

  const isLinkActive = (path: string) => pathname === path;

  return (
    <header className="fixed top-3 sm:top-4 inset-x-0 z-40 px-3 sm:px-6">
      <div className="mx-auto max-w-[1240px]">
        <div className="iridescent-border rounded-2xl bg-[#0b1310]/90 backdrop-blur-xl px-4 sm:px-5 h-14 sm:h-15 flex items-center justify-between gap-4 shadow-xl shadow-black/30">
          
          {/* Brand Logo */}
          <Link
            href="/"
            onClick={(e) => {
              if (pathname === "/") {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
            }}
            aria-label="AVENOR home"
            className="hover:opacity-90 transition-opacity shrink-0 flex items-center"
          >
            <AvenorLogo />
          </Link>

          {/* Center Navigation Links — Streamlined & Proportional */}
          <nav
            aria-label="Primary navigation"
            className="hidden lg:flex items-center gap-1 xl:gap-2 text-[13px] font-medium"
          >
            <button
              type="button"
              onClick={() => scrollTo("vaults")}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                pathname === "/" ? "text-[#f8f9fa] hover:bg-white/[0.06]" : "text-[#b0b7c3] hover:text-[#f8f9fa] hover:bg-white/[0.04]"
              }`}
            >
              Vaults
            </button>

            <Link
              href="/portfolio"
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                isLinkActive("/portfolio")
                  ? "text-[#6db89b] bg-[#6db89b]/10 font-semibold"
                  : "text-[#b0b7c3] hover:text-[#f8f9fa] hover:bg-white/[0.04]"
              }`}
            >
              Portfolio
            </Link>

            <Link
              href="/transparency"
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                isLinkActive("/transparency")
                  ? "text-[#6db89b] bg-[#6db89b]/10 font-semibold"
                  : "text-[#b0b7c3] hover:text-[#f8f9fa] hover:bg-white/[0.04]"
              }`}
            >
              Transparency
            </Link>

            <Link
              href="/activity"
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                isLinkActive("/activity")
                  ? "text-[#6db89b] bg-[#6db89b]/10 font-semibold"
                  : "text-[#b0b7c3] hover:text-[#f8f9fa] hover:bg-white/[0.04]"
              }`}
            >
              Activity
            </Link>

            {/* Ecosystem / More Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  dropdownOpen || isLinkActive("/operator") || isLinkActive("/docs")
                    ? "text-[#f8f9fa] bg-white/[0.06]"
                    : "text-[#b0b7c3] hover:text-[#f8f9fa] hover:bg-white/[0.04]"
                }`}
                aria-expanded={dropdownOpen}
                aria-haspopup="true"
              >
                <span>Ecosystem</span>
                <svg
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {dropdownOpen && (
                <div className="absolute left-0 mt-2 w-56 rounded-xl bg-[#0e1814]/95 backdrop-blur-xl border border-white/[0.1] shadow-2xl shadow-black/60 py-2 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-[#6db89b]/80">
                    Governance & Protocol
                  </div>
                  <Link
                    href="/operator"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-[#d1d5db] hover:text-[#f8f9fa] hover:bg-white/[0.06] transition-colors"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#6db89b]" />
                    <span>Operator Console</span>
                  </Link>
                  <Link
                    href="/docs"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-[#d1d5db] hover:text-[#f8f9fa] hover:bg-white/[0.06] transition-colors"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#b0b7c3]" />
                    <span>Documentation & Specs</span>
                  </Link>

                  <div className="my-1.5 border-t border-white/[0.08]" />

                  <div className="px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-[#a3abb8]/80">
                    Architecture
                  </div>
                  <button
                    type="button"
                    onClick={() => scrollTo("security")}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-[#d1d5db] hover:text-[#f8f9fa] hover:bg-white/[0.06] transition-colors cursor-pointer"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                    <span>Security & Invariants</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollTo("contracts")}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-[#d1d5db] hover:text-[#f8f9fa] hover:bg-white/[0.06] transition-colors cursor-pointer"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                    <span>Verified Contracts</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollTo("how-it-works")}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-[#d1d5db] hover:text-[#f8f9fa] hover:bg-white/[0.06] transition-colors cursor-pointer"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                    <span>How It Works</span>
                  </button>
                </div>
              )}
            </div>
          </nav>

          {/* Right Action Cluster — Socials, Network & Wallet */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Social Link: X (Twitter) */}
            <a
              href="https://x.com/avenor_fi"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="AVENOR on X (formerly Twitter)"
              className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-[#b0b7c3] hover:text-[#f8f9fa] hover:bg-white/[0.08] transition-colors"
              title="Follow @avenor_fi on X"
            >
              <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>

            {/* Network Indicator Badge */}
            <div className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] px-2.5 py-1 text-[11px] font-mono text-[#b0b7c3]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#6db89b] animate-pulse" />
              <span>Chain 46630</span>
            </div>

            {/* Wallet Connection */}
            {account !== null ? (
              <Link
                href="/portfolio"
                aria-label={`Wallet connected: ${account}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#14221c] border border-[#6db89b]/40 px-3 py-1.5 text-[12px] font-mono font-medium text-[#6db89b] hover:bg-[#1a2d25] transition-colors whitespace-nowrap shrink-0"
              >
                <span className="inline-block w-2 h-2 rounded-full bg-[#6db89b] animate-pulse" />
                <span>{`${account.slice(0, 6)}…${account.slice(-4)}`}</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                className="inline-flex items-center justify-center rounded-lg bg-[#f8f9fa] text-[#0b1310] hover:bg-white px-3.5 py-1.5 text-[12px] font-semibold transition-all shadow-sm hover:shadow-white/10 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                <span>{connecting ? "Connecting…" : "Connect wallet"}</span>
              </button>
            )}

            {/* Mobile Menu Toggle Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              className="lg:hidden inline-flex items-center justify-center rounded-lg p-2 text-[#f8f9fa] hover:bg-white/[0.08] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Drawer */}
        {mobileMenuOpen && (
          <div className="mt-2 rounded-2xl bg-[#0e1814]/98 backdrop-blur-2xl border border-white/[0.1] p-4 shadow-2xl space-y-3 z-50">
            {/* Primary Section */}
            <div className="space-y-1">
              <div className="px-3 py-1 text-[11px] font-mono uppercase tracking-wider text-[#6db89b]">
                Navigation
              </div>
              <button
                type="button"
                onClick={() => scrollTo("vaults")}
                className="block w-full text-left px-3 py-2 rounded-lg text-sm text-[#d1d5db] hover:bg-white/[0.06] hover:text-[#f8f9fa]"
              >
                Vaults
              </button>
              <Link
                href="/portfolio"
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full text-left px-3 py-2 rounded-lg text-sm text-[#d1d5db] hover:bg-white/[0.06] hover:text-[#f8f9fa]"
              >
                Portfolio
              </Link>
              <Link
                href="/transparency"
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full text-left px-3 py-2 rounded-lg text-sm text-[#d1d5db] hover:bg-white/[0.06] hover:text-[#f8f9fa]"
              >
                Transparency
              </Link>
              <Link
                href="/activity"
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full text-left px-3 py-2 rounded-lg text-sm text-[#d1d5db] hover:bg-white/[0.06] hover:text-[#f8f9fa]"
              >
                Activity
              </Link>
            </div>

            {/* Protocol & Docs Section */}
            <div className="pt-2 border-t border-white/[0.08] space-y-1">
              <div className="px-3 py-1 text-[11px] font-mono uppercase tracking-wider text-[#a3abb8]">
                Protocol & Resources
              </div>
              <Link
                href="/operator"
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full text-left px-3 py-2 rounded-lg text-sm text-[#d1d5db] hover:bg-white/[0.06] hover:text-[#f8f9fa]"
              >
                Operator Console
              </Link>
              <Link
                href="/docs"
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full text-left px-3 py-2 rounded-lg text-sm text-[#d1d5db] hover:bg-white/[0.06] hover:text-[#f8f9fa]"
              >
                Documentation
              </Link>
              <button
                type="button"
                onClick={() => scrollTo("security")}
                className="block w-full text-left px-3 py-2 rounded-lg text-sm text-[#d1d5db] hover:bg-white/[0.06] hover:text-[#f8f9fa]"
              >
                Security & Invariants
              </button>
              <button
                type="button"
                onClick={() => scrollTo("contracts")}
                className="block w-full text-left px-3 py-2 rounded-lg text-sm text-[#d1d5db] hover:bg-white/[0.06] hover:text-[#f8f9fa]"
              >
                Smart Contracts
              </button>
            </div>

            {/* Socials & Community */}
            <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between px-3 py-1 text-xs text-[#b0b7c3]">
              <a
                href="https://x.com/avenor_fi"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-[#f8f9fa]"
              >
                <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                <span>@avenor_fi</span>
              </a>
              <div className="font-mono text-[11px] text-[#6db89b]">Testnet 46630</div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
