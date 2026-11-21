/** @type {import('next').NextConfig} */
const nextConfig = {
  // The SDK ships TypeScript source (no build step anywhere in this repo), so Next must compile it.
  transpilePackages: ["@avenor/sdk"],
};

export default nextConfig;
