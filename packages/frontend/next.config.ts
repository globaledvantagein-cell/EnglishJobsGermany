import type { NextConfig } from "next";
import { LEGACY_ADMIN_REDIRECTS } from "./src/components/admin/legacyRedirects";

// Where the Express backend lives. Server components fetch this directly
// (server-to-server); the browser hits the /api rewrite below.
const API_ORIGIN = process.env.API_ORIGIN || "http://localhost:3000";

const nextConfig: NextConfig = {
  // Standalone output for production deployment (pm2 / docker).
  output: "standalone",

  // Proxy all /api/* calls from the browser to the Express backend so the
  // existing relative-path fetches in utils/jobApi.ts keep working unchanged.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
    ];
  },

  // Legacy category slugs from the pre-28-category taxonomy. These are real
  // 308s issued before routing, so Google transfers the old URLs' ranking
  // signal to the current page instead of seeing a soft 404 (a redirect from
  // inside the page cannot set a status — app/loading.tsx has already started
  // the response stream). Mirrors LEGACY_CATEGORY_MAP in utils/categorize.ts.
  async redirects() {
    const legacyCategories: Record<string, string> = {
      software: "software-engineering",
      data: "data-analytics",
      product_tech: "product-management",
      product_nontech: "product-management",
      other_tech: "it-enterprise-systems",
      other_nontech: "other-general-business",
    };
    const categoryRedirects = Object.entries(legacyCategories).map(([from, to]) => ({
      source: `/category/${from}`,
      destination: `/category/${to}`,
      permanent: true,
    }));
    // Pre-/admin admin URLs. Not permanent: these are bookmarks, not indexed
    // pages, and a 307 keeps the door open to reusing a path later.
    const adminRedirects = LEGACY_ADMIN_REDIRECTS.map(([source, destination]) => ({
      source,
      destination,
      permanent: false,
    }));
    return [...categoryRedirects, ...adminRedirects];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ];
  },

  images: {
    // Company logos / avatars can come from anywhere; keep it permissive.
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
};

export default nextConfig;
