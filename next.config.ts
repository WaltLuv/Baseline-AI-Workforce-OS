import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Everything here talks to local CLIs and local files. Keep it honest about that:
  // no image optimisation calls out, no telemetry-friendly rewrites.
  reactStrictMode: true,
  experimental: {
    // Chat streams are long-lived NDJSON responses from spawned CLIs.
    proxyTimeout: 1000 * 60 * 30,
  },
};

export default nextConfig;
