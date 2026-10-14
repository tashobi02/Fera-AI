import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // AGENTS.md is the shared, hand-maintained agent rule file; stop `next dev`
  // from injecting its managed block into it.
  agentRules: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
