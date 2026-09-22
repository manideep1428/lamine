"use node"

/**
 * Phase 2 — execute. The agent loop.
 *
 * elisa spawned the Claude Code CLI per agent. We keep the loop here and give
 * the agent E2B as its tool surface, which buys three things: the API key never
 * leaves Convex, every tool call lands in the `events` table (so the narrator
 * feed is real work rather than canned lines), and the MetaPlanner's DAG decides
 * what runs next instead of agent-chosen handoffs.
 *
 * A Convex action caps out near ten minutes, so this runs a bounded number of
 * turns, parks the conversation on the task row, and reschedules itself. One
 * task per invocation, one invocation per chunk of turns.
 */

import type { Sandbox } from "e2b"
import type OpenAI from "openai"
import { v } from "convex/values"

import { PathViolation } from "../../lib/core/paths"
import {
  buildSystemPrompt,
  buildTaskPrompt,
  ROLE_MODULES,
} from "../../lib/core/prompts/shared"
import { NuggetSpecSchema } from "../../lib/core/spec"
import {
  describeToolCall,
  parseToolArguments,
  readDoneArgs,
  TOOL,
  toolsFor,
  verdictIsGood,
} from "../../lib/core/tools"
import {
  collectOutputText,
  functionCallOutput,
  functionCalls,
  keepableOutput,
  trimHistory,
} from "../../lib/core/turns"
import { internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { internalAction, type ActionCtx } from "../_generated/server"
import { MODEL, openai } from "../lib/openaiClient"
import { getSandbox, keepAlive, runTool } from "../lib/sandbox"
import {
  describeError,
  failSession,
  MAX_TURNS_PER_TASK,
  narrate,
  SESSION_TURN_BUDGET,
  TURNS_PER_ACTION,
} from "../lib/phaseUtils"

type Role = "builder" | "tester" | "reviewer"

interface PendingEvent {
  kind: string
  text: string
  who?: string
  mood?: string
  taskId?: string
}

export const run = internalAction({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const loaded = await ctx.runQuery(internal.sessions.load, { sessionId })
    if (!loaded?.session || !loaded.project) return

    // A kid pressing STOP patches the state; every phase checks before working.
    if (loaded.session.state !== "executing") return

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

    if (loaded.session.turnsUsed >= SESSION_TURN_BUDGET) {
      await narrate(
        ctx,
        sessionId,
        "codey",
        "That's as far as I can go this time. Let's look at what I made so far.",
        "concerned"
      )
      await ctx.scheduler.runAfter(0, internal.phases.test.run, { sessionId })
      return
    }

    const claim = await ctx.runMutation(internal.tasks.claimNext, { sessionId })
    if (!claim) {
      // Nothing runnable: everything is done, failed, or blocked by a failure.
      await ctx.scheduler.runAfter(0, internal.phases.test.run, { sessionId })
      return
    }

    const task = claim.task
    const role: Role = normaliseRole(task.role)
    const buddy = ROLE_MODULES[role].buddy

    // A task that already burned its budget is finished here rather than looping.
    if (task.turns >= MAX_TURNS_PER_TASK) {
      await ctx.runMutation(internal.tasks.complete, {
        id: task._id,
        status: "failed",
        verdict: "FAIL",
        summary: "Ran out of turns before finishing this step.",
      })
      await ctx.scheduler.runAfter(0, internal.phases.execute.run, {
        sessionId,
      })
      return
    }

    if (!claim.resumed) {
      await narrate(
        ctx,
        sessionId,
        buddy,
        startLine(role, task.name),
        "excited"
      )
    }

    /* ── sandbox ── */
    let sandbox: Sandbox
    try {
      sandbox = await getSandbox(loaded.project.sandboxId)
    } catch (error) {
      await failSession(
        ctx,
        sessionId,
        "I couldn't open my workshop. A grown-up may need to check the sandbox key.",
        describeError(error)
      )
      return
    }
    if (sandbox.sandboxId !== loaded.project.sandboxId) {
      await ctx.runMutation(internal.sessions.setSandbox, {
        projectId: loaded.project._id,
        sandboxId: sandbox.sandboxId,
      })
    }
    await keepAlive(sandbox)

    /* ── prompts ── */
    const manifest = await ctx.runQuery(internal.tasks.manifest, { sessionId })
    const system = buildSystemPrompt({
      role,
      agentName: task.agentName,
      persona: task.persona ?? "",
      spec,
      allowedPaths: task.allowedPaths,
      maxTurns: MAX_TURNS_PER_TASK,
    })

    let input: unknown[] =
      Array.isArray(task.history) && task.history.length
        ? (task.history as unknown[])
        : [
            {
              role: "user",
              content: buildTaskPrompt({
                taskId: task.taskId,
                taskName: task.name,
                description: task.description,
                acceptanceCriteria: task.acceptanceCriteria,
                spec,
                predecessors: claim.predecessors,
                fileManifest: manifest,
              }),
            },
          ]

    /* ── the loop ── */
    let turns = task.turns
    let finished = false
    let stopped = false

    for (
      let step = 0;
      step < TURNS_PER_ACTION && turns < MAX_TURNS_PER_TASK;
      step++
    ) {
      // STOP patches the session state. Checking here, rather than only at the
      // top of the action, is the difference between obeying a child within one
      // turn and spending nine more model calls first.
      const live = await ctx.runQuery(internal.sessions.stateOf, { sessionId })
      if (live !== "executing") {
        stopped = true
        break
      }

      let response: OpenAI.Responses.Response
      try {
        response = await openai().responses.create({
          model: MODEL,
          instructions: system,
          input: input as OpenAI.Responses.ResponseInput,
          tools: toolsFor(role) as OpenAI.Responses.Tool[],
          // We park the conversation on the task row ourselves, so there is no
          // reason to leave a copy on OpenAI's side.
          store: false,
        })
      } catch (error) {
        await handleLoopError(ctx, sessionId, task._id, input, turns, error)
        return
      }

      turns++
      const output = response.output ?? []
      input = [...input, ...keepableOutput(output)]

      const events: PendingEvent[] = []
      const said = collectOutputText(output)
      if (said) {
        events.push({
          kind: "agent_output",
          who: buddy,
          text: said.slice(0, 600),
          taskId: task.taskId,
        })
      }

      const calls = functionCalls(output)

      if (calls.length === 0) {
        // The model answered in prose instead of calling done(). Treat what it
        // said as its summary rather than spending more turns asking again.
        if (events.length)
          await ctx.runMutation(internal.sessions.addEvents, {
            sessionId,
            events,
          })
        await completeTask(ctx, sessionId, task._id, task.taskId, role, {
          verdict:
            role === "builder"
              ? "OK"
              : role === "tester"
                ? "FAIL"
                : "NEEDS_CHANGES",
          summary: said || "Finished without saying what happened.",
        })
        finished = true
        break
      }

      for (const call of calls) {
        const args = parseToolArguments(call.arguments)

        if (call.name === TOOL.done) {
          const done = readDoneArgs(args, role)
          events.push({
            kind: "task_done",
            who: buddy,
            text: `${task.name}: ${done.verdict}`,
            taskId: task.taskId,
          })
          await ctx.runMutation(internal.sessions.addEvents, {
            sessionId,
            events,
          })
          await completeTask(ctx, sessionId, task._id, task.taskId, role, done)
          finished = true
          break
        }

        let result: {
          output: string
          wrote?: { path: string; content: string }
        }
        try {
          result = await runTool(sandbox, call.name, args, task.allowedPaths)
        } catch (error) {
          // A path or command refusal is information for the agent, not a crash:
          // it gets told why and can correct itself on the next turn.
          const refusal =
            error instanceof PathViolation
              ? error.message
              : `That didn't work: ${describeError(error)}`
          result = { output: refusal }
          events.push({
            kind: "error",
            who: "drbug",
            text: refusal.slice(0, 300),
            taskId: task.taskId,
          })
        }

        if (result.wrote) {
          await ctx.runMutation(internal.tasks.recordFile, {
            sessionId,
            path: result.wrote.path,
            content: result.wrote.content,
            byTask: task.taskId,
          })
        }

        input = [...input, functionCallOutput(call.callId, result.output)]
        events.push({
          kind: "tool_call",
          who: buddy,
          text: describeToolCall(call.name, args),
          taskId: task.taskId,
        })
      }

      if (finished) break
      if (events.length)
        await ctx.runMutation(internal.sessions.addEvents, {
          sessionId,
          events,
        })
    }

    await ctx.runMutation(internal.sessions.bumpTurns, {
      sessionId,
      by: Math.max(0, turns - task.turns),
    })

    if (!finished) {
      // Out of turns for this action. Park the conversation and pick it up in a
      // fresh one — the task stays `running`, so claimNext resumes it.
      await ctx.runMutation(internal.tasks.saveHistory, {
        id: task._id,
        history: trimHistory(input),
        turns,
      })
    }

    // A stopped session must not schedule more work. The finished part of the
    // build is already on disk and in the files table, so nothing is lost.
    if (stopped) return

    await ctx.scheduler.runAfter(0, internal.phases.execute.run, { sessionId })
  },
})

/* ════════════════════════════════════════════════════════════════════════
   Helpers
   ════════════════════════════════════════════════════════════════════════ */

function normaliseRole(role: string): Role {
  return role === "tester" || role === "reviewer" ? role : "builder"
}

function startLine(role: Role, taskName: string): string {
  if (role === "tester") return `Time to check it really works: ${taskName}`
  if (role === "reviewer") return `Reading everything over: ${taskName}`
  return `Working on: ${taskName}`
}

/**
 * Finish a task and record its verdict.
 *
 * Only a builder's bad verdict marks the task failed. A tester reporting FAIL
 * and a reviewer reporting NEEDS_CHANGES both did their job correctly — their
 * verdict is the payload, not an error — and marking them failed would block
 * every task that depends on them.
 */
async function completeTask(
  ctx: ActionCtx,
  sessionId: Id<"sessions">,
  taskRowId: Id<"tasks">,
  taskId: string,
  role: Role,
  done: { verdict: string; summary: string }
): Promise<void> {
  const status =
    role === "builder" && !verdictIsGood(done.verdict) ? "failed" : "done"

  await ctx.runMutation(internal.tasks.complete, {
    id: taskRowId,
    status,
    verdict: done.verdict,
    summary: done.summary || "(no summary)",
  })

  if (role === "reviewer") {
    await ctx.runMutation(internal.sessions.recordReview, {
      sessionId,
      verdict: done.verdict,
    })
  }

  if (status === "failed") {
    await ctx.runMutation(internal.sessions.addEvent, {
      sessionId,
      kind: "error",
      who: "drbug",
      mood: "concerned",
      text: `That step didn't finish: ${done.summary.slice(0, 300)}`,
      taskId,
    })
  }
}

/**
 * An OpenAI call blew up mid-task.
 *
 * A rate limit or a blip should not lose the work: save the conversation, let
 * the scheduler try again, and only give up when the task has spent its turns.
 */
async function handleLoopError(
  ctx: ActionCtx,
  sessionId: Id<"sessions">,
  taskRowId: Id<"tasks">,
  input: unknown[],
  turns: number,
  error: unknown
): Promise<void> {
  const detail = describeError(error)

  if (detail.includes("OPENAI_API_KEY")) {
    await failSession(
      ctx,
      sessionId,
      "My brain isn't plugged in yet — a grown-up needs to add the OpenAI key.",
      detail
    )
    return
  }

  await ctx.runMutation(internal.sessions.addEvent, {
    sessionId,
    kind: "error",
    text: detail.slice(0, 1000),
  })

  if (turns + 1 >= MAX_TURNS_PER_TASK) {
    await ctx.runMutation(internal.tasks.complete, {
      id: taskRowId,
      status: "failed",
      verdict: "FAIL",
      summary: "Kept running into trouble and had to stop this step.",
    })
  } else {
    await ctx.runMutation(internal.tasks.saveHistory, {
      id: taskRowId,
      history: trimHistory(input),
      // Count the failed attempt so a persistent error cannot loop for ever.
      turns: turns + 1,
    })
  }

  await ctx.scheduler.runAfter(3_000, internal.phases.execute.run, {
    sessionId,
  })
}
