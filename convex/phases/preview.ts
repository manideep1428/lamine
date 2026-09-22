"use node"

/**
 * Phase 4 — preview.
 *
 * Start a static server inside the sandbox and expose its port. The URL lives on
 * a different origin from the app, so the iframe is isolated for free — no
 * srcdoc juggling, no postMessage handshake to make it safe.
 *
 * A paused sandbox wakes on an HTTP hit, which is the whole reason autopause is
 * right here: the kid opens their project tomorrow, the iframe loads, the
 * sandbox resumes, and their game is still there.
 */

import type { Sandbox } from "e2b"
import { v } from "convex/values"

import { PROJECT_ROOT } from "../../lib/core/paths"
import { internal } from "../_generated/api"
import { internalAction } from "../_generated/server"
import { describeError, failSession, narrate } from "../lib/phaseUtils"
import { getSandbox, keepAlive, runCommand, startPreview } from "../lib/sandbox"

export const run = internalAction({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const loaded = await ctx.runQuery(internal.sessions.load, { sessionId })
    if (!loaded?.session || !loaded.project) return
    if (["stopped", "failed", "done"].includes(loaded.session.state)) return

    await ctx.runMutation(internal.sessions.patchState, {
      sessionId,
      state: "previewing",
    })

    let sandbox: Sandbox
    try {
      sandbox = await getSandbox(loaded.project.sandboxId)
      await keepAlive(sandbox)
    } catch (error) {
      await failSession(
        ctx,
        sessionId,
        "I couldn't open my workshop to show you the result.",
        describeError(error)
      )
      return
    }

    // Without an index.html there is nothing to open, and a 404 in the iframe
    // reads as "Lamine is broken" rather than "the build didn't finish".
    const check = await runCommand(
      sandbox,
      `test -f ${PROJECT_ROOT}/index.html`,
      15_000
    )
    if (check.exitCode !== 0) {
      await failSession(
        ctx,
        sessionId,
        "I didn't manage to finish the main page this time. Press GO and I'll try again.",
        "index.html missing after execute phase"
      )
      return
    }

    let previewUrl: string
    try {
      previewUrl = await startPreview(sandbox)
    } catch (error) {
      await failSession(
        ctx,
        sessionId,
        "I built it, but couldn't open it for you. Press GO to try showing it again.",
        describeError(error)
      )
      return
    }

    await ctx.runMutation(internal.sessions.setSandbox, {
      projectId: loaded.project._id,
      sandboxId: sandbox.sandboxId,
      previewUrl,
    })

    await ctx.runMutation(internal.sessions.patchState, {
      sessionId,
      state: "done",
    })

    const failed =
      (loaded.session.testsTotal ?? 0) - (loaded.session.testsPassed ?? 0)
    await narrate(
      ctx,
      sessionId,
      "codey",
      failed > 0
        ? "It's ready to try! One part still isn't right — have a play and tell me what you see."
        : "It's ready! Open the Preview tab and try it. 🎉",
      failed > 0 ? "encouraging" : "celebrating"
    )
  },
})

/**
 * Wake a project's sandbox and make sure its preview server is up.
 *
 * Called from the studio when a kid opens an old project: the sandbox may be
 * paused, and the server inside it may have been lost with the pause. Cheap
 * enough to call on load, and it is what makes "my game is still there"
 * actually true.
 */
export const resume = internalAction({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.runQuery(internal.projects.loadInternal, {
      projectId,
    })
    if (!project?.sandboxId) return null

    try {
      const sandbox = await getSandbox(project.sandboxId)
      const previewUrl = await startPreview(sandbox)
      await ctx.runMutation(internal.sessions.setSandbox, {
        projectId,
        sandboxId: sandbox.sandboxId,
        previewUrl,
      })
      return previewUrl
    } catch {
      // The sandbox is gone. The project's files are still in Convex, and a
      // fresh GO rebuilds it, so this is not worth surfacing as an error.
      return null
    }
  },
})
