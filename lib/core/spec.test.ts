import { describe, expect, it } from "vitest"

import {
  CAPS,
  finalizeSpec,
  NuggetSpecSchema,
  readiness,
  type SpecDraft,
} from "./spec"

function draft(overrides: Partial<SpecDraft> = {}): SpecDraft {
  return {
    nugget: { goal: "dodging rocks", kind: "game" },
    framework: "canvas",
    requirements: [{ id: "r1", description: "move with the arrow keys" }],
    behavioralTests: [
      { id: "b1", when: "I press left", then: "the player moves left" },
    ],
    data: [],
    skills: [],
    ...overrides,
  }
}

describe("finalizeSpec", () => {
  it("produces a schema-valid spec", () => {
    const { spec, warnings } = finalizeSpec(draft())
    expect(() => NuggetSpecSchema.parse(spec)).not.toThrow()
    expect(warnings).toEqual([])
    expect(spec.deploy.target).toBe("web")
  })

  it("trims whitespace from text", () => {
    const { spec } = finalizeSpec(
      draft({ nugget: { goal: "  spacey  ", kind: "game" } })
    )
    expect(spec.nugget.goal).toBe("spacey")
  })

  it("clamps an over-long goal and warns instead of failing", () => {
    const { spec, warnings } = finalizeSpec(
      draft({ nugget: { goal: "x".repeat(CAPS.goal + 200), kind: "game" } })
    )
    expect(spec.nugget.goal).toHaveLength(CAPS.goal)
    expect(warnings.some((w) => w.field === "goal")).toBe(true)
  })

  it("clamps over-long lists and warns", () => {
    const many = Array.from({ length: CAPS.requirements + 5 }, (_, i) => ({
      id: `r${i}`,
      description: `thing ${i}`,
    }))
    const { spec, warnings } = finalizeSpec(draft({ requirements: many }))
    expect(spec.requirements).toHaveLength(CAPS.requirements)
    expect(warnings.some((w) => w.field === "requirements")).toBe(true)
  })

  it("drops a behavioural test's parent link when that requirement was clamped away", () => {
    const { spec } = finalizeSpec(
      draft({
        requirements: [{ id: "r1", description: "kept" }],
        behavioralTests: [
          { id: "b1", when: "w", then: "t", requirementId: "r-gone" },
        ],
      })
    )
    expect(spec.behavioralTests[0].requirementId).toBeUndefined()
  })

  it("keeps a valid parent link", () => {
    const { spec } = finalizeSpec(
      draft({
        requirements: [{ id: "r1", description: "kept" }],
        behavioralTests: [
          { id: "b1", when: "w", then: "t", requirementId: "r1" },
        ],
      })
    )
    expect(spec.behavioralTests[0].requirementId).toBe("r1")
  })

  it("omits optional sections rather than emitting empty objects", () => {
    const { spec } = finalizeSpec(draft())
    expect(spec.style).toBeUndefined()
    expect(spec.basedOn).toBeUndefined()
    expect(spec.nugget.description).toBeUndefined()
  })

  it("keeps style personality optional", () => {
    const { spec } = finalizeSpec(draft({ style: { visual: "retro" } }))
    expect(spec.style).toEqual({ visual: "retro" })
  })

  it("rejects unknown keys via the strict schema", () => {
    expect(() =>
      NuggetSpecSchema.parse({ ...finalizeSpec(draft()).spec, sneaky: true })
    ).toThrow()
  })
})

describe("readiness", () => {
  it("is not ready without a spec", () => {
    const r = readiness(null)
    expect(r.ready).toBe(false)
    expect(r.reasons[0]).toContain("Goal block")
  })

  it("is ready with a goal and at least one requirement", () => {
    const { spec } = finalizeSpec(draft())
    expect(readiness(spec).ready).toBe(true)
  })

  it("is not ready with no requirements and no checks", () => {
    const { spec } = finalizeSpec(
      draft({ requirements: [], behavioralTests: [] })
    )
    const r = readiness(spec)
    expect(r.ready).toBe(false)
    expect(r.reasons.join(" ")).toContain("It must")
  })
})
