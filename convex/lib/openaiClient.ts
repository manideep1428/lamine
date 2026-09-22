"use node"

/**
 * OpenAI access for the phase actions.
 *
 * The key lives in Convex environment variables and never leaves the server.
 * Nothing here is exported to the browser.
 */

import OpenAI from "openai"

/**
 * The one model every role uses: planner, builder, tester, reviewer and the
 * buddies. Overridable by env so a deployment can move without a code change,
 * but the default is the model this project is actually tuned against — there is
 * deliberately no second model to fall back to.
 */
export const MODEL = process.env.OPENAI_MODEL ?? "gpt-5.6-luna"

let client: OpenAI | null = null

export function openai(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it in the Convex dashboard under Settings → Environment Variables."
    )
  }
  // Created lazily so a missing key is a clear error at call time rather than
  // a module-load crash that takes the whole deployment down.
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return client
}

export function isConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY)
}
