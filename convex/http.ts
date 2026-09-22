import { httpRouter } from "convex/server"

import { exportFileName, resolveRequestedPath } from "../lib/core/publishing"
import { buildZip } from "../lib/core/zip"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { httpAction } from "./_generated/server"

/**
 * Two public endpoints, both on `{deployment}.convex.site` — a different origin
 * from the app, which is exactly what we want for hosting a child's project:
 * nothing it does can touch the studio.
 *
 *   GET /p/{projectId}/{path}   a published file
 *   GET /export?projectId=&secret=   the project as a zip
 */

const http = httpRouter()

/* ════════════════════════════════════════════════════════════════════════
   Published sites
   ════════════════════════════════════════════════════════════════════════ */

const servePublished = httpAction(async (ctx, request) => {
  const url = new URL(request.url)
  // /p/{projectId}/rest…
  const segments = url.pathname.split("/").filter(Boolean)
  if (segments.length < 2 || segments[0] !== "p") {
    return new Response("Not found", { status: 404 })
  }

  const projectId = segments[1]
  const path = resolveRequestedPath(url.pathname, projectId)
  if (!path) return new Response("Not found", { status: 404 })

  let file: {
    storageId: Id<"_storage">
    contentType: string
    size: number
  } | null
  try {
    file = await ctx.runQuery(internal.published.lookup, {
      projectId: projectId as Id<"projects">,
      path,
    })
  } catch {
    // A malformed id reaches the validator as an error; it is simply not found.
    return new Response("Not found", { status: 404 })
  }

  if (!file) return new Response("Not found", { status: 404 })

  const blob = await ctx.storage.get(file.storageId)
  if (!blob) return new Response("Not found", { status: 404 })

  return new Response(blob, {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      // Published files are immutable until the project is published again,
      // but a child republishing wants to see the change, so keep it short.
      "Cache-Control": "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  })
})

http.route({ pathPrefix: "/p/", method: "GET", handler: servePublished })

/* ════════════════════════════════════════════════════════════════════════
   Export
   ════════════════════════════════════════════════════════════════════════ */

const exportZip = httpAction(async (ctx, request) => {
  const url = new URL(request.url)
  const projectId = url.searchParams.get("projectId")
  const secret = url.searchParams.get("secret")

  if (!projectId || !secret) {
    return new Response("Missing projectId or secret", { status: 400 })
  }

  let result: {
    name: string
    files: { path: string; content: string }[]
  } | null
  try {
    result = await ctx.runQuery(internal.published.filesForExport, {
      projectId: projectId as Id<"projects">,
      secret,
    })
  } catch {
    return new Response("Not found", { status: 404 })
  }

  // Same answer for a wrong secret and a missing project: a 403 would confirm
  // the project exists.
  if (!result) return new Response("Not found", { status: 404 })
  if (result.files.length === 0) {
    return new Response("Nothing to export yet — build the project first.", {
      status: 409,
    })
  }

  const zip = buildZip(result.files)

  return new Response(zip, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${exportFileName(result.name)}"`,
      "Content-Length": String(zip.byteLength),
      "Cache-Control": "no-store",
    },
  })
})

http.route({ path: "/export", method: "GET", handler: exportZip })

export default http
