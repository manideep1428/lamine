/**
 * Publish rules.
 *
 * E2B is metered compute, so a finished project never lives there. On publish we
 * read the files out, keep the ones that belong on a website, and store them in
 * Convex file storage served from `.convex.site` — a different origin from the
 * app, which is the point (PLAN.md §10).
 *
 * Pure module: decisions about paths and types, no IO.
 */

export const PUBLISH_LIMITS = {
  /** A kid's project is a handful of files. A hundred is already suspicious. */
  maxFiles: 100,
  /** Per file. Anything bigger is not hand-written code. */
  maxFileBytes: 512_000,
  maxTotalBytes: 4_000_000,
} as const

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  ttf: "font/ttf",
  woff: "font/woff",
  woff2: "font/woff2",
}

export function contentTypeFor(path: string): string {
  const ext = path.toLowerCase().split(".").pop() ?? ""
  return CONTENT_TYPES[ext] ?? "application/octet-stream"
}

/** Directories and files that are never part of the published site. */
const SKIP_PREFIX = ["tests/", "node_modules/", ".git/", ".e2b/"]
const SKIP_EXACT = new Set(["package-lock.json", ".DS_Store", "run_all.js"])

/**
 * Should this file be published?
 *
 * Tests are for the build, not for the visitor. Dotfiles are never intentional.
 * Unknown binary types are dropped rather than served with a guessed type.
 */
export function isPublishable(path: string): boolean {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("..") ||
    path.includes("\0")
  )
    return false
  const clean = path.replace(/^\.\//, "")
  if (clean.split("/").some((seg) => seg.startsWith("."))) return false
  if (SKIP_EXACT.has(clean)) return false
  if (SKIP_PREFIX.some((p) => clean.startsWith(p))) return false
  return contentTypeFor(clean) !== "application/octet-stream"
}

export interface PublishFile {
  path: string
  content: string
}

export interface PublishSelection {
  files: PublishFile[]
  skipped: string[]
  /** Kid-facing reason the publish cannot happen, or null. */
  problem: string | null
}

/**
 * Choose what to publish. Requires an index.html, because a static site without
 * one is a folder listing, and that is not what a child means by "share it".
 */
export function selectPublishFiles(
  all: readonly PublishFile[]
): PublishSelection {
  const files: PublishFile[] = []
  const skipped: string[] = []
  let total = 0

  for (const file of all) {
    const path = file.path.replace(/^\.\//, "")
    if (!isPublishable(path)) {
      skipped.push(path)
      continue
    }
    const size = byteLength(file.content)
    if (
      size > PUBLISH_LIMITS.maxFileBytes ||
      total + size > PUBLISH_LIMITS.maxTotalBytes
    ) {
      skipped.push(path)
      continue
    }
    if (files.length >= PUBLISH_LIMITS.maxFiles) {
      skipped.push(path)
      continue
    }
    total += size
    files.push({ path, content: file.content })
  }

  const hasIndex = files.some((f) => f.path === "index.html")
  return {
    files,
    skipped,
    problem: hasIndex
      ? null
      : files.length === 0
        ? "There's nothing to share yet — press GO to build it first."
        : "I couldn't find the index.html page, so there's nothing to open.",
  }
}

export function byteLength(text: string): number {
  // Convex and the browser both have TextEncoder; the fallback keeps this
  // module importable from anywhere without a polyfill.
  if (typeof TextEncoder !== "undefined")
    return new TextEncoder().encode(text).length
  return text.length
}

/** The public path a published file is served at, under the project prefix. */
export function publishedPath(projectId: string, path: string): string {
  return `/p/${projectId}/${path.replace(/^\/+/, "")}`
}

/** Turn a requested URL path back into a stored file path. */
export function resolveRequestedPath(
  pathname: string,
  projectId: string
): string | null {
  const prefix = `/p/${projectId}/`
  if (!pathname.startsWith(prefix)) return null
  let rest = pathname.slice(prefix.length)
  try {
    rest = decodeURIComponent(rest)
  } catch {
    return null
  }
  if (rest === "" || rest.endsWith("/")) rest += "index.html"
  if (!isPublishable(rest)) return null
  return rest
}

/** A friendly file name for the zip download. */
export function exportFileName(projectName: string): string {
  const safe =
    projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "my-project"
  return `${safe}.zip`
}
