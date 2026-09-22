import { v } from "convex/values"

import { CHAT_LIMITS } from "../lib/core/crew"
import { internalMutation, internalQuery, query } from "./_generated/server"

/**
 * Buddy chat lives in its own table, separate from build events, so a
 * conversation survives across build sessions — a child asking "why did that
 * happen?" the next day should still see what they asked.
 *
 * Queries and mutations only: the OpenAI call is an action in `convex/crew.ts`.
 */

const HISTORY_CAP = 60

export const listFor = query({
  args: { projectId: v.id("projects"), secret: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId)
    if (!project || project.secret !== args.secret) return []
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(HISTORY_CAP)
    return rows.reverse()
  },
})

export const recent = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(CHAT_LIMITS.historyTurns)
    return rows.reverse().map((m) => ({ who: m.who, text: m.text }))
  },
})

export const add = internalMutation({
  args: {
    projectId: v.id("projects"),
    who: v.string(),
    text: v.string(),
    mood: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", {
      projectId: args.projectId,
      who: args.who.slice(0, 32),
      text: args.text.slice(0, CHAT_LIMITS.reply),
      ...(args.mood ? { mood: args.mood } : {}),
    })
  },
})
