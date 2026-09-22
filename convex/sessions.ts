import { v } from "convex/values"

import { NuggetSpecSchema } from "../lib/core/spec"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"

/** Same capability check as projects.ts. Duplicated deliberately — a shared
 *  helper that silently stops being called is worse than two explicit ones. */
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

const LIVE_STATES = new Set(["planning", "executing", "testing", "previewing"])

/* ════════════════════════════════════════════════════════════════════════
   Starting and stopping a build
   ════════════════════════════════════════════════════════════════════════ */

export const start = mutation({
  args: { projectId: v.id("projects"), secret: v.string(), spec: v.any() },
  handler: async (ctx, args) => {
    const project = await assertAccess(ctx, args.projectId, args.secret)

    const parsed = NuggetSpecSchema.safeParse(args.spec)
    if (!parsed.success) {
      throw new Error(
        "Add a Goal block and at least one 'It must…' block first."
      )
    }

    // One build at a time per project, or two agent loops fight over the files.
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(1)
    if (existing[0] && LIVE_STATES.has(existing[0].state)) {
      return existing[0]._id
    }

    const sessionId = await ctx.db.insert("sessions", {
      projectId: args.projectId,
      state: "planning",
      spec: parsed.data,
      framework: parsed.data.framework,
      turnsUsed: 0,
      startedAt: Date.now(),
    })

    await ctx.db.insert("events", {
      sessionId,
      kind: "narrator",
      who: "codey",
      mood: "excited",
      text: `Reading your blocks for "${project.name}"…`,
    })

    await ctx.scheduler.runAfter(0, internal.phases.plan.run, { sessionId })
    return sessionId
  },
})

export const stop = mutation({
  args: {
    projectId: v.id("projects"),
    secret: v.string(),
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    await assertAccess(ctx, args.projectId, args.secret)
    const session = await ctx.db.get(args.sessionId)
    if (!session || !LIVE_STATES.has(session.state)) return

    await ctx.db.patch(args.sessionId, {
      state: "stopped",
      finishedAt: Date.now(),
    })
    await ctx.db.insert("events", {
      sessionId: args.sessionId,
      kind: "narrator",
      who: "codey",
      mood: "encouraging",
      text: "Stopped. Everything I finished is still there — press GO when you're ready.",
    })
  },
})

/* ════════════════════════════════════════════════════════════════════════
   Reads for the studio — these drive the live UI via subscriptions
   ════════════════════════════════════════════════════════════════════════ */

/** The newest session for a project, or null. */
export const latest = query({
  args: { projectId: v.id("projects"), secret: v.string() },
  handler: async (ctx, args) => {
    await assertAccess(ctx, args.projectId, args.secret)
    const rows = await ctx.db
      .query("sessions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(1)
    return rows[0] ?? null
  },
})

export const tasksFor = query({
  args: { sessionId: v.union(v.id("sessions"), v.null()) },
  handler: async (ctx, args) => {
    if (!args.sessionId) return []
    const rows = await ctx.db
      .query("tasks")
      .withIndex("by_session_order", (q) => q.eq("sessionId", args.sessionId!))
      .collect()
    return rows.map((t) => ({
      taskId: t.taskId,
      name: t.name,
      agentName: t.agentName,
      role: t.role,
      dependsOn: t.dependsOn,
      status: t.status,
      verdict: t.verdict,
      summary: t.summary,
      order: t.order,
    }))
  },
})

export const eventsFor = query({
  args: {
    sessionId: v.union(v.id("sessions"), v.null()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!args.sessionId) return []
    const rows = await ctx.db
      .query("events")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId!))
      .order("desc")
      .take(Math.min(args.limit ?? 120, 300))
    return rows.reverse()
  },
})

export const filesFor = query({
  args: { sessionId: v.union(v.id("sessions"), v.null()) },
  handler: async (ctx, args) => {
    if (!args.sessionId) return []
    const rows = await ctx.db
      .query("files")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId!))
      .collect()
    return rows
      .map((f) => ({ path: f.path, content: f.content, byTask: f.byTask }))
      .sort((a, b) => a.path.localeCompare(b.path))
  },
})

/* ════════════════════════════════════════════════════════════════════════
   Internal plumbing used by the phase actions
   ════════════════════════════════════════════════════════════════════════ */

export const load = internalQuery({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId)
    if (!session) return null
    const project = await ctx.db.get(session.projectId)
    return { session, project }
  },
})

/**
 * Just the state.
 *
 * The agent loop reads this between turns so a child pressing STOP is obeyed
 * within one turn instead of at the end of a ten-turn chunk. Deliberately not
 * `load`, which also fetches the project.
 */
export const stateOf = internalQuery({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId)
    return session?.state ?? null
  },
})

/** Is a build running for this project right now? */
export const liveFor = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("sessions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(1)
    return Boolean(rows[0] && LIVE_STATES.has(rows[0].state))
  },
})

export const patchState = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    state: v.string(),
    error: v.optional(v.string()),
    explanation: v.optional(v.string()),
    framework: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const done = ["done", "failed", "stopped"].includes(args.state)
    await ctx.db.patch(args.sessionId, {
      state: args.state,
      ...(args.error ? { error: args.error } : {}),
      ...(args.explanation ? { explanation: args.explanation } : {}),
      ...(args.framework ? { framework: args.framework } : {}),
      ...(done ? { finishedAt: Date.now() } : {}),
    })
  },
})

export const addEvent = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    kind: v.string(),
    text: v.string(),
    who: v.optional(v.string()),
    mood: v.optional(v.string()),
    taskId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("events", args)
  },
})

/**
 * Insert a batch in one transaction. A turn of the agent loop produces several
 * events at once; one mutation per event would pay the round trip each time.
 */
export const addEvents = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    events: v.array(
      v.object({
        kind: v.string(),
        text: v.string(),
        who: v.optional(v.string()),
        mood: v.optional(v.string()),
        taskId: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const event of args.events) {
      await ctx.db.insert("events", { ...event, sessionId: args.sessionId })
    }
  },
})

/** Store what the test phase found, so the UI and the gate agree. */
export const recordTests = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    testsPassed: v.number(),
    testsTotal: v.number(),
    fixAttempts: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, {
      testsPassed: args.testsPassed,
      testsTotal: args.testsTotal,
      ...(args.fixAttempts !== undefined
        ? { fixAttempts: args.fixAttempts }
        : {}),
    })
  },
})

/** The reviewer's verdict, lifted off the task so the UI need not hunt for it. */
export const recordReview = internalMutation({
  args: { sessionId: v.id("sessions"), verdict: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { reviewVerdict: args.verdict })
  },
})

export const bumpTurns = internalMutation({
  args: { sessionId: v.id("sessions"), by: v.number() },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId)
    if (!session) return
    await ctx.db.patch(args.sessionId, {
      turnsUsed: session.turnsUsed + args.by,
    })
  },
})

export const setSandbox = internalMutation({
  args: {
    projectId: v.id("projects"),
    sandboxId: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.projectId, {
      ...(args.sandboxId ? { sandboxId: args.sandboxId } : {}),
      ...(args.previewUrl ? { previewUrl: args.previewUrl } : {}),
      updatedAt: Date.now(),
    })
  },
})
