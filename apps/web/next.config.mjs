import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
const defaultApiUrl = process.env.AVENOR_API_URL || (vercelHost ? `https://${vercelHost}` : "https://avenor-kappa.vercel.app");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The SDK ships TypeScript source (no build step anywhere in this repo), so Next must compile it.
  transpilePackages: ["@avenor/sdk"],
  typescript: {
    // Monorepo packages outside root are typechecked via verify-all.py
    ignoreBuildErrors: true,
  },
  env: {
    AVENOR_VAULTS: process.env.AVENOR_VAULTS || JSON.stringify([
      {
        address: "0x5aeBcE3956FeD4542EDBe75d420497378E3B18CA",
        label: "Avenor USDG Managed Vault (Staging)",
        phase: "research",
        mandate: "Staging fork — semua angka langsung dari Robinhood Chain mainnet pin blok 118337511. Bukan untuk deposit publik.",
      },
    ]),
    AVENOR_API_URL: defaultApiUrl,
    NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL || "https://robinhood.api.onfinality.io/public",
  },
  webpack: (config) => {
    config.resolve.modules.push(path.resolve(__dirname, "node_modules"));
    return config;
  },
};

export default nextConfig;
