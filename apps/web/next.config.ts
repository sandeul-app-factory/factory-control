import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  transpilePackages: ["@sandeul/contracts", "@sandeul/ui"],
  async rewrites() {
    const api = process.env.API_INTERNAL_URL;
    return api
      ? [
          {
            source: "/api/:path*",
            destination: `${api}/api/:path*`,
          },
        ]
      : [];
  },
};

export default nextConfig;
