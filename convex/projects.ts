import { v } from "convex/values"

import { NuggetSpecSchema } from "../lib/core/spec"
import { internal } from "./_generated/api"
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"

/**
 * Capability check. With no accounts, holding the secret *is* the permission —
 * so it has to actually be verified, not just carried around.
 */
async function assertAccess(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
  secret: string
): Promise<Doc<"projects">> {
  const project = await ctx.db.get(projectId)
  if (!project) throw new Error("That project doesn't exist.")
  if (project.secret !== secret)
    throw new Error("You don't have the key for that project.")
  return project
}

export const create = mutation({
  args: {
    name: v.string(),
    kind: v.union(v.literal("game"), v.literal("website"), v.literal("device")),
    ownerId: v.string(),
    secret: v.string(),
    workspace: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("projects", {
      name: args.name.slice(0, 80) || "My project",
      kind: args.kind,
      ownerId: args.ownerId.slice(0, 64),
      secret: args.secret.slice(0, 64),
      workspace: args.workspace,
      visibility: "private",
      updatedAt: Date.now(),
    })
  },
})

/**
 * Full project, gated by the secret.
 *
 * Returns a reason rather than throwing: a thrown query error crashes the studio
 * on render, and "you don't have the key for this" is an ordinary outcome worth
 * rendering properly — a kid on a second device hits it every time.
 */
export const get = query({
  args: { projectId: v.id("projects"), secret: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId)
    if (!project) return { ok: false as const, reason: "missing" as const }
    if (project.secret !== args.secret) {
      return { ok: false as const, reason: "denied" as const }
    }
    // Listed field by field rather than spread-minus-secret: a future field is
    // then private by default instead of leaking because someone forgot.
    return {
      ok: true as const,
      project: {
        _id: project._id,
        name: project.name,
        kind: project.kind,
        workspace: project.workspace,
        spec: project.spec,
        visibility: project.visibility,
        sandboxId: project.sandboxId,
        previewUrl: project.previewUrl,
        publishedUrl: project.publishedUrl,
        updatedAt: project.updatedAt,
      },
    }
  },
})

/** Listing for the home page. Cheap, and still keyed to this browser. */
export const listMine = query({
  args: { ownerId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .order("desc")
      .take(30)
    return rows.map((p) => ({
      _id: p._id,
      name: p.name,
      kind: p.kind,
      updatedAt: p.updatedAt,
      previewUrl: p.previewUrl,
      visibility: p.visibility,
    }))
  },
})

/**
 * Autosave. The client interprets blocks locally and sends both the workspace
 * and the spec; we re-validate the spec here because a client is not trusted to
 * respect the caps.
 */
export const saveWorkspace = mutation({
  args: {
    projectId: v.id("projects"),
    secret: v.string(),
    workspace: v.string(),
    spec: v.optional(v.any()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertAccess(ctx, args.projectId, args.secret)

    let spec: unknown = undefined
    if (args.spec !== undefined && args.spec !== null) {
      const parsed = NuggetSpecSchema.safeParse(args.spec)
      if (!parsed.success) throw new Error("That spec doesn't look right.")
      spec = parsed.data
    }

    await ctx.db.patch(args.projectId, {
      workspace: args.workspace,
      ...(spec !== undefined ? { spec } : {}),
      ...(args.name ? { name: args.name.slice(0, 80) } : {}),
      updatedAt: Date.now(),
    })
  },
})

export const rename = mutation({
  args: { projectId: v.id("projects"), secret: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    await assertAccess(ctx, args.projectId, args.secret)
    await ctx.db.patch(args.projectId, {
      name: args.name.slice(0, 80) || "My project",
      updatedAt: Date.now(),
    })
  },
})

export const remove = mutation({
  args: { projectId: v.id("projects"), secret: v.string() },
  handler: async (ctx, args) => {
    await assertAccess(ctx, args.projectId, args.secret)
    // Sessions, tasks, events and files are keyed by session and get cleaned up
    // with their session; deleting the project detaches them from the UI.
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect()
    for (const s of sessions) await ctx.db.delete(s._id)
    await ctx.db.delete(args.projectId)
  },
})

/* ════════════════════════════════════════════════════════════════════════
   Internal plumbing
   ════════════════════════════════════════════════════════════════════════ */

export const loadInternal = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.projectId)
  },
})

/** Capability check for callers that cannot use `assertAccess` (actions). */
export const checkSecret = internalQuery({
  args: { projectId: v.id("projects"), secret: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId)
    return Boolean(project && project.secret === args.secret)
  },
})

export const setPublished = internalMutation({
  args: {
    projectId: v.id("projects"),
    publishedUrl: v.optional(v.string()),
    visibility: v.union(
      v.literal("private"),
      v.literal("link"),
      v.literal("published")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      visibility: args.visibility,
      ...(args.publishedUrl
        ? { publishedUrl: args.publishedUrl, publishedAt: Date.now() }
        : { publishedUrl: undefined, publishedAt: undefined }),
      updatedAt: Date.now(),
    })
  },
})

/**
 * Wake a sleeping project.
 *
 * Paused sandboxes resume on demand, but the preview server inside one does not
 * survive a pause that dropped memory — so the studio calls this on load and
 * gets a fresh URL back, or null if the sandbox is genuinely gone.
 */
export const wake = action({
  args: { projectId: v.id("projects"), secret: v.string() },
  handler: async (ctx, args): Promise<string | null> => {
    const allowed = await ctx.runQuery(internal.projects.checkSecret, {
      projectId: args.projectId,
      secret: args.secret,
    })
    if (!allowed) throw new Error("You don't have the key for that project.")

    // A running build already owns the sandbox and will publish a preview URL
    // when it finishes. Two writers to `sandboxId` is a race worth not having.
    const live = await ctx.runQuery(internal.sessions.liveFor, {
      projectId: args.projectId,
    })
    if (live) return null

    // Crossing into the Node runtime, which is the one case where an action
    // calling an action is the right thing to do.
    return await ctx.runAction(internal.phases.preview.resume, {
      projectId: args.projectId,
    })
  },
})
