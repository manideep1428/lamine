import { describe, expect, it } from "vitest"

import {
  findCycle,
  isRunComplete,
  nextRunnable,
  PLAN_LIMITS,
  topoSort,
  validatePlan,
  type BuildPlan,
  type PlanTask,
} from "./plan"

function task(overrides: Partial<PlanTask> & { taskId: string }): PlanTask {
  return {
    name: `Task ${overrides.taskId}`,
    description: "Do the thing.",
    agentName: "Codey",
    dependsOn: [],
    allowedPaths: ["index.html"],
    acceptanceCriteria: ["it works"],
    ...overrides,
  }
}

function plan(overrides: Partial<BuildPlan> = {}): BuildPlan {
  return {
    framework: "canvas",
    explanation: "I'll build it in a few steps.",
    agents: [{ name: "Codey", role: "builder", persona: "cheerful" }],
    tasks: [task({ taskId: "t1" })],
    ...overrides,
  }
}

describe("validatePlan", () => {
  it("accepts a well-formed plan", () => {
    const result = validatePlan(plan())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.plan.tasks).toHaveLength(1)
      expect(result.notes).toEqual([])
    }
  })

  it("rejects a dangling dependency", () => {
    const result = validatePlan(
      plan({ tasks: [task({ taskId: "t1", dependsOn: ["t9"] })] })
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join(" ")).toContain('depends on "t9"')
  })

  it("rejects a self dependency", () => {
    const result = validatePlan(
      plan({ tasks: [task({ taskId: "t1", dependsOn: ["t1"] })] })
    )
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.errors.join(" ")).toContain("depends on itself")
  })

  it("rejects a dependency cycle", () => {
    const result = validatePlan(
      plan({
        tasks: [
          task({ taskId: "t1", dependsOn: ["t2"] }),
          task({ taskId: "t2", dependsOn: ["t1"] }),
        ],
      })
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join(" ")).toContain("dependency loop")
  })

  it("rejects a task assigned to an unknown agent", () => {
    const result = validatePlan(
      plan({ tasks: [task({ taskId: "t1", agentName: "Ghost" })] })
    )
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.errors.join(" ")).toContain('unknown agent "Ghost"')
  })

  it("rejects a plan with no builder", () => {
    const result = validatePlan(
      plan({
        agents: [{ name: "Checky", role: "tester", persona: "thorough" }],
        tasks: [task({ taskId: "t1", agentName: "Checky" })],
      })
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join(" ")).toContain("no builder")
  })

  it("rejects duplicate task ids", () => {
    const result = validatePlan(
      plan({ tasks: [task({ taskId: "t1" }), task({ taskId: "t1" })] })
    )
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.errors.join(" ")).toContain("Duplicate task id")
  })

  it("rejects a task id that is not a simple identifier", () => {
    const result = validatePlan(plan({ tasks: [task({ taskId: "../t1" })] }))
    expect(result.ok).toBe(false)
  })

  // The critical one: a shape-valid plan can still contain a path escape.
  it("drops unsafe allowedPaths and fails the task when nothing safe remains", () => {
    const result = validatePlan(
      plan({
        tasks: [
          task({
            taskId: "t1",
            allowedPaths: ["../../etc/passwd", "/etc/hosts"],
          }),
        ],
      })
    )
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.errors.join(" ")).toContain(
        "no files it is allowed to write"
      )
  })

  it("keeps safe paths while dropping unsafe ones", () => {
    const result = validatePlan(
      plan({
        tasks: [task({ taskId: "t1", allowedPaths: ["src/", "../evil"] })],
      })
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.plan.tasks[0].allowedPaths).toEqual(["src/"])
      expect(result.notes.join(" ")).toContain("Dropped unsafe path")
    }
  })

  it("allows a reviewer task with no writable files", () => {
    const result = validatePlan(
      plan({
        agents: [
          { name: "Codey", role: "builder", persona: "cheerful" },
          { name: "Sage", role: "reviewer", persona: "careful" },
        ],
        tasks: [
          task({ taskId: "t1" }),
          task({
            taskId: "t2",
            agentName: "Sage",
            allowedPaths: [],
            dependsOn: ["t1"],
          }),
        ],
      })
    )
    expect(result.ok).toBe(true)
  })

  it("notes when two tasks claim the same exact file", () => {
    const result = validatePlan(
      plan({
        tasks: [
          task({ taskId: "t1", allowedPaths: ["index.html"] }),
          task({ taskId: "t2", allowedPaths: ["index.html"] }),
        ],
      })
    )
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.notes.join(" ")).toContain("claimed by more than one task")
  })

  it("enforces the task ceiling", () => {
    const tasks = Array.from({ length: PLAN_LIMITS.maxTasks + 1 }, (_, i) =>
      task({ taskId: `t${i}` })
    )
    const result = validatePlan(plan({ tasks }))
    expect(result.ok).toBe(false)
  })

  it("clamps an over-long description instead of failing", () => {
    const result = validatePlan(
      plan({ tasks: [task({ taskId: "t1", description: "x".repeat(5000) })] })
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.plan.tasks[0].description).toHaveLength(
        PLAN_LIMITS.description
      )
    }
  })
})

describe("findCycle", () => {
  it("returns nothing for an acyclic graph", () => {
    expect(
      findCycle([
        task({ taskId: "a" }),
        task({ taskId: "b", dependsOn: ["a"] }),
      ])
    ).toEqual([])
  })

  it("names the tasks caught in a loop", () => {
    const stuck = findCycle([
      task({ taskId: "a", dependsOn: ["b"] }),
      task({ taskId: "b", dependsOn: ["a"] }),
      task({ taskId: "c" }),
    ])
    expect(stuck.sort()).toEqual(["a", "b"])
  })
})

describe("topoSort", () => {
  it("puts dependencies before dependents", () => {
    const order = topoSort([
      task({ taskId: "c", dependsOn: ["b"] }),
      task({ taskId: "a" }),
      task({ taskId: "b", dependsOn: ["a"] }),
    ]).map((t) => t.taskId)
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"))
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("c"))
  })
})

describe("nextRunnable", () => {
  const progress = (
    taskId: string,
    status: "pending" | "running" | "done" | "failed",
    deps: string[] = []
  ) => ({
    taskId,
    status,
    dependsOn: deps,
  })

  it("picks a pending task with satisfied dependencies", () => {
    const next = nextRunnable([
      progress("a", "done"),
      progress("b", "pending", ["a"]),
    ])
    expect(next?.taskId).toBe("b")
  })

  it("skips a task whose dependency is not done", () => {
    expect(
      nextRunnable([progress("a", "running"), progress("b", "pending", ["a"])])
    ).toBeNull()
  })

  it("treats a failed dependency as permanently blocking", () => {
    expect(
      nextRunnable([progress("a", "failed"), progress("b", "pending", ["a"])])
    ).toBeNull()
  })

  it("reports completion only when nothing can run", () => {
    expect(isRunComplete([progress("a", "done")])).toBe(true)
    expect(isRunComplete([progress("a", "running")])).toBe(false)
    expect(isRunComplete([progress("a", "pending")])).toBe(false)
    // Blocked by a failure counts as complete: there is nothing left to do.
    expect(
      isRunComplete([progress("a", "failed"), progress("b", "pending", ["a"])])
    ).toBe(true)
  })
})
