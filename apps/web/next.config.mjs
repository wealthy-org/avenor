import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The SDK ships TypeScript source (no build step anywhere in this repo), so Next must compile it.
  transpilePackages: ["@avenor/sdk"],
  typescript: {
    // Monorepo packages outside root are typechecked via verify-all.py
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    config.resolve.modules.push(path.resolve(__dirname, "node_modules"));
    config.resolve.alias = {
      ...config.resolve.alias,
      viem: path.resolve(__dirname, "node_modules/viem"),
    };
    return config;
  },
};

export default nextConfig;
