#!/usr/bin/env node

/**
 * Build the static site with the right backend baked in.
 *
 * `@convex-dev/static-hosting` sets `VITE_CONVEX_URL` when it runs the build,
 * because its examples are Vite apps. Next only inlines variables prefixed with
 * `NEXT_PUBLIC_`, so without this translation a production deploy would quietly
 * ship a bundle still pointing at the development deployment — the site would
 * load and every query would hit the wrong backend.
 *
 * The documented one-liner for this uses POSIX `${VAR:-default}` expansion, which
 * does not work in a Windows shell. A script works everywhere.
 */

import { spawnSync } from "node:child_process"

const convexUrl =
  process.env.VITE_CONVEX_URL ??
  process.env.CONVEX_URL ??
  process.env.NEXT_PUBLIC_CONVEX_URL

if (!convexUrl) {
  console.error(
    "No Convex URL available. Set NEXT_PUBLIC_CONVEX_URL, or let the static-hosting CLI provide VITE_CONVEX_URL via --build."
  )
  process.exit(1)
}

// The HTTP origin for published projects and zip exports lives on the same
// deployment, on .convex.site rather than .convex.cloud.
const siteUrl =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
  convexUrl.replace(/\.convex\.cloud$/, ".convex.site")

const label = (url) => url.replace(/^https?:\/\//, "").split(".")[0]
console.log(`Building against deployment "${label(convexUrl)}"`)

const result = spawnSync("next", ["build"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    NEXT_PUBLIC_CONVEX_URL: convexUrl,
    NEXT_PUBLIC_CONVEX_SITE_URL: siteUrl,
  },
})

process.exit(result.status ?? 1)
