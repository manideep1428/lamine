"use node"

import { internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import type { ActionCtx } from "../_generated/server"

/**
 * Fail a session with a message written for a child, and log the technical
 * detail separately so it is available for debugging without being shown.
 */
export async function failSession(
  ctx: ActionCtx,
  sessionId: Id<"sessions">,
  kidMessage: string,
  detail?: string
): Promise<void> {
  if (detail) {
    await ctx.runMutation(internal.sessions.addEvent, {
      sessionId,
      kind: "error",
      text: detail.slice(0, 2000),
    })
  }
  await ctx.runMutation(internal.sessions.patchState, {
    sessionId,
    state: "failed",
    error: kidMessage,
  })
  await ctx.runMutation(internal.sessions.addEvent, {
    sessionId,
    kind: "narrator",
    who: "drbug",
    mood: "concerned",
    text: kidMessage,
  })
}

export async function narrate(
  ctx: ActionCtx,
  sessionId: Id<"sessions">,
  who: "codey" | "pixel" | "drbug",
  text: string,
  mood: "excited" | "encouraging" | "concerned" | "celebrating" = "encouraging"
): Promise<void> {
  await ctx.runMutation(internal.sessions.addEvent, {
    sessionId,
    kind: "narrator",
    who,
    mood,
    text: text.slice(0, 600),
  })
}

/** Turn a thrown value into something safe to store. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}

/** Did we run out of budget? Keeps a runaway loop from costing real money. */
export const SESSION_TURN_BUDGET = 90
export const TURNS_PER_ACTION = 10
export const MAX_TURNS_PER_TASK = 24
