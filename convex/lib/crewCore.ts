"use node"

/**
 * The buddies' brains.
 *
 * Plain async functions rather than actions, because both `convex/crew.ts` and
 * the test phase need them and calling an action from an action only makes sense
 * to cross runtimes. Same-runtime sharing belongs in a helper module.
 */

import { zodTextFormat } from "openai/helpers/zod"

import {
  CrewReplySchema,
  tidyReplies,
  type CrewReply,
} from "../../lib/core/crew"
import { crewSystem, explainErrorSystem } from "../../lib/core/prompts/planner"
import { asKidInput, sanitizePlaceholder } from "../../lib/core/prompts/shared"
import type { NuggetSpec } from "../../lib/core/spec"
import { MODEL, openai } from "./openaiClient"

/**
 * Dr. Bug reads a failure and says what it means.
 *
 * The input is machine output — a failing test name, a stack trace from the
 * kid's own iframe — so it is wrapped as data, not instructions.
 */
export async function explainForKid(
  spec: NuggetSpec,
  problem: string,
  context?: string
): Promise<string> {
  const response = await openai().responses.create({
    model: MODEL,
    instructions: explainErrorSystem(),
    input: [
      {
        role: "user",
        content: [
          `The child is building a ${spec.nugget.kind} about "${sanitizePlaceholder(spec.nugget.goal)}".`,
          context ? `Where it happened: ${sanitizePlaceholder(context)}` : "",
          `What went wrong:\n${asKidInput(problem.slice(0, 2000), "error_output")}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    store: false,
  })

  return response.output_text?.trim().slice(0, 600) ?? ""
}

export interface ChatTurn {
  who: string
  text: string
}

/**
 * One call, three voices. Returns only the buddies who had something to add.
 */
export async function crewChat(
  spec: NuggetSpec,
  history: readonly ChatTurn[],
  kidMessage: string,
  situation?: string
): Promise<CrewReply[]> {
  const transcript = history
    .map((turn) =>
      turn.who === "kid"
        ? `Child: ${sanitizePlaceholder(turn.text)}`
        : `${turn.who}: ${sanitizePlaceholder(turn.text)}`
    )
    .join("\n")

  const response = await openai().responses.parse({
    model: MODEL,
    input: [
      { role: "system", content: crewSystem(spec) },
      {
        role: "user",
        content: [
          situation
            ? `## What is happening right now\n${sanitizePlaceholder(situation)}`
            : "",
          transcript ? `## Earlier\n${transcript}` : "",
          `## The child just said\n${asKidInput(kidMessage)}`,
          `Reply as whichever helpers have something useful to add.`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    text: { format: zodTextFormat(CrewReplySchema, "crew_replies") },
    store: false,
  })

  const parsed = response.output_parsed
  return parsed ? tidyReplies(parsed.replies) : []
}
