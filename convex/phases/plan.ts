"use node"

/**
 * Phase 1 — plan. NuggetSpec → a validated task DAG.
 *
 * Structured Outputs guarantees the shape at decode time, so there is no JSON
 * repair step: no fence stripping, no slicing from the first brace, no retry.
 * `validatePlan` still checks the meaning: dangling deps, cycles, path escapes.
 */

import { zodTextFormat } from "openai/helpers/zod"
import { v } from "convex/values"

import { BuildPlanSchema, topoSort, validatePlan } from "../../lib/core/plan"
import {
  metaPlannerSystem,
  metaPlannerUser,
} from "../../lib/core/prompts/planner"
import { NuggetSpecSchema } from "../../lib/core/spec"
import { internal } from "../_generated/api"
import { internalAction } from "../_generated/server"
import { MODEL, openai } from "../lib/openaiClient"
import { describeError, failSession, narrate } from "../lib/phaseUtils"

export const run = internalAction({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const loaded = await ctx.runQuery(internal.sessions.load, { sessionId })
    if (!loaded?.session) return

    const parsedSpec = NuggetSpecSchema.safeParse(loaded.session.spec)
    if (!parsedSpec.success) {
      await failSession(
        ctx,
        sessionId,
        "Those blocks didn't make sense to me. Try again?"
      )
      return
    }
    const spec = parsedSpec.data

    let plan
    try {
      const response = await openai().responses.parse({
        model: MODEL,
        input: [
          { role: "system", content: metaPlannerSystem(spec) },
          { role: "user", content: metaPlannerUser(spec) },
        ],
        text: { format: zodTextFormat(BuildPlanSchema, "build_plan") },
      })
      plan = response.output_parsed
    } catch (error) {
      const missingKey =
        error instanceof Error && error.message.includes("OPENAI_API_KEY")
      await failSession(
        ctx,
        sessionId,
        missingKey
          ? "My brain isn't plugged in yet — a grown-up needs to add the OpenAI key."
          : "I had trouble thinking of a plan. Press GO to try again.",
        describeError(error)
      )
      return
    }

    if (!plan) {
      await failSession(
        ctx,
        sessionId,
        "I couldn't come up with a plan. Press GO to try again."
      )
      return
    }

    const checked = validatePlan(plan)
    if (!checked.ok) {
      // A shape-valid but nonsensical plan. Structured Outputs guarantees the
      // shape; this is what catches the meaning.
      await failSession(
        ctx,
        sessionId,
        "My plan had a mistake in it. Press GO and I'll think again.",
        `Plan rejected: ${checked.errors.join(" ")}`
      )
      return
    }

    const agentByName = new Map(checked.plan.agents.map((a) => [a.name, a]))
    const ordered = topoSort(checked.plan.tasks)

    await ctx.runMutation(internal.tasks.insertAll, {
      sessionId,
      tasks: ordered.map((t) => ({
        taskId: t.taskId,
        name: t.name,
        description: t.description,
        agentName: t.agentName,
        role: agentByName.get(t.agentName)?.role ?? "builder",
        persona: agentByName.get(t.agentName)?.persona,
        dependsOn: t.dependsOn,
        allowedPaths: t.allowedPaths,
        acceptanceCriteria: t.acceptanceCriteria,
      })),
    })

    await ctx.runMutation(internal.sessions.patchState, {
      sessionId,
      state: "executing",
      explanation: checked.plan.explanation,
      framework: checked.plan.framework,
    })

    await narrate(
      ctx,
      sessionId,
      "codey",
      checked.plan.explanation ||
        `Here's my plan: ${ordered.length} steps. Starting now!`,
      "excited"
    )

    for (const note of checked.notes) {
      await ctx.runMutation(internal.sessions.addEvent, {
        sessionId,
        kind: "error",
        text: note,
      })
    }

    await ctx.scheduler.runAfter(0, internal.phases.execute.run, { sessionId })
  },
})
