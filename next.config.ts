import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    // Offline app: no image optimizer, no remote loaders.
    unoptimized: true,
  },
};

export default nextConfig;
