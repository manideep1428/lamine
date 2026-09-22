/**
 * The buddies' reply shape.
 *
 * One LLM call returns all three voices (PLAN.md §11) — three agents with an
 * orchestrator would cost three times as much and a child could not tell the
 * difference. Structured Outputs constrains the shape at decode time; this is
 * the schema it is constrained to.
 *
 * Pure module: shared by the Convex action that makes the call and by the UI
 * that renders the result.
 */

import { z } from "zod"

export const BUDDY_IDS = ["codey", "pixel", "drbug"] as const
export type BuddyId = (typeof BUDDY_IDS)[number]

export const MOODS = [
  "excited",
  "encouraging",
  "concerned",
  "celebrating",
] as const
export type Mood = (typeof MOODS)[number]

export const BUDDY_LOOK: Record<
  BuddyId,
  { name: string; emoji: string; accent: string }
> = {
  codey: { name: "Codey", emoji: "🤖", accent: "sky" },
  pixel: { name: "Pixel", emoji: "🎨", accent: "lavender" },
  drbug: { name: "Dr. Bug", emoji: "🐞", accent: "coral" },
}

/** Voice pitch per buddy, so speech synthesis gives each one a character. */
export const BUDDY_PITCH: Record<BuddyId, number> = {
  codey: 1.1,
  pixel: 1.35,
  drbug: 0.85,
}

/**
 * Every field required, no optionals: OpenAI strict mode demands it. Absence is
 * expressed as an empty array.
 */
export const CrewReplySchema = z.strictObject({
  replies: z
    .array(
      z.strictObject({
        who: z.enum(BUDDY_IDS),
        text: z.string(),
        mood: z.enum(MOODS),
      })
    )
    .max(3),
})

export type CrewReply = z.infer<typeof CrewReplySchema>["replies"][number]

export const CHAT_LIMITS = {
  /** A child's message. Long enough for a paragraph, short enough to be cheap. */
  message: 600,
  /** How much of the conversation the model sees. */
  historyTurns: 12,
  /** Per reply. Two short sentences is the house style. */
  reply: 400,
} as const

/** Clamp what the model returned before it reaches the database or the UI. */
export function tidyReplies(replies: readonly CrewReply[]): CrewReply[] {
  const seen = new Set<string>()
  const out: CrewReply[] = []
  for (const reply of replies) {
    const text = reply.text.trim().slice(0, CHAT_LIMITS.reply)
    if (!text) continue
    // One turn per buddy: a model that repeats itself reads as a glitch.
    if (seen.has(reply.who)) continue
    seen.add(reply.who)
    out.push({ who: reply.who, text, mood: reply.mood })
  }
  return out
}

export function isBuddy(value: string): value is BuddyId {
  return (BUDDY_IDS as readonly string[]).includes(value)
}
