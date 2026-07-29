import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@sandeul/contracts", "@sandeul/ui"],
  async rewrites() {
    const api = process.env.API_INTERNAL_URL ?? "http://api:4000";
    return [
      {
        source: "/api/:path*",
        destination: `${api}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
