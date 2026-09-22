// @vitest-environment jsdom

/**
 * The rules that Blockly cannot express.
 *
 * Connection types enforce *shape*: a Proof fits inside a promise and nowhere
 * else. They cannot enforce *meaning* — "only one of these per project" — because
 * a second "Make it like" brick is a perfectly legal shape that quietly
 * contradicts the first.
 *
 * So those rules live in code, in the two places a duplicate can appear: the tray
 * refuses to hand one out, and the interpreter reports one that arrived by
 * copy-paste, by dragging, or from a project saved before the rule existed.
 */

import * as Blockly from "blockly/core"
import { beforeAll, describe, expect, it } from "vitest"

import { addBrick } from "./BlockCanvas"
import { registerBlocks } from "./definitions"
import {
  BLOCK,
  interpretWorkspace,
  ONE_PER_PROJECT,
  type WorkspaceState,
} from "@/lib/core/blocks"

beforeAll(() => registerBlocks())

/** Build a stack from block types, returning the serialized workspace. */
function build(
  kind: string,
  body: { type: string; fields?: Record<string, string> }[]
): WorkspaceState {
  const workspace = new Blockly.Workspace()
  const goal = workspace.newBlock(BLOCK.goal)
  goal.setFieldValue(kind, "KIND")
  goal.setFieldValue("a thing", "GOAL")

  let tail: Blockly.Block = goal
  for (const spec of body) {
    const block = workspace.newBlock(spec.type)
    for (const [name, value] of Object.entries(spec.fields ?? {})) {
      block.setFieldValue(value, name)
    }
    tail.nextConnection!.connect(block.previousConnection!)
    tail = block
  }

  return Blockly.serialization.workspaces.save(
    workspace
  ) as unknown as WorkspaceState
}

const feature = { type: BLOCK.feature, fields: { WHAT: "do the thing" } }

describe("one per project", () => {
  it("refuses a second one from the tray, for every brick in the table", () => {
    for (const [type, label] of Object.entries(ONE_PER_PROJECT)) {
      const workspace = new Blockly.Workspace()
      // Seed a Goal so body bricks have somewhere to attach.
      workspace.newBlock(BLOCK.goal)
      if (type !== BLOCK.goal) addBrick(workspace, type, null)

      const second = addBrick(workspace, type, null)

      expect(second.ok, `${label} allowed a second copy`).toBe(false)
      expect(second.message, label).toMatch(/already have/)
    }
  })

  it("counts a spare left floating, not just the connected stack", () => {
    const workspace = new Blockly.Workspace()
    workspace.newBlock(BLOCK.goal)
    // A loose one, never attached — the child can still drag it in.
    workspace.newBlock(BLOCK.style).moveBy(400, 400)

    expect(addBrick(workspace, BLOCK.style, null).ok).toBe(false)
  })

  it("reports a duplicate that got in another way, rather than ignoring it", () => {
    const state = build("game", [
      feature,
      { type: BLOCK.like, fields: { EXAMPLE: "Pong" } },
      { type: BLOCK.like, fields: { EXAMPLE: "Space Dodge" } },
      { type: BLOCK.show },
    ])

    const result = interpretWorkspace(state)

    expect(result.problems.join(" ")).toMatch(/2 .*Make it like.* bricks/)
    // The top one wins, so the outcome does not depend on stack order luck.
    expect(result.spec!.basedOn).toBe("Pong")
  })

  it("uses the top 'Make it look' brick and flags the rest", () => {
    const state = build("game", [
      feature,
      { type: BLOCK.style, fields: { VISUAL: "retro", PERSONALITY: "bold" } },
      { type: BLOCK.style, fields: { VISUAL: "pastel", PERSONALITY: "soft" } },
      { type: BLOCK.show },
    ])

    const result = interpretWorkspace(state)

    expect(result.spec!.style?.visual).toBe("retro")
    expect(result.problems.join(" ")).toMatch(/Make it look/)
  })

  it("stays quiet when each one appears once", () => {
    const state = build("game", [
      feature,
      { type: BLOCK.like, fields: { EXAMPLE: "Pong" } },
      { type: BLOCK.style, fields: { VISUAL: "retro", PERSONALITY: "bold" } },
      { type: BLOCK.show },
    ])

    expect(interpretWorkspace(state).problems).toEqual([])
  })

  it("still allows many of the bricks that repeat for a reason", () => {
    const state = build("game", [
      feature,
      { type: BLOCK.feature, fields: { WHAT: "also do this" } },
      { type: BLOCK.remembers, fields: { WHAT: "my best score" } },
      { type: BLOCK.remembers, fields: { WHAT: "my name" } },
      {
        type: BLOCK.rule,
        fields: { NAME: "Be kind", PROMPT: "use kind words" },
      },
      {
        type: BLOCK.rule,
        fields: { NAME: "Be clear", PROMPT: "use short words" },
      },
      { type: BLOCK.show },
    ])

    const result = interpretWorkspace(state)
    expect(result.problems).toEqual([])
    expect(result.spec!.requirements).toHaveLength(2)
    expect(result.spec!.data).toHaveLength(2)
    expect(result.spec!.skills).toHaveLength(2)
  })
})

describe("wiring rules for a board", () => {
  it("refuses two parts on one pin, naming both", () => {
    const state = build("device", [
      { type: BLOCK.part, fields: { PART: "LED", PIN: "13" } },
      { type: BLOCK.part, fields: { PART: "buzzer", PIN: "13" } },
      feature,
      { type: BLOCK.show },
    ])

    const problems = interpretWorkspace(state).problems.join(" ")
    expect(problems).toMatch(/LED/)
    expect(problems).toMatch(/buzzer/)
    expect(problems).toMatch(/pin 13/)
  })

  it("accepts the same part twice on different pins", () => {
    const state = build("device", [
      { type: BLOCK.part, fields: { PART: "LED", PIN: "13" } },
      { type: BLOCK.part, fields: { PART: "LED", PIN: "12" } },
      feature,
      { type: BLOCK.show },
    ])

    expect(interpretWorkspace(state).problems).toEqual([])
  })

  it("asks which pin, when a part has none", () => {
    const state = build("device", [
      { type: BLOCK.part, fields: { PART: "LED", PIN: "" } },
      feature,
      { type: BLOCK.show },
    ])

    expect(interpretWorkspace(state).problems.join(" ")).toMatch(
      /which pin the LED/
    )
  })
})
