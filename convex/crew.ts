"use node"

/**
 * The buddies.
 *
 * Codey 🤖 explains what the agents are doing, Pixel 🎨 talks about how it looks,
 * Dr. Bug 🐞 reads failures and makes them make sense. One action, one LLM call,
 * up to three replies — not three agents with an orchestrator.
 *
 * During a build the narrator feed is fed by the `events` table, so the buddies
 * narrate real tool calls. This file is for the times a child talks back.
 */

import { v } from "convex/values"

import { CHAT_LIMITS } from "../lib/core/crew"
import { NuggetSpecSchema, type NuggetSpec } from "../lib/core/spec"
import { internal } from "./_generated/api"
import { action, type ActionCtx } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { crewChat, explainForKid } from "./lib/crewCore"
import { describeError } from "./lib/phaseUtils"

/** A project with no spec yet still gets a conversation. */
const FALLBACK_SPEC: NuggetSpec = {
  nugget: { goal: "something new", kind: "game" },
  framework: "canvas",
  requirements: [],
  behavioralTests: [],
  data: [],
  skills: [],
  deploy: { target: "web" },
}

async function loadSpec(
  ctx: ActionCtx,
  projectId: Id<"projects">
): Promise<NuggetSpec> {
  const project = await ctx.runQuery(internal.projects.loadInternal, {
    projectId,
  })
  const parsed = NuggetSpecSchema.safeParse(project?.spec)
  return parsed.success ? parsed.data : FALLBACK_SPEC
}

/**
 * A child said something. Reply as whichever buddies have something to add.
 *
 * Public, and gated on the project secret like everything else — with no
 * accounts, possession of the key is the permission.
 */
export const chat = action({
  args: {
    projectId: v.id("projects"),
    secret: v.string(),
    text: v.string(),
    /** What the studio is showing right now, so Codey can be specific. */
    situation: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<null> => {
    const allowed = await ctx.runQuery(internal.projects.checkSecret, {
      projectId: args.projectId,
      secret: args.secret,
    })
    if (!allowed) throw new Error("You don't have the key for that project.")

    const text = args.text.trim().slice(0, CHAT_LIMITS.message)
    if (!text) return null

    await ctx.runMutation(internal.messages.add, {
      projectId: args.projectId,
      who: "kid",
      text,
    })

    const [spec, history] = await Promise.all([
      loadSpec(ctx, args.projectId),
      ctx.runQuery(internal.messages.recent, { projectId: args.projectId }),
    ])

    try {
      const replies = await crewChat(
        spec,
        // Drop the message we just stored; it is passed separately.
        history.slice(0, -1),
        text,
        args.situation
      )

      if (replies.length === 0) {
        await ctx.runMutation(internal.messages.add, {
          projectId: args.projectId,
          who: "codey",
          text: "I'm not sure about that one — try saying it a different way?",
          mood: "encouraging",
        })
        return null
      }

      for (const reply of replies) {
        await ctx.runMutation(internal.messages.add, {
          projectId: args.projectId,
          who: reply.who,
          text: reply.text,
          mood: reply.mood,
        })
      }
    } catch (error) {
      await ctx.runMutation(internal.messages.add, {
        projectId: args.projectId,
        who: "codey",
        text: missingKey(error)
          ? "My brain isn't plugged in yet — a grown-up needs to add the OpenAI key."
          : "My words got stuck. Ask me again?",
        mood: "concerned",
      })
    }

    return null
  },
})

/**
 * The iframe error bridge.
 *
 * The kid's own game runs on a different origin, so it cannot throw into our
 * console. The studio listens for `window.onerror` inside the preview and posts
 * it here; Dr. Bug turns a stack trace into a sentence.
 */
export const explainError = action({
  args: {
    projectId: v.id("projects"),
    secret: v.string(),
    message: v.string(),
    where: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<null> => {
    const allowed = await ctx.runQuery(internal.projects.checkSecret, {
      projectId: args.projectId,
      secret: args.secret,
    })
    if (!allowed) throw new Error("You don't have the key for that project.")

    const problem = args.message.trim().slice(0, 2000)
    if (!problem) return null

    const spec = await loadSpec(ctx, args.projectId)

    try {
      const explanation = await explainForKid(spec, problem, args.where)
      await ctx.runMutation(internal.messages.add, {
        projectId: args.projectId,
        who: "drbug",
        text:
          explanation ||
          "Something went wrong in your project, but I can't tell what yet.",
        mood: "concerned",
      })
    } catch (error) {
      await ctx.runMutation(internal.messages.add, {
        projectId: args.projectId,
        who: "drbug",
        text: missingKey(error)
          ? "I can see something broke, but my brain isn't plugged in to explain it."
          : "Something went wrong in your project. Press GO to build it again and I'll watch closely.",
        mood: "concerned",
      })
    }

    return null
  },
})

function missingKey(error: unknown): boolean {
  return describeError(error).includes("OPENAI_API_KEY")
}
