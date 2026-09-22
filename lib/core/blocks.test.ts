import { describe, expect, it } from "vitest"

import { BLANK_WORKSPACE, EXAMPLES, findExample } from "../examples"
import {
  BLOCK,
  interpretWorkspace,
  type BlockState,
  type WorkspaceState,
} from "./blocks"

function ws(blocks: BlockState[]): WorkspaceState {
  return { blocks: { languageVersion: 0, blocks } }
}

function goalWith(
  body: BlockState | undefined,
  fields: Record<string, unknown> = {}
): WorkspaceState {
  const goal: BlockState = {
    type: BLOCK.goal,
    fields: {
      KIND: "game",
      GOAL: "dodging rocks",
      FRAMEWORK: "canvas",
      ...fields,
    },
  }
  if (body) goal.next = { block: body }
  return ws([goal])
}

describe("interpretWorkspace", () => {
  it("reports a missing Goal block instead of throwing", () => {
    const result = interpretWorkspace(
      ws([{ type: BLOCK.feature, fields: { WHAT: "x" } }])
    )
    expect(result.spec).toBeNull()
    expect(result.problems[0]).toContain("Goal block")
  })

  it("handles an empty or absent workspace", () => {
    expect(interpretWorkspace(null).spec).toBeNull()
    expect(interpretWorkspace(undefined).spec).toBeNull()
    expect(interpretWorkspace({}).spec).toBeNull()
    expect(interpretWorkspace(ws([])).spec).toBeNull()
  })

  it("reads the goal fields", () => {
    const result = interpretWorkspace(
      goalWith({
        type: BLOCK.feature,
        fields: { WHAT: "move with the arrow keys" },
        next: { block: { type: BLOCK.show } },
      })
    )
    expect(result.spec).not.toBeNull()
    expect(result.spec!.nugget.goal).toBe("dodging rocks")
    expect(result.spec!.nugget.kind).toBe("game")
    expect(result.spec!.framework).toBe("canvas")
    expect(result.problems).toEqual([])
  })

  it("forces framework to none for a website, since there is no game loop", () => {
    const result = interpretWorkspace(
      goalWith(
        {
          type: BLOCK.feature,
          fields: { WHAT: "say hello" },
          next: { block: { type: BLOCK.show } },
        },
        { KIND: "website", FRAMEWORK: "phaser" }
      )
    )
    expect(result.spec!.framework).toBe("none")
  })

  it("falls back to sane defaults for unknown dropdown values", () => {
    const result = interpretWorkspace(
      goalWith(
        {
          type: BLOCK.feature,
          fields: { WHAT: "do a thing" },
          next: { block: { type: BLOCK.show } },
        },
        { KIND: "spaceship", FRAMEWORK: "unreal" }
      )
    )
    expect(result.spec!.nugget.kind).toBe("website")
    expect(result.spec!.framework).toBe("none")
  })

  it("walks the whole connected stack", () => {
    const result = interpretWorkspace(
      goalWith({
        type: BLOCK.feature,
        id: "f1",
        fields: { WHAT: "move left and right" },
        next: {
          block: {
            type: BLOCK.remembers,
            fields: { WHAT: "my best score" },
            next: {
              block: {
                type: BLOCK.style,
                fields: { VISUAL: "retro", PERSONALITY: "bold" },
                next: { block: { type: BLOCK.show } },
              },
            },
          },
        },
      })
    )
    const spec = result.spec!
    expect(spec.requirements.map((r) => r.description)).toEqual([
      "move left and right",
    ])
    expect(spec.data).toEqual(["my best score"])
    expect(spec.style).toEqual({ visual: "retro", personality: "bold" })
    expect(result.problems).toEqual([])
  })

  it("turns a When/Then block into both a requirement and a behavioural test", () => {
    const result = interpretWorkspace(
      goalWith({
        type: BLOCK.whenThen,
        id: "w1",
        fields: { WHEN: "a rock hits the player", THEN: "lose a life" },
        next: { block: { type: BLOCK.show } },
      })
    )
    const spec = result.spec!
    expect(spec.requirements[0].description).toBe(
      "When a rock hits the player, then lose a life"
    )
    expect(spec.behavioralTests[0]).toMatchObject({
      when: "a rock hits the player",
      then: "lose a life",
      requirementId: "w1",
    })
  })

  it("reads Proof blocks nested inside a Feature and links them to it", () => {
    const result = interpretWorkspace(
      goalWith({
        type: BLOCK.feature,
        id: "f1",
        fields: { WHAT: "move with the arrow keys" },
        inputs: {
          PROOFS: {
            block: {
              type: BLOCK.proof,
              id: "p1",
              fields: { CHECK: "the player moves on keydown" },
              next: {
                block: {
                  type: BLOCK.proof,
                  id: "p2",
                  fields: { CHECK: "the player stays on screen" },
                },
              },
            },
          },
        },
        next: { block: { type: BLOCK.show } },
      })
    )
    const spec = result.spec!
    expect(spec.behavioralTests).toHaveLength(2)
    expect(spec.behavioralTests.map((b) => b.requirementId)).toEqual([
      "f1",
      "f1",
    ])
    expect(spec.behavioralTests[0].when).toBe("the player moves on keydown")
  })

  it("ignores a non-proof block that somehow appears in the PROOFS input", () => {
    const result = interpretWorkspace(
      goalWith({
        type: BLOCK.feature,
        id: "f1",
        fields: { WHAT: "move" },
        inputs: {
          PROOFS: {
            block: { type: BLOCK.feature, fields: { WHAT: "sneaky" } },
          },
        },
        next: { block: { type: BLOCK.show } },
      })
    )
    expect(result.spec!.behavioralTests).toEqual([])
    expect(result.spec!.requirements).toHaveLength(1)
  })

  it("skips blocks with empty text rather than emitting blank requirements", () => {
    const result = interpretWorkspace(
      goalWith({
        type: BLOCK.feature,
        fields: { WHAT: "   " },
        next: { block: { type: BLOCK.show } },
      })
    )
    expect(result.spec!.requirements).toEqual([])
    expect(result.problems.join(" ")).toContain("It must")
  })

  it("counts floating blocks and nudges about them", () => {
    const result = interpretWorkspace(
      ws([
        {
          type: BLOCK.goal,
          fields: { KIND: "game", GOAL: "g", FRAMEWORK: "canvas" },
          next: {
            block: {
              type: BLOCK.feature,
              fields: { WHAT: "w" },
              next: { block: { type: BLOCK.show } },
            },
          },
        },
        { type: BLOCK.feature, fields: { WHAT: "orphan" } },
        { type: BLOCK.proof, fields: { CHECK: "also orphan" } },
      ])
    )
    expect(result.orphanCount).toBe(2)
    expect(result.problems.join(" ")).toContain("2 blocks aren't connected")
    // Orphans must not leak into the spec.
    expect(result.spec!.requirements.map((r) => r.description)).toEqual(["w"])
  })

  it("asks for a Show block when the stack does not end with one", () => {
    const result = interpretWorkspace(
      goalWith({ type: BLOCK.feature, fields: { WHAT: "w" } })
    )
    expect(result.problems.join(" ")).toContain("Show it in my browser")
  })

  it("ignores unknown block types so old saves keep loading", () => {
    const result = interpretWorkspace(
      goalWith({
        type: "lamine_retired_block",
        fields: { WHAT: "x" },
        next: {
          block: {
            type: BLOCK.feature,
            fields: { WHAT: "w" },
            next: { block: { type: BLOCK.show } },
          },
        },
      })
    )
    expect(result.spec!.requirements).toHaveLength(1)
    expect(result.problems).toEqual([])
  })

  it("captures a 'make it like' hint", () => {
    const result = interpretWorkspace(
      goalWith({
        type: BLOCK.like,
        fields: { EXAMPLE: "Space Dodge" },
        next: {
          block: {
            type: BLOCK.feature,
            fields: { WHAT: "w" },
            next: { block: { type: BLOCK.show } },
          },
        },
      })
    )
    expect(result.spec!.basedOn).toBe("Space Dodge")
  })

  it("collects rule blocks as skills", () => {
    const result = interpretWorkspace(
      goalWith({
        type: BLOCK.rule,
        fields: { NAME: "Keep it kind", PROMPT: "use friendly words" },
        next: {
          block: {
            type: BLOCK.feature,
            fields: { WHAT: "w" },
            next: { block: { type: BLOCK.show } },
          },
        },
      })
    )
    expect(result.spec!.skills).toEqual([
      { name: "Keep it kind", prompt: "use friendly words" },
    ])
  })

  it("does not hang on a hand-edited cyclic next chain", () => {
    const a: BlockState = { type: BLOCK.feature, fields: { WHAT: "a" } }
    a.next = { block: a }
    const result = interpretWorkspace(goalWith(a))
    // Capped rather than infinite; the point is that it returns at all.
    expect(result.spec).not.toBeNull()
  })
})

describe("bundled examples", () => {
  it.each(EXAMPLES.map((e) => [e.name, e] as const))(
    "%s interprets into a buildable spec with no problems",
    (_name, example) => {
      const result = interpretWorkspace(example.workspace)
      expect(
        result.problems,
        `problems: ${result.problems.join(" | ")}`
      ).toEqual([])
      expect(result.orphanCount).toBe(0)
      const spec = result.spec!
      expect(spec.nugget.goal.length).toBeGreaterThan(0)
      expect(spec.requirements.length).toBeGreaterThan(0)
      expect(spec.behavioralTests.length).toBeGreaterThan(0)
      // Every behavioural test must point at a requirement that exists.
      const ids = new Set(spec.requirements.map((r) => r.id))
      for (const bt of spec.behavioralTests) {
        if (bt.requirementId) expect(ids.has(bt.requirementId)).toBe(true)
      }
    }
  )

  it("matches the declared category to the interpreted kind", () => {
    const expected = { game: "game", web: "website", device: "device" } as const
    for (const example of EXAMPLES) {
      const spec = interpretWorkspace(example.workspace).spec!
      expect(spec.nugget.kind, example.id).toBe(expected[example.category])
    }
  })

  it("gives a device example its parts and the arduino target", () => {
    for (const example of EXAMPLES.filter((e) => e.category === "device")) {
      const spec = interpretWorkspace(example.workspace).spec!
      // A board project is built as a sketch, whatever the Goal brick's drawing
      // dropdown happens to say.
      expect(spec.framework, example.id).toBe("arduino")
      expect(spec.parts.length, example.id).toBeGreaterThan(0)
      for (const part of spec.parts) {
        expect(part.part, example.id).not.toBe("")
        expect(part.pin, example.id).not.toBe("")
      }
    }
  })

  it("exposes a blank workspace that needs a goal and a feature", () => {
    const result = interpretWorkspace(BLANK_WORKSPACE)
    expect(result.spec).toBeNull()
    expect(result.problems.join(" ")).toContain("Goal block")
  })

  it("finds examples by id", () => {
    expect(findExample("space-dodge")?.name).toBe("Space Dodge")
    expect(findExample("nope")).toBeUndefined()
  })
})
