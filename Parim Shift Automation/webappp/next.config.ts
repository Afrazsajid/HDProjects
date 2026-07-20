import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
  typedRoutes: true,
  experimental: {
    typedEnv: true,
  },
};

export default nextConfig;
