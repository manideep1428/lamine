import { describe, expect, it } from "vitest"

import { interpretWorkspace, BLOCK } from "./blocks"
import { buildSystemPrompt, buildTaskPrompt } from "./prompts/shared"
import { metaPlannerUser } from "./prompts/planner"
import { finalizeSpec, type SpecDraft } from "./spec"
import { TOOL, toolNamesFor } from "./tools"
import { EXAMPLES } from "../examples"

/**
 * Looking things up on the web.
 *
 * The rule that makes this safe for a public, static, child-built project: the
 * lookup happens while the project is being built, and what comes back is written
 * in as ordinary content. The finished project never fetches anything and carries
 * no API key — a published project is public source that anyone can read.
 *
 * These tests pin that rule down in the prompts, and pin down that the tool is
 * never offered when it cannot work.
 */

function specWith(lookups: string[]) {
  const draft: SpecDraft = {
    nugget: { goal: "a page about volcanoes", kind: "website" },
    framework: "none",
    requirements: [{ id: "r1", description: "show three facts" }],
    behavioralTests: [],
    data: [],
    lookups,
    skills: [],
  }
  return finalizeSpec(draft).spec
}

describe("the look up brick", () => {
  it("carries what to read about into the spec", () => {
    const state = {
      blocks: {
        blocks: [
          {
            type: BLOCK.goal,
            fields: { KIND: "website", GOAL: "a page about volcanoes" },
            next: {
              block: {
                type: BLOCK.lookup,
                fields: { WHAT: "how volcanoes erupt" },
                next: {
                  block: {
                    type: BLOCK.feature,
                    fields: { WHAT: "show three facts" },
                    next: { block: { type: BLOCK.show } },
                  },
                },
              },
            },
          },
        ],
      },
    }

    const result = interpretWorkspace(state)
    expect(result.problems).toEqual([])
    expect(result.spec!.lookups).toEqual(["how volcanoes erupt"])
  })

  it("caps how many lookups one project can ask for", () => {
    const many = Array.from({ length: 12 }, (_, i) => `thing ${i}`)
    const spec = specWith(many)
    expect(spec.lookups.length).toBeLessThanOrEqual(5)
  })
})

describe("the tool is only offered when it can work", () => {
  it("is absent by default", () => {
    expect(toolNamesFor("builder")).not.toContain(TOOL.lookUp)
  })

  it("appears for a builder once lookups are allowed", () => {
    expect(toolNamesFor("builder", { canLookUp: true })).toContain(TOOL.lookUp)
  })

  it("is never given to a reviewer, which only reads the project", () => {
    expect(toolNamesFor("reviewer", { canLookUp: true })).not.toContain(
      TOOL.lookUp
    )
  })
})

describe("the no-runtime-fetch rule", () => {
  const spec = specWith(["how volcanoes erupt"])

  it("tells the builder to bake what it learns in, and never to fetch at runtime", () => {
    const prompt = buildTaskPrompt({
      taskId: "t1",
      taskName: "Write the page",
      description: "Put the facts on the page.",
      acceptanceCriteria: [],
      spec,
      predecessors: [],
      fileManifest: [],
    })

    expect(prompt).toContain("how volcanoes erupt")
    expect(prompt).toMatch(/must NOT fetch anything at runtime/)
    expect(prompt).toMatch(/no API key/)
    expect(prompt).toMatch(/your own words/)
  })

  it("tells the planner to schedule the lookup", () => {
    const planner = metaPlannerUser(spec)
    expect(planner).toContain("how volcanoes erupt")
    expect(planner).toMatch(/never\s+fetches anything itself/)
  })

  it("says nothing about the web when the child asked for nothing", () => {
    const quiet = buildSystemPrompt({
      role: "builder",
      agentName: "Codey",
      persona: "careful",
      spec: specWith([]),
      allowedPaths: ["index.html"],
      maxTurns: 10,
    })
    expect(quiet).not.toContain("look_up")
  })
})

describe("the bundled example", () => {
  it("ships a website starter that uses a lookup and is ready to build", () => {
    const example = EXAMPLES.find((e) => e.id === "volcano-facts")
    expect(example, "no lookup example is bundled").toBeDefined()

    const result = interpretWorkspace(example!.workspace)
    expect(result.problems).toEqual([])
    expect(result.spec!.lookups.length).toBeGreaterThan(0)
    expect(result.spec!.nugget.kind).toBe("website")
  })
})
