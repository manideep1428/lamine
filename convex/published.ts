import { v } from "convex/values"

import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server"

/**
 * The published snapshot.
 *
 * E2B is metered, ephemeral compute, so a finished project never lives there
 * (PLAN.md §10). Files are copied into Convex file storage and served by
 * `convex/http.ts` from `.convex.site` — permanent, fast, and on a different
 * origin from the app.
 *
 * Queries and mutations only. The copy itself is an action in `convex/publish.ts`
 * because reading the sandbox needs the Node runtime.
 */

/** What the HTTP route needs to serve one file. No secret: published is public. */
export const lookup = internalQuery({
  args: { projectId: v.id("projects"), path: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId)
    if (!project || project.visibility !== "published") return null

    const row = await ctx.db
      .query("published")
      .withIndex("by_project_path", (q) =>
        q.eq("projectId", args.projectId).eq("path", args.path)
      )
      .unique()

    if (!row) return null
    return {
      storageId: row.storageId,
      contentType: row.contentType,
      size: row.size,
    }
  },
})

/** Replace a project's published files in one transaction. */
export const replaceAll = internalMutation({
  args: {
    projectId: v.id("projects"),
    files: v.array(
      v.object({
        path: v.string(),
        storageId: v.id("_storage"),
        contentType: v.string(),
        size: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("published")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect()

    for (const row of existing) {
      await ctx.storage.delete(row.storageId)
      await ctx.db.delete(row._id)
    }

    for (const file of args.files) {
      await ctx.db.insert("published", { projectId: args.projectId, ...file })
    }
  },
})

/**
 * Take a published site down.
 *
 * Public and secret-gated: a grown-up who published by accident should be able
 * to undo it without help.
 */
export const unpublish = mutation({
  args: { projectId: v.id("projects"), secret: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId)
    if (!project) throw new Error("That project doesn't exist.")
    if (project.secret !== args.secret)
      throw new Error("You don't have the key for that project.")

    const rows = await ctx.db
      .query("published")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect()

    for (const row of rows) {
      await ctx.storage.delete(row.storageId)
      await ctx.db.delete(row._id)
    }

    await ctx.db.patch(args.projectId, {
      visibility: "private",
      publishedUrl: undefined,
      publishedAt: undefined,
      updatedAt: Date.now(),
    })
  },
})

/** What the studio shows on the Share panel. */
export const status = query({
  args: { projectId: v.id("projects"), secret: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId)
    if (!project || project.secret !== args.secret) return null

    const rows = await ctx.db
      .query("published")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(200)

    return {
      visibility: project.visibility,
      publishedUrl: project.publishedUrl ?? null,
      publishedAt: project.publishedAt ?? null,
      fileCount: rows.length,
    }
  },
})

/**
 * The files for an export, taken from the newest session's mirror.
 *
 * Deliberately not from the sandbox: a download should still work after the
 * sandbox has been reclaimed. The mirror caps each file at 60k, which is far
 * above anything hand-written for a kid's project.
 */
export const filesForExport = internalQuery({
  args: { projectId: v.id("projects"), secret: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId)
    if (!project || project.secret !== args.secret) return null

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(1)

    if (!sessions[0]) return { name: project.name, files: [] }

    const files = await ctx.db
      .query("files")
      .withIndex("by_session", (q) => q.eq("sessionId", sessions[0]._id))
      .collect()

    return {
      name: project.name,
      files: files
        .map((f) => ({ path: f.path, content: f.content }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    }
  },
})
