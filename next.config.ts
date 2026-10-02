import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server is opened at 127.0.0.1. Without this, Next blocks the JS chunks.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  transpilePackages: ["pdfjs-dist"],
};

export default nextConfig;
