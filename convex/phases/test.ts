"use node"

/**
 * Phase 3 — test.
 *
 * The kid's Proof blocks became `behavioralTests` in the spec, which the tester
 * agent turned into `tests/*.js`. This runs them in the sandbox for real, reads
 * the PASS/FAIL lines, and decides what to do.
 *
 * The gate is deliberately generous: a child should see the thing they made even
 * when part of it is broken. Below the bar we spend exactly one repair attempt,
 * then preview anyway and say plainly what still fails.
 */

import type { Sandbox } from "e2b"
import { v } from "convex/values"

import { PROJECT_ROOT } from "../../lib/core/paths"
import { PLAN_LIMITS } from "../../lib/core/plan"
import { NuggetSpecSchema } from "../../lib/core/spec"
import {
  failureDigest,
  gateDecision,
  kidSummary,
  parseTestOutput,
  sawNoTests,
  testCommand,
  type TestReport,
} from "../../lib/core/testing"
import { internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { internalAction, type ActionCtx } from "../_generated/server"
import { explainForKid } from "../lib/crewCore"
import { describeError, failSession, narrate } from "../lib/phaseUtils"
import { getSandbox, keepAlive, runCommand } from "../lib/sandbox"

/** Tests can be slow; still well inside the action ceiling. */
const TEST_TIMEOUT_MS = 120_000

export const run = internalAction({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const loaded = await ctx.runQuery(internal.sessions.load, { sessionId })
    if (!loaded?.session || !loaded.project) return
    if (!["executing", "testing"].includes(loaded.session.state)) return

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

    await ctx.runMutation(internal.sessions.patchState, {
      sessionId,
      state: "testing",
    })

    let sandbox: Sandbox
    try {
      sandbox = await getSandbox(loaded.project.sandboxId)
      await keepAlive(sandbox)
    } catch (error) {
      await failSession(
        ctx,
        sessionId,
        "I couldn't get back into my workshop to run the checks.",
        describeError(error)
      )
      return
    }

    await narrate(
      ctx,
      sessionId,
      "drbug",
      "Running your checks now…",
      "encouraging"
    )

    const result = await runCommand(
      sandbox,
      `cd ${PROJECT_ROOT} && ${testCommand()}`,
      TEST_TIMEOUT_MS
    )

    if (sawNoTests(result.output)) {
      await ctx.runMutation(internal.sessions.recordTests, {
        sessionId,
        testsPassed: 0,
        testsTotal: 0,
      })
      await narrate(
        ctx,
        sessionId,
        "drbug",
        "There were no checks to run this time. Add a 🔍 Check block inside a promise and I'll test it next time.",
        "encouraging"
      )
      await ctx.scheduler.runAfter(0, internal.phases.preview.run, {
        sessionId,
      })
      return
    }

    const report = parseTestOutput(result.output)
    await recordResults(ctx, sessionId, report)

    const fixAttempts = loaded.session.fixAttempts ?? 0
    const decision = gateDecision(report, fixAttempts)

    await narrate(
      ctx,
      sessionId,
      "drbug",
      decision.message,
      report.failed === 0 ? "celebrating" : "concerned"
    )

    /* ── Dr. Bug explains, whenever something failed ── */
    if (report.failed > 0) {
      try {
        const explanation = await explainForKid(
          spec,
          `These checks failed:\n${failureDigest(report)}\n\nOutput:\n${result.output.slice(-2000)}`,
          "running the checks"
        )
        if (explanation) {
          await ctx.runMutation(internal.sessions.addEvent, {
            sessionId,
            kind: "teaching",
            who: "drbug",
            mood: "encouraging",
            text: explanation,
          })
        }
      } catch (error) {
        // An explanation is a nicety. Losing it must not lose the build.
        await ctx.runMutation(internal.sessions.addEvent, {
          sessionId,
          kind: "error",
          text: describeError(error).slice(0, 500),
        })
      }
    }

    /* ── one bounded repair attempt ── */
    if (decision.outcome === "fix") {
      const queued = await queueRepair(ctx, sessionId, report)
      if (queued) {
        await ctx.runMutation(internal.sessions.recordTests, {
          sessionId,
          testsPassed: report.passed,
          testsTotal: report.total,
          fixAttempts: fixAttempts + 1,
        })
        await ctx.runMutation(internal.sessions.patchState, {
          sessionId,
          state: "executing",
        })
        await ctx.scheduler.runAfter(0, internal.phases.execute.run, {
          sessionId,
        })
        return
      }
    }

    await ctx.scheduler.runAfter(0, internal.phases.preview.run, { sessionId })
  },
})

/* ════════════════════════════════════════════════════════════════════════
   Helpers
   ════════════════════════════════════════════════════════════════════════ */

/** One row per check, so the Tests drawer shows the same thing the gate saw. */
async function recordResults(
  ctx: ActionCtx,
  sessionId: Id<"sessions">,
  report: TestReport
): Promise<void> {
  await ctx.runMutation(internal.sessions.addEvents, {
    sessionId,
    events: [
      ...report.cases.slice(0, 40).map((c) => ({
        kind: "test_result",
        who: "drbug",
        mood: c.passed ? "celebrating" : "concerned",
        text: `${c.passed ? "PASS" : "FAIL"}: ${c.name}`,
      })),
      { kind: "narrator", who: "drbug", text: kidSummary(report) },
    ],
  })

  await ctx.runMutation(internal.sessions.recordTests, {
    sessionId,
    testsPassed: report.passed,
    testsTotal: report.total,
  })
}

/**
 * Add a repair task for a builder.
 *
 * `allowedPaths` comes from the files that were actually written, minus the
 * tests — a repair agent that can edit the tests would "fix" the failure by
 * deleting the check, which is exactly the outcome the Proof blocks exist to
 * prevent.
 */
async function queueRepair(
  ctx: ActionCtx,
  sessionId: Id<"sessions">,
  report: TestReport
): Promise<boolean> {
  const [manifest, tasks] = await Promise.all([
    ctx.runQuery(internal.tasks.manifest, { sessionId }),
    ctx.runQuery(internal.tasks.all, { sessionId }),
  ])

  const editable = manifest
    .filter((path) => !path.startsWith("tests/"))
    .slice(0, PLAN_LIMITS.maxPathsPerTask)

  if (editable.length === 0) return false

  const builder = tasks.find((t) => t.role === "builder")
  if (!builder) return false

  // Don't stack repairs if one is already queued or running.
  if (tasks.some((t) => t.taskId.startsWith("fix_") && t.status !== "done"))
    return false

  await ctx.runMutation(internal.tasks.appendFix, {
    sessionId,
    taskId: `fix_${tasks.length + 1}`,
    description: [
      `Some checks are failing. Fix the code so they pass.`,
      ``,
      `Failing checks:`,
      failureDigest(report, 8),
      ``,
      `Read the files you are allowed to change, find the cause, and fix it.`,
      `Do NOT change anything in tests/ — the checks are what the child asked for.`,
      `Keep every change as small as you can.`,
    ].join("\n"),
    agentName: builder.agentName,
    persona: builder.persona,
    allowedPaths: editable,
    acceptanceCriteria: report.cases
      .filter((c) => !c.passed)
      .slice(0, 8)
      .map((c) => `The check "${c.name}" passes.`),
  })

  return true
}
