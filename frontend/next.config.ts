import type { NextConfig } from "next";
import path from "node:path";

/**
 * The data API is the separate backend service (../backend). Unless the browser is told to
 * call it directly (NEXT_PUBLIC_API_BASE_URL), `/api/*` on this site is proxied to it, so
 * the page and its data share one origin and no CORS is needed.
 */
const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    if (process.env.NEXT_PUBLIC_API_BASE_URL) return [];
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
  },
  /*
   * The dev server is reached through the iocompute proxy, not localhost. Without this,
   * Next blocks its dev scripts for that host: the page renders but never hydrates, so
   * nothing interactive (pickers, theme, mill switch) responds.
   */
  allowedDevOrigins: ["coalminning.iocompute.ai", "*.iocompute.ai"],
  /* The default bottom-left badge sits on the sidebar's collapse button. */
  devIndicators: { position: "bottom-right" },
  /* This folder is the app root — stops Next guessing a parent folder from a stray lockfile. */
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
