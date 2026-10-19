import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // AGENTS.md is the shared, hand-maintained agent rule file; stop `next dev`
  // from injecting its managed block into it.
  agentRules: false,
  // Clickjacking (TASK-031 security review): no page, sign-in included, may be framed.
  // Both headers, for browsers that predate CSP frame-ancestors.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
