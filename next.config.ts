import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const isTauri = process.env.NEXT_PUBLIC_TAURI === "true";

const nextConfig: NextConfig = {
  // Static export for Tauri 2 — no Node.js server at runtime
  output: "export",

  // Trailing slashes ensure /about → /about/index.html works in Tauri's webview
  trailingSlash: true,

  // No server-side image optimization in a static export
  images: {
    unoptimized: true,
  },

  // Strict mode for development quality
  reactStrictMode: true,

  // Disable powered-by header (not served but good hygiene)
  poweredByHeader: false,

  // YouTube thumbnail domains for next/image (even though unoptimized,
  // this documents allowed sources and is used if optimization is ever toggled)
  ...(isDev && {
    devIndicators: false,
  }),
};

export default nextConfig;
