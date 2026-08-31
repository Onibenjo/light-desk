import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (Coolify deploy).
  output: "standalone",
};

export default nextConfig;
