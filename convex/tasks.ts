import { v } from "convex/values"

import { nextRunnable } from "../lib/core/plan"
import { internalMutation, internalQuery } from "./_generated/server"

/** Insert a validated plan's tasks. Order is the topological order. */
export const insertAll = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    tasks: v.array(
      v.object({
        taskId: v.string(),
        name: v.string(),
        description: v.string(),
        agentName: v.string(),
        role: v.string(),
        persona: v.optional(v.string()),
        dependsOn: v.array(v.string()),
        allowedPaths: v.array(v.string()),
        acceptanceCriteria: v.array(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    let order = 0
    for (const t of args.tasks) {
      await ctx.db.insert("tasks", {
        ...t,
        sessionId: args.sessionId,
        status: "pending",
        turns: 0,
        order: order++,
      })
    }
  },
})

/**
 * Append one repair task after a failing test run.
 *
 * It depends on nothing — everything it needs already exists on disk — so the
 * execute phase picks it up immediately. `allowedPaths` is handed in by the test
 * phase from the files that were actually written, which keeps the builder
 * inside the project it just made rather than granting it the whole tree.
 */
export const appendFix = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    taskId: v.string(),
    description: v.string(),
    agentName: v.string(),
    persona: v.optional(v.string()),
    allowedPaths: v.array(v.string()),
    acceptanceCriteria: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("tasks")
      .withIndex("by_session_order", (q) => q.eq("sessionId", args.sessionId))
      .collect()
    const order = rows.reduce((max, t) => Math.max(max, t.order), -1) + 1

    await ctx.db.insert("tasks", {
      sessionId: args.sessionId,
      taskId: args.taskId,
      name: "Fix the failing checks",
      description: args.description,
      agentName: args.agentName,
      role: "builder",
      persona: args.persona,
      dependsOn: [],
      allowedPaths: args.allowedPaths,
      acceptanceCriteria: args.acceptanceCriteria,
      status: "pending",
      turns: 0,
      order,
    })
  },
})

export const all = internalQuery({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_session_order", (q) => q.eq("sessionId", args.sessionId))
      .collect()
  },
})

/**
 * The next task whose dependencies are all done, plus the summaries of its
 * predecessors so the prompt builder can include them.
 */
export const claimNext = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("tasks")
      .withIndex("by_session_order", (q) => q.eq("sessionId", args.sessionId))
      .collect()

    // Resume a task that was already in progress before the action timed out.
    const resuming = rows.find((t) => t.status === "running")
    const pick =
      resuming ??
      rows.find(
        (t) =>
          nextRunnable(
            rows.map((r) => ({
              taskId: r.taskId,
              status: r.status as "pending" | "running" | "done" | "failed",
              dependsOn: r.dependsOn,
            }))
          )?.taskId === t.taskId
      )

    if (!pick) return null
    if (pick.status === "pending") {
      await ctx.db.patch(pick._id, { status: "running" })
    }

    const done = new Map(
      rows.filter((r) => r.summary).map((r) => [r.taskId, r.summary!])
    )
    const predecessors = pick.dependsOn
      .filter((d) => done.has(d))
      .map((d) => ({ taskId: d, summary: done.get(d)! }))

    return { task: pick, predecessors, resumed: Boolean(resuming) }
  },
})

export const saveHistory = internalMutation({
  args: { id: v.id("tasks"), history: v.any(), turns: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { history: args.history, turns: args.turns })
  },
})

export const complete = internalMutation({
  args: {
    id: v.id("tasks"),
    status: v.string(),
    verdict: v.optional(v.string()),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      ...(args.verdict ? { verdict: args.verdict } : {}),
      ...(args.summary ? { summary: args.summary.slice(0, 2000) } : {}),
      history: undefined,
    })
  },
})

/** Mirror a written file so the code drawer works without touching the sandbox. */
export const recordFile = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    path: v.string(),
    content: v.string(),
    byTask: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("files")
      .withIndex("by_session_path", (q) =>
        q.eq("sessionId", args.sessionId).eq("path", args.path)
      )
      .take(1)

    // Cap what we mirror: the DB copy is for reading, not for building.
    const content = args.content.slice(0, 60_000)
    if (existing[0]) {
      await ctx.db.patch(existing[0]._id, { content, byTask: args.byTask })
    } else {
      await ctx.db.insert("files", {
        sessionId: args.sessionId,
        path: args.path,
        content,
        byTask: args.byTask,
      })
    }
  },
})

export const manifest = internalQuery({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("files")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect()
    return rows.map((f) => f.path).sort()
  },
})
