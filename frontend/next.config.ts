import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * The dev server is reached through the iocompute proxy, not localhost. Without this,
   * Next blocks its dev scripts for that host: the page renders but never hydrates, so
   * nothing interactive (pickers, theme, mill switch) responds.
   */
  allowedDevOrigins: ["coalminning.iocompute.ai", "*.iocompute.ai"],
  /* The default bottom-left badge sits on the sidebar's collapse button. */
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
