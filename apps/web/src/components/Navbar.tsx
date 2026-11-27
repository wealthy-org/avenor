"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AvenorLogo } from "./AvenorLogo";
import { connectWallet, findInjectedProvider } from "@/lib/wallet";

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

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
      // User rejection or missing provider handled without unhandled throw
    } finally {
      setConnecting(false);
    }
  }, []);

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
      <div className="mx-auto max-w-[1100px]">
        <div className="iridescent-border rounded-xl bg-[#0e1814]/85 backdrop-blur-md px-4 sm:px-5 h-14 flex items-center justify-between gap-4 sm:gap-6 shadow-lg shadow-black/25">
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
            className="hidden md:flex items-center gap-5 text-[13px] font-medium text-[#b0b7c3]"
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
            <Link
              href="/activity"
              className="hover:text-[#f8f9fa] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Activity
            </Link>
            <Link
              href="/operator"
              className="hover:text-[#f8f9fa] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Operator
            </Link>
            <Link
              href="/docs"
              className="hover:text-[#f8f9fa] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Docs
            </Link>
          </nav>

          {/* Right Action Cluster */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <a
              href="https://github.com/wealthy-org/avenor"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="AVENOR on GitHub"
              className="hidden lg:inline-flex items-center gap-1.5 text-[12px] font-medium tracking-[0.04em] text-[#aeb8b2] hover:text-[#f8f9fa] transition-colors"
            >
              <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span>GitHub</span>
            </a>

            <Link
              href="/vaults/0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0"
              className="hidden sm:inline-flex items-center justify-center rounded-lg border border-white/[0.14] px-3 py-1.5 text-[12px] font-medium text-[#f8f9fa] hover:bg-white/[0.08] transition-colors whitespace-nowrap shrink-0"
            >
              Open app
            </Link>

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
                style={{ color: "#0b1310", backgroundColor: "#f8f9fa" }}
                className="inline-flex items-center justify-center rounded-lg bg-[#f8f9fa] !text-[#0b1310] px-3.5 py-1.5 text-[12px] font-semibold hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                <span className="text-[#0b1310] font-semibold">
                  {connecting ? "Connecting…" : "Connect wallet"}
                </span>
              </button>
            )}

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
            <Link
              href="/activity"
              onClick={() => setMobileMenuOpen(false)}
              className="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-[#d1d5db] hover:bg-white/[0.06]"
            >
              Activity
            </Link>
            <Link
              href="/operator"
              onClick={() => setMobileMenuOpen(false)}
              className="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-[#d1d5db] hover:bg-white/[0.06]"
            >
              Operator
            </Link>
            <Link
              href="/docs"
              onClick={() => setMobileMenuOpen(false)}
              className="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-[#d1d5db] hover:bg-white/[0.06]"
            >
              Docs
            </Link>
            <Link
              href="/vaults/0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0"
              onClick={() => setMobileMenuOpen(false)}
              style={{ color: "#0b1310", backgroundColor: "#f8f9fa" }}
              className="block w-full text-center mt-2 rounded-lg bg-[#f8f9fa] !text-[#0b1310] py-2.5 text-xs font-semibold"
            >
              <span className="text-[#0b1310] font-semibold">Open app →</span>
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
