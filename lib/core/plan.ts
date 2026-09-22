/**
 * The build plan — what the MetaPlanner returns and how we police it.
 *
 * OpenAI Structured Outputs guarantees the *shape* of this object. It does not
 * guarantee the *meaning*: the model can still emit a task depending on "t9"
 * when no t9 exists, a dependency cycle, or an allowedPaths entry of "../etc".
 * `validatePlan` is what catches those. Schema conformance is not validation.
 *
 * Every field is required (no `.optional()`) because OpenAI strict mode demands
 * it. Absence is expressed as an empty string or empty array.
 */

import { z } from "zod"

import { FRAMEWORKS } from "./spec"
import { normalizeRelPath } from "./paths"

export const AGENT_ROLES = ["builder", "tester", "reviewer"] as const
export type AgentRole = (typeof AGENT_ROLES)[number]

export const PLAN_LIMITS = {
  minTasks: 1,
  maxTasks: 14,
  maxAgents: 6,
  description: 2000,
  persona: 400,
  name: 120,
  maxPathsPerTask: 12,
  maxCriteria: 8,
  criterion: 300,
} as const

export const PlanAgentSchema = z.strictObject({
  name: z.string(),
  role: z.enum(AGENT_ROLES),
  persona: z.string(),
})

export const PlanTaskSchema = z.strictObject({
  taskId: z.string(),
  name: z.string(),
  description: z.string(),
  agentName: z.string(),
  dependsOn: z.array(z.string()),
  allowedPaths: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
})

export const BuildPlanSchema = z.strictObject({
  framework: z.enum(FRAMEWORKS),
  /** One or two sentences a 10-year-old can read, shown in the narrator feed. */
  explanation: z.string(),
  agents: z.array(PlanAgentSchema),
  tasks: z.array(PlanTaskSchema),
})

export type PlanAgent = z.infer<typeof PlanAgentSchema>
export type PlanTask = z.infer<typeof PlanTaskSchema>
export type BuildPlan = z.infer<typeof BuildPlanSchema>

export type ValidationResult =
  | { ok: true; plan: BuildPlan; notes: string[] }
  | { ok: false; errors: string[] }

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

/** Where testers write. Must match `TESTS_DIR` in `lib/core/testing.ts`. */
export const TESTS_DIR = "tests"

/** Does this allowedPaths entry let an agent write inside tests/? */
function grantsTests(pattern: string): boolean {
  const clean = pattern.trim().replace(/^\.\//, "")
  return clean === TESTS_DIR || clean.startsWith(`${TESTS_DIR}/`)
}

function clamp(s: string, max: number): string {
  return s.trim().slice(0, max)
}

/**
 * Detect a cycle in the dependency graph using Kahn's algorithm.
 * Returns the ids that could never be scheduled, or an empty array.
 */
export function findCycle(tasks: readonly PlanTask[]): string[] {
  const indegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()

  for (const t of tasks) {
    indegree.set(t.taskId, 0)
    dependents.set(t.taskId, [])
  }
  for (const t of tasks) {
    for (const dep of t.dependsOn) {
      if (!indegree.has(dep)) continue // unknown deps are reported separately
      indegree.set(t.taskId, (indegree.get(t.taskId) ?? 0) + 1)
      dependents.get(dep)!.push(t.taskId)
    }
  }

  const queue = [...indegree.entries()]
    .filter(([, d]) => d === 0)
    .map(([id]) => id)
  const settled = new Set<string>()

  while (queue.length) {
    const id = queue.shift()!
    settled.add(id)
    for (const next of dependents.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1
      indegree.set(next, remaining)
      if (remaining === 0) queue.push(next)
    }
  }

  return tasks.map((t) => t.taskId).filter((id) => !settled.has(id))
}

/** Topological order. Assumes the plan already passed `validatePlan`. */
export function topoSort(tasks: readonly PlanTask[]): PlanTask[] {
  const byId = new Map(tasks.map((t) => [t.taskId, t]))
  const seen = new Set<string>()
  const out: PlanTask[] = []

  const visit = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    const task = byId.get(id)
    if (!task) return
    for (const dep of task.dependsOn) visit(dep)
    out.push(task)
  }

  for (const t of tasks) visit(t.taskId)
  return out
}

/**
 * Clamp what can be clamped, reject what cannot.
 *
 * Mirrors elisa's `metaPlanner.validate()`: descriptions capped, illegal paths
 * filtered out, every reference resolved. Unlike elisa we do not need the JSON
 * repair step — Structured Outputs handles the shape.
 */
export function validatePlan(input: BuildPlan): ValidationResult {
  const errors: string[] = []
  const notes: string[] = []

  /* ── agents ── */
  if (input.agents.length === 0) errors.push("Plan has no agents.")
  if (input.agents.length > PLAN_LIMITS.maxAgents) {
    errors.push(
      `Plan has ${input.agents.length} agents; the limit is ${PLAN_LIMITS.maxAgents}.`
    )
  }

  const agents: PlanAgent[] = []
  const agentNames = new Set<string>()
  for (const a of input.agents) {
    const name = clamp(a.name, PLAN_LIMITS.name)
    if (!name) {
      errors.push("An agent has an empty name.")
      continue
    }
    if (agentNames.has(name)) {
      errors.push(`Duplicate agent name "${name}".`)
      continue
    }
    agentNames.add(name)
    agents.push({
      name,
      role: a.role,
      persona: clamp(a.persona, PLAN_LIMITS.persona),
    })
  }

  if (!agents.some((a) => a.role === "builder")) {
    errors.push("Plan has no builder agent, so nothing would get written.")
  }

  /* ── tasks ── */
  if (input.tasks.length < PLAN_LIMITS.minTasks)
    errors.push("Plan has no tasks.")
  if (input.tasks.length > PLAN_LIMITS.maxTasks) {
    errors.push(
      `Plan has ${input.tasks.length} tasks; the limit is ${PLAN_LIMITS.maxTasks}.`
    )
  }

  const tasks: PlanTask[] = []
  const taskIds = new Set<string>()
  for (const t of input.tasks) {
    const taskId = t.taskId.trim()
    if (!ID_RE.test(taskId)) {
      errors.push(`Task id "${t.taskId}" is not a simple identifier.`)
      continue
    }
    if (taskIds.has(taskId)) {
      errors.push(`Duplicate task id "${taskId}".`)
      continue
    }
    taskIds.add(taskId)

    const allowedPaths: string[] = []
    for (const p of t.allowedPaths.slice(0, PLAN_LIMITS.maxPathsPerTask)) {
      try {
        // Validate the pattern's base is legal; keep the original pattern so
        // directory/glob semantics survive into matchesAllowed().
        normalizeRelPath(
          p.replace(/\*+$/, "").replace(/\/$/, "") || "index.html"
        )
        allowedPaths.push(p.trim())
      } catch {
        notes.push(`Dropped unsafe path "${p}" from task ${taskId}.`)
      }
    }

    tasks.push({
      taskId,
      name: clamp(t.name, PLAN_LIMITS.name) || taskId,
      description: clamp(t.description, PLAN_LIMITS.description),
      agentName: clamp(t.agentName, PLAN_LIMITS.name),
      dependsOn: [...new Set(t.dependsOn.map((d) => d.trim()).filter(Boolean))],
      allowedPaths,
      acceptanceCriteria: t.acceptanceCriteria
        .slice(0, PLAN_LIMITS.maxCriteria)
        .map((c) => clamp(c, PLAN_LIMITS.criterion))
        .filter(Boolean),
    })
  }

  /* ── cross references ── */
  for (const t of tasks) {
    if (!agentNames.has(t.agentName)) {
      errors.push(
        `Task ${t.taskId} is assigned to unknown agent "${t.agentName}".`
      )
    }
    if (t.dependsOn.includes(t.taskId)) {
      errors.push(`Task ${t.taskId} depends on itself.`)
    }
    for (const dep of t.dependsOn) {
      if (!taskIds.has(dep)) {
        errors.push(
          `Task ${t.taskId} depends on "${dep}", which does not exist.`
        )
      }
    }
    const writes =
      agents.find((a) => a.name === t.agentName)?.role !== "reviewer"
    if (writes && t.allowedPaths.length === 0) {
      errors.push(`Task ${t.taskId} has no files it is allowed to write.`)
    }
  }

  if (errors.length === 0) {
    const stuck = findCycle(tasks)
    if (stuck.length) {
      errors.push(`These tasks form a dependency loop: ${stuck.join(", ")}.`)
    }
  }

  /* ── a tester needs the tests folder ──
     The planner is told this, but a plan that forgets it produces a tester whose
     every write is refused: no tests get written, the run reports "no checks",
     and the child's Proof blocks silently do nothing. Granting it is a repair
     rather than a rejection — the plan is otherwise fine. */
  for (const t of tasks) {
    if (agents.find((a) => a.name === t.agentName)?.role !== "tester") continue
    if (t.allowedPaths.some(grantsTests)) continue
    t.allowedPaths.push(`${TESTS_DIR}/`)
    notes.push(
      `Gave ${t.taskId} the ${TESTS_DIR}/ folder so it can write tests.`
    )
  }

  /* ── one file, one owner ──
     elisa's hardest-won rule: two agents writing the same file means one
     silently overwrites the other. Warn loudly; the builder prompt repeats it. */
  const owners = new Map<string, string[]>()
  for (const t of tasks) {
    for (const p of t.allowedPaths) {
      if (p.includes("*") || p.endsWith("/")) continue // directory grants overlap by design
      owners.set(p, [...(owners.get(p) ?? []), t.taskId])
    }
  }
  for (const [file, ids] of owners) {
    if (ids.length > 1)
      notes.push(
        `"${file}" is claimed by more than one task: ${ids.join(", ")}.`
      )
  }

  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    plan: {
      framework: input.framework,
      explanation: clamp(input.explanation, 600),
      agents,
      tasks,
    },
    notes,
  }
}

/** Shape the execute phase uses to pick what runs next. */
export interface TaskProgress {
  taskId: string
  status: "pending" | "running" | "done" | "failed"
  dependsOn: string[]
}

/**
 * The next task whose dependencies are all done. Returns null when the run is
 * finished or blocked (a failed dependency blocks its dependents forever).
 */
export function nextRunnable<T extends TaskProgress>(
  tasks: readonly T[]
): T | null {
  const status = new Map(tasks.map((t) => [t.taskId, t.status]))
  for (const t of tasks) {
    if (t.status !== "pending") continue
    if (t.dependsOn.every((d) => status.get(d) === "done")) return t
  }
  return null
}

/** True when nothing is left to run — everything is done, failed, or blocked. */
export function isRunComplete(tasks: readonly TaskProgress[]): boolean {
  if (tasks.some((t) => t.status === "running")) return false
  return nextRunnable(tasks) === null
}
