import type { NextConfig } from "next"

/**
 * Static export, because the app is hosted on Convex static hosting
 * (`*.convex.site`), which serves files rather than running a Node server.
 *
 * Two consequences worth knowing:
 *
 *  · No server-rendered routes. The studio takes its project id from the query
 *    string instead of a dynamic path segment, since a dynamic segment cannot be
 *    exported without knowing every id at build time — and project ids are
 *    created by children at runtime.
 *  · `trailingSlash` makes every route a directory with an index.html, which is
 *    what a plain file host resolves cleanly.
 *
 * All the server-side work lives in Convex functions, not in Next, so nothing is
 * lost by exporting: the browser talks to Convex directly.
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
}

export default nextConfig
