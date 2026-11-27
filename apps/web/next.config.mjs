import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// No `env` block here on purpose. Pinning AVENOR_VAULTS / AVENOR_API_URL / NEXT_PUBLIC_RPC_URL in this
// file inlines them into both bundles, so a value written here wins over the environment and over
// .env.local. That is how a deployed API base and a recorded block number from an older capture ended up
// rendered on a page that never read them: the app was reading a remote service while the page claimed a
// local fork. Configuration now comes from the environment alone; when a variable is missing the app says
// so instead of falling back to someone else's server.

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
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self' https://* http://localhost:* http://127.0.0.1:*; img-src 'self' data: https:; frame-ancestors 'none';",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
