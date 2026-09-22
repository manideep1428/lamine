// @vitest-environment jsdom

/**
 * The block set, tested against real Blockly rather than a mock.
 *
 * Two things are worth this much setup:
 *
 *  1. `check: "lamine_proof"` is the rule that makes a Proof block physically
 *     unable to join the main stack. It is enforced by Blockly, which means the
 *     only honest way to test it is to ask Blockly.
 *  2. `lib/core/blocks.ts` walks Blockly's *serialized JSON* using structural
 *     types it declares itself. If Blockly's output shape ever drifts from those
 *     types, the interpreter silently produces an empty spec — so the round trip
 *     is asserted here, from real blocks to a real NuggetSpec.
 */

import * as Blockly from "blockly/core"
import { beforeAll, describe, expect, it } from "vitest"

import {
  BLOCK_COLOUR,
  BRICK,
  EXAMPLE_CHOICES,
  registerBlocks,
  TRAY,
  VISUAL_CHOICES,
} from "./definitions"
import {
  BLOCK,
  interpretWorkspace,
  type WorkspaceState,
} from "@/lib/core/blocks"
import { readiness } from "@/lib/core/spec"
import { BLANK_WORKSPACE, EXAMPLES } from "@/lib/examples"

const ALL_TYPES = Object.values(BLOCK)

beforeAll(() => {
  registerBlocks()
})

function freshWorkspace(): Blockly.Workspace {
  return new Blockly.Workspace()
}

describe("block registration", () => {
  it("registers all nine blocks", () => {
    for (const type of ALL_TYPES) {
      expect(Blockly.Blocks[type], `${type} is not registered`).toBeDefined()
    }
  })

  it("is safe to call twice, because fast refresh will", () => {
    expect(() => registerBlocks()).not.toThrow()
  })

  it("offers every block in the tray", () => {
    const offered = TRAY.flatMap((group) => group.bricks.map((b) => b.type))
    for (const type of ALL_TYPES) {
      expect(offered, `${type} is missing from the tray`).toContain(type)
    }
    // Nothing offered twice, or a child sees the same brick in two drawers.
    expect(new Set(offered).size).toBe(offered.length)
  })

  it("gives every block a brick colour that exists in the palette", () => {
    for (const type of ALL_TYPES) {
      const colour = BLOCK_COLOUR[type]
      expect(colour, `${type} has no colour`).toBeDefined()
      expect(BRICK[colour], `${colour} is not a brick colour`).toBeDefined()
    }
  })

  it("agrees with the tray about each brick's colour", () => {
    for (const group of TRAY) {
      for (const brick of group.bricks) {
        expect(brick.colour, `${brick.type} disagrees`).toBe(
          BLOCK_COLOUR[brick.type]
        )
      }
    }
  })

  it("keeps the dropdown choices non-empty, or a field renders blank", () => {
    expect(EXAMPLE_CHOICES.length).toBeGreaterThan(0)
    expect(VISUAL_CHOICES.length).toBeGreaterThan(0)
  })
})

describe("connection rules", () => {
  it("lets a Goal take a Feature underneath it", () => {
    const workspace = freshWorkspace()
    const goal = workspace.newBlock(BLOCK.goal)
    const feature = workspace.newBlock(BLOCK.feature)

    expect(
      workspace.connectionChecker.canConnect(
        goal.nextConnection,
        feature.previousConnection,
        false
      )
    ).toBe(true)
  })

  // The rule the whole Proof design rests on.
  it("refuses a Proof block on the main stack", () => {
    const workspace = freshWorkspace()
    const goal = workspace.newBlock(BLOCK.goal)
    const proof = workspace.newBlock(BLOCK.proof)

    expect(
      workspace.connectionChecker.canConnect(
        goal.nextConnection,
        proof.previousConnection,
        false
      )
    ).toBe(false)
  })

  it("accepts a Proof inside a Feature and inside a When/Then", () => {
    const workspace = freshWorkspace()
    for (const parentType of [BLOCK.feature, BLOCK.whenThen]) {
      const parent = workspace.newBlock(parentType)
      const proof = workspace.newBlock(BLOCK.proof)
      const input = parent.getInput("PROOFS")

      expect(input, `${parentType} has no PROOFS input`).not.toBeNull()
      expect(
        workspace.connectionChecker.canConnect(
          input!.connection,
          proof.previousConnection,
          false
        )
      ).toBe(true)
    }
  })

  it("refuses a Feature inside the PROOFS slot", () => {
    const workspace = freshWorkspace()
    const feature = workspace.newBlock(BLOCK.feature)
    const other = workspace.newBlock(BLOCK.remembers)

    expect(
      workspace.connectionChecker.canConnect(
        feature.getInput("PROOFS")!.connection,
        other.previousConnection,
        false
      )
    ).toBe(false)
  })

  it("puts nothing above a Goal and nothing below Show it", () => {
    const workspace = freshWorkspace()
    expect(workspace.newBlock(BLOCK.goal).previousConnection).toBeNull()
    expect(workspace.newBlock(BLOCK.show).nextConnection).toBeNull()
  })
})

describe("real Blockly output feeds the interpreter", () => {
  /** Build a small but complete project the way a kid would. */
  function buildStack(workspace: Blockly.Workspace): void {
    const goal = workspace.newBlock(BLOCK.goal)
    goal.setFieldValue("game", "KIND")
    goal.setFieldValue("dodging falling rocks", "GOAL")
    goal.setFieldValue("canvas", "FRAMEWORK")

    const feature = workspace.newBlock(BLOCK.feature)
    feature.setFieldValue("move with the arrow keys", "WHAT")

    const proof = workspace.newBlock(BLOCK.proof)
    proof.setFieldValue("the player moves when I press a key", "CHECK")
    feature.getInput("PROOFS")!.connection!.connect(proof.previousConnection!)

    const whenThen = workspace.newBlock(BLOCK.whenThen)
    whenThen.setFieldValue("a rock hits the player", "WHEN")
    whenThen.setFieldValue("lose a life", "THEN")

    const remembers = workspace.newBlock(BLOCK.remembers)
    remembers.setFieldValue("my best score", "WHAT")

    const style = workspace.newBlock(BLOCK.style)
    style.setFieldValue("retro", "VISUAL")
    style.setFieldValue("exciting", "PERSONALITY")

    const show = workspace.newBlock(BLOCK.show)

    goal.nextConnection!.connect(feature.previousConnection!)
    feature.nextConnection!.connect(whenThen.previousConnection!)
    whenThen.nextConnection!.connect(remembers.previousConnection!)
    remembers.nextConnection!.connect(style.previousConnection!)
    style.nextConnection!.connect(show.previousConnection!)
  }

  function serialize(workspace: Blockly.Workspace): WorkspaceState {
    return Blockly.serialization.workspaces.save(
      workspace
    ) as unknown as WorkspaceState
  }

  it("produces the spec the agents will build from", () => {
    const workspace = freshWorkspace()
    buildStack(workspace)

    const result = interpretWorkspace(serialize(workspace))

    expect(result.problems).toEqual([])
    expect(result.orphanCount).toBe(0)
    expect(result.spec).not.toBeNull()

    const spec = result.spec!
    expect(spec.nugget).toMatchObject({
      kind: "game",
      goal: "dodging falling rocks",
    })
    expect(spec.framework).toBe("canvas")
    expect(spec.style).toEqual({ visual: "retro", personality: "exciting" })
    expect(spec.data).toEqual(["my best score"])

    expect(spec.requirements.map((r) => r.description)).toEqual([
      "move with the arrow keys",
      "When a rock hits the player, then lose a life",
    ])

    // The Proof block became a real behavioural test tied to its requirement.
    const proofTest = spec.behavioralTests.find(
      (t) => t.when === "the player moves when I press a key"
    )
    expect(proofTest).toBeDefined()
    expect(proofTest!.requirementId).toBe(spec.requirements[0].id)
  })

  it("round-trips through serialize and load without changing the spec", () => {
    const first = freshWorkspace()
    buildStack(first)
    const saved = serialize(first)

    const second = freshWorkspace()
    Blockly.serialization.workspaces.load(
      saved as unknown as Record<string, unknown>,
      second
    )

    expect(interpretWorkspace(serialize(second)).spec).toEqual(
      interpretWorkspace(saved).spec
    )
  })

  it("counts a block the kid left floating", () => {
    const workspace = freshWorkspace()
    buildStack(workspace)
    workspace.newBlock(BLOCK.remembers).setFieldValue("nothing", "WHAT")

    const result = interpretWorkspace(serialize(workspace))
    expect(result.orphanCount).toBe(1)
    expect(result.problems.join(" ")).toMatch(/isn't connected/)
  })

  it("asks for a Goal block when there is only a stray Feature", () => {
    const workspace = freshWorkspace()
    workspace.newBlock(BLOCK.feature).setFieldValue("do something", "WHAT")

    const result = interpretWorkspace(serialize(workspace))
    expect(result.spec).toBeNull()
    expect(result.problems[0]).toMatch(/Goal block/)
  })
})

/**
 * The starter nuggets are hand-written JSON, so nothing else proves they are
 * still loadable by the current block set. If a block is renamed or a field
 * dropped, this is where it shows up — before a kid picks the example and gets
 * an empty canvas.
 */
describe("starter nuggets", () => {
  it.each(EXAMPLES.map((e) => [e.name, e] as const))(
    "%s loads into Blockly and is ready to build",
    (_name, example) => {
      const workspace = new Blockly.Workspace()
      expect(() =>
        Blockly.serialization.workspaces.load(
          example.workspace as unknown as Record<string, unknown>,
          workspace
        )
      ).not.toThrow()

      const saved = Blockly.serialization.workspaces.save(
        workspace
      ) as unknown as WorkspaceState
      const result = interpretWorkspace(saved)

      expect(result.problems).toEqual([])
      expect(result.spec).not.toBeNull()
      expect(readiness(result.spec).ready).toBe(true)
      // Proof blocks survived the round trip as nested statements.
      expect(result.spec!.behavioralTests.length).toBeGreaterThan(0)
    }
  )

  it("offers exactly the examples that exist in the Make it like dropdown", () => {
    expect(EXAMPLE_CHOICES.map(([label]) => label)).toEqual(
      EXAMPLES.map((e) => e.name)
    )
  })

  it("starts a blank project with a Goal block and nothing floating", () => {
    const workspace = new Blockly.Workspace()
    Blockly.serialization.workspaces.load(
      BLANK_WORKSPACE as unknown as Record<string, unknown>,
      workspace
    )
    const result = interpretWorkspace(
      Blockly.serialization.workspaces.save(
        workspace
      ) as unknown as WorkspaceState
    )
    expect(result.orphanCount).toBe(0)
    // No goal text yet, so it is deliberately not ready: the kid types that.
    expect(result.spec).toBeNull()
    expect(result.problems.join(" ")).toMatch(/what you want to make/)
  })
})
