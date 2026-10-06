import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import path from "node:path";

/**
 * The data API is the separate backend service (../backend).
 *
 *   next build → a STATIC site in `out/` (output: "export") — the hosting serves plain files
 *                with nginx, no Node server. The browser calls the backend directly at
 *                NEXT_PUBLIC_API_BASE_URL (inlined at build time); the backend must list this
 *                site in CORS_ORIGINS. Each page is `<route>/index.html` (trailingSlash), so any
 *                static host serves it without extra rules.
 *   next dev   → `/api/*` is proxied to BACKEND_URL (static export cannot proxy), so local
 *                work needs no CORS.
 */
const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/+$/, "");

const shared: NextConfig = {
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

export default function config(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      ...shared,
      async rewrites() {
        if (process.env.NEXT_PUBLIC_API_BASE_URL) return [];
        return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
      },
    };
  }
  if (!process.env.NEXT_PUBLIC_API_BASE_URL) {
    console.warn(
      "\n⚠ NEXT_PUBLIC_API_BASE_URL is not set: the static site will call /api on its own host, " +
        "where there is no API. Set it to the backend URL (see .env.production).\n",
    );
  }
  return { ...shared, output: "export", trailingSlash: true };
}
