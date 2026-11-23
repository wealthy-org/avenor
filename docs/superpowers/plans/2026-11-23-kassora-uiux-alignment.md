# Kassora 1:1 UI/UX Kit Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Avenor's web application (`apps/web`) into a pixel-perfect 1:1 visual and UX twin of `kassora.org` while maintaining strict on-chain data integrity, block provenance, integer BigInt math, and explicit zero loss budget (`max_loss = 0`).

**Architecture:** Integrate the compiled Kassora Tailwind CSS design system into `apps/web`, implement modular React components mirroring Kassora's UI hierarchy (Hero with 3D Monolith, Floating Metric Cards with dot-matrix accents, Strategy Marquee, Interactive Mandate Browser, How It Works, Institutional Security, and Footer), and maintain backwards-compatible support for existing contract interaction forms (deposit, withdraw, portfolio).

**Tech Stack:** Next.js 15.5.29, React 19.1.1, Viem 2.58.4, Tailwind CSS (Kassora design tokens), Google Fonts (`Plus Jakarta Sans`, `DM Sans`, `JetBrains Mono`).

## Global Constraints

- Never fabricate numbers: all metrics must preserve real on-chain block numbers and timestamps.
- Never claim "audited" for our 2026 adapter or staging setup; preserve Yearn V3 upstream audit scope disclosures.
- Retain pure integer BigInt math (6 decimals for USDG, 18 for shares) and explicit `max_loss = 0`.
- Maintain 100% pass on all 86 existing unit/regression tests in `apps/web/test/`.
- Ensure clean build on Next.js (`npm run build`) and verification via `python scripts/verify-all.py --no-bytecode`.

---

### Task 1: Design Tokens, Typography, and Asset Integration

**Files:**
- Create: `apps/web/app/kassora.css` (from `referensi/kassora-bundle.css`)
- Modify: `apps/web/app/globals.css`
- Ensure: `apps/web/public/hero-monolith.jpg` and `apps/web/public/favicon.png`

**Interfaces:**
- Consumes: `referensi/kassora-bundle.css`
- Produces: Global design system with classes `.bg-dot-matrix`, `.animate-monolith-sheen`, `.animate-marquee`, `.font-display`, `.font-sans`, `.font-mono`, and obsidian palette `#0b1310`.

- [ ] **Step 1: Copy and adapt Kassora bundle CSS into `apps/web/app/kassora.css`**
- [ ] **Step 2: Update `apps/web/app/globals.css` with Google Font imports and obsidian root tokens**
- [ ] **Step 3: Verify CSS compilation with Next.js build**

---

### Task 2: Brand Navigation and Monogram Component

**Files:**
- Create: `apps/web/src/components/Navbar.tsx`
- Modify: `apps/web/app/layout.tsx`

**Interfaces:**
- Consumes: Route navigation and scroll anchors
- Produces: `<Navbar />` with geometric Avenor monogram, links (`Vaults`, `How it works`, `Security`, `Contracts`, `Portfolio`), X follow link, and high-contrast "Open app" pill button.

- [ ] **Step 1: Implement `Navbar.tsx` matching Kassora's exact frosted navbar**
- [ ] **Step 2: Update `layout.tsx` with Google Fonts, metadata, and `<Navbar />`**
- [ ] **Step 3: Run quick test to verify layout renders without errors**

---

### Task 3: 3D Monolith Centerpiece and Hero Section

**Files:**
- Create: `apps/web/src/components/PrismHero.tsx`

**Interfaces:**
- Consumes: Mouse coordinates via `onPointerMove`, dynamic block number and RPC sync status
- Produces: `<PrismHero />` featuring interactive 3D perspective tilt, rainbow monolith sheen, headline "Capital, Working Smarter.", subtitle, dual rounded pill CTAs, and 4 floating metric cards.

- [ ] **Step 1: Implement `PrismHero.tsx` with physics spring loop and 4 metric cards**
- [ ] **Step 2: Test interactive rendering and responsive behavior**

---

### Task 4: Strategy Marquee and Interactive Mandate Browser

**Files:**
- Create: `apps/web/src/components/StrategyMarquee.tsx`
- Create: `apps/web/src/components/VaultMandates.tsx`

**Interfaces:**
- Consumes: Mandate data from Brief §5 and on-chain configuration
- Produces: Infinite animated ticker `<StrategyMarquee />` and split-view strategy browser `<VaultMandates />` ("One vault, one strategy.").

- [ ] **Step 1: Implement `StrategyMarquee.tsx`**
- [ ] **Step 2: Implement `VaultMandates.tsx` with 6 mandates, dynamic active indicators, and links to deposit/withdraw**

---

### Task 5: Institutional Security, How It Works, and Footer

**Files:**
- Create: `apps/web/src/components/HowItWorks.tsx`
- Create: `apps/web/src/components/SecuritySection.tsx`
- Create: `apps/web/src/components/Footer.tsx`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: Architecture and risk disclosure specifications
- Produces: Comprehensive landing page with seamless sections and institutional footer.

- [ ] **Step 1: Implement `HowItWorks.tsx` with 4-step ERC-4626 lifecycle**
- [ ] **Step 2: Implement `SecuritySection.tsx` highlighting Timelock 48h and zero loss budget**
- [ ] **Step 3: Implement `Footer.tsx` matching Kassora**
- [ ] **Step 4: Integrate all components into `apps/web/app/page.tsx`**

---

### Task 6: Verification, Test Suite Gate, and Deployment

**Files:**
- Run: `npm test --prefix apps/web`
- Run: `npm run build --prefix apps/web`
- Run: `python scripts/verify-all.py --no-bytecode`
- Git: Commit and push to `origin/main`

- [ ] **Step 1: Run web test suite to guarantee 86/86 pass**
- [ ] **Step 2: Run production Next.js build to confirm 0 compilation errors**
- [ ] **Step 3: Run repository verification script**
- [ ] **Step 4: Commit changes and push to GitHub for automated Vercel deployment**
