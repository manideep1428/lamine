import { describe, expect, it } from "vitest"

import { assertCommandAllowed, matchesAllowed, PathViolation } from "./paths"
import { TESTS_DIR, validatePlan, type BuildPlan } from "./plan"

/**
 * Two fixes that came out of an audit, kept honest by tests.
 *
 *  1. A tester whose `allowedPaths` miss `tests/` can write no tests at all, and
 *     the failure is silent: the run reports "no checks" and the child's Proof
 *     blocks quietly do nothing.
 *  2. `\benv\b` matched far more than the `env` command, refusing legitimate
 *     agent calls and burning a turn each time.
 */

function plan(overrides: Partial<BuildPlan> = {}): BuildPlan {
  return {
    framework: "canvas",
    explanation: "We'll build a small game.",
    agents: [
      { name: "Codey", role: "builder", persona: "cheerful" },
      { name: "Dr. Bug", role: "tester", persona: "careful" },
    ],
    tasks: [
      {
        taskId: "t1",
        name: "Scaffold",
        description: "Create the files.",
        agentName: "Codey",
        dependsOn: [],
        allowedPaths: ["index.html", "src/"],
        acceptanceCriteria: ["the files exist"],
      },
      {
        taskId: "t2",
        name: "Check it works",
        description: "Write and run the checks.",
        agentName: "Dr. Bug",
        dependsOn: ["t1"],
        allowedPaths: ["src/"],
        acceptanceCriteria: ["every check runs"],
      },
    ],
    ...overrides,
  }
}

describe("validatePlan: the tester can always write tests", () => {
  it("adds the tests folder when the plan forgot it, and says so", () => {
    const result = validatePlan(plan())
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const tester = result.plan.tasks.find((t) => t.taskId === "t2")!
    expect(tester.allowedPaths).toContain(`${TESTS_DIR}/`)
    expect(matchesAllowed("tests/test_t2.js", tester.allowedPaths)).toBe(true)
    expect(result.notes.join(" ")).toMatch(/tests\/ folder/)
  })

  it("leaves an explicit tests grant alone", () => {
    const original = plan()
    original.tasks[1].allowedPaths = ["tests/test_all.js"]

    const result = validatePlan(original)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const tester = result.plan.tasks.find((t) => t.taskId === "t2")!
    expect(tester.allowedPaths).toEqual(["tests/test_all.js"])
    expect(result.notes.join(" ")).not.toMatch(/tests\/ folder/)
  })

  it("does not hand the tests folder to a builder", () => {
    const result = validatePlan(plan())
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const builder = result.plan.tasks.find((t) => t.taskId === "t1")!
    expect(builder.allowedPaths).toEqual(["index.html", "src/"])
  })
})

describe("assertCommandAllowed: env", () => {
  it("still refuses the commands that read the environment", () => {
    for (const cmd of [
      "env",
      "printenv",
      "env | grep KEY",
      "node x.js && env",
    ]) {
      expect(() => assertCommandAllowed(cmd), cmd).toThrow(PathViolation)
    }
  })

  it("no longer refuses ordinary commands that merely contain env", () => {
    for (const cmd of [
      "node --check src/env.js",
      "cat notes.env.txt",
      "node build.env.js",
      "ls environments",
    ]) {
      expect(() => assertCommandAllowed(cmd), cmd).not.toThrow()
    }
  })
})
