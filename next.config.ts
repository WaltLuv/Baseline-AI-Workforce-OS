import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Everything here talks to local CLIs and local files. Keep it honest about that:
  // no image optimisation calls out, no telemetry-friendly rewrites.
  reactStrictMode: true,
  turbopack: {
    // This app is its own root. Without this, a lockfile in a parent directory
    // (the monorepo it lives in, or a stray one in the user's home) wins the
    // inference and Turbopack resolves modules from the wrong place.
    root: path.resolve(import.meta.dirname),
  },
  experimental: {
    // Chat streams are long-lived NDJSON responses from spawned CLIs.
    proxyTimeout: 1000 * 60 * 30,
  },
};

export default nextConfig;
