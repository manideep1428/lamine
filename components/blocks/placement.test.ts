// @vitest-environment jsdom

/**
 * Where a dragged brick actually lands.
 *
 * This is the only logic in the app that disconnects and reconnects live Blockly
 * connections, and getting it wrong silently rearranges a child's project. The
 * drop-target highlight shown during a drag promises a specific position, so these
 * tests check the brick really goes there — against real Blockly, not a mock.
 *
 * Coordinates are workspace coordinates. A headless workspace reports (0,0) for
 * every block, so "drop on this brick" is expressed by passing that brick's own
 * position, which is what `findBlockAt` resolves.
 */

import * as Blockly from "blockly/core"
import { beforeAll, describe, expect, it } from "vitest"

import { addBrick } from "./BlockCanvas"
import { registerBlocks } from "./definitions"
import {
  BLOCK,
  interpretWorkspace,
  type WorkspaceState,
} from "@/lib/core/blocks"

beforeAll(() => registerBlocks())

/** A Goal with one promise, one nested proof, and Show it on the end. */
function seeded() {
  const workspace = new Blockly.Workspace()

  const goal = workspace.newBlock(BLOCK.goal)
  goal.setFieldValue("game", "KIND")
  goal.setFieldValue("dodging rocks", "GOAL")

  const feature = workspace.newBlock(BLOCK.feature)
  feature.setFieldValue("move with the arrow keys", "WHAT")

  const proof = workspace.newBlock(BLOCK.proof)
  proof.setFieldValue("the player moves", "CHECK")
  feature.getInput("PROOFS")!.connection!.connect(proof.previousConnection!)

  const show = workspace.newBlock(BLOCK.show)

  goal.nextConnection!.connect(feature.previousConnection!)
  feature.nextConnection!.connect(show.previousConnection!)

  return { workspace, goal, feature, proof, show }
}

/** The main stack's block types, top to bottom. */
function stack(goal: Blockly.Block): string[] {
  const out: string[] = []
  let cursor: Blockly.Block | null = goal
  while (cursor) {
    out.push(cursor.type)
    cursor = cursor.nextConnection?.targetBlock() ?? null
  }
  return out
}

/** The proofs nested inside a promise, in order. */
function proofsIn(promise: Blockly.Block): string[] {
  const out: string[] = []
  let cursor = promise.getInput("PROOFS")?.connection?.targetBlock() ?? null
  while (cursor) {
    out.push(cursor.getFieldValue("CHECK"))
    cursor = cursor.nextConnection?.targetBlock() ?? null
  }
  return out
}

describe("dropping a brick on a specific target", () => {
  // A headless workspace gives every block the same position, so "the brick I
  // dropped on" resolves to the first one — the Goal. That still exercises the
  // splice, which is the part worth testing: the new brick goes directly under
  // its target rather than being appended to the end.
  it("splices a body brick directly under the brick it was dropped on", () => {
    const { workspace, goal } = seeded()

    const result = addBrick(workspace, BLOCK.remembers, { x: 0, y: 0 })

    expect(result.ok).toBe(true)
    expect(stack(goal)).toEqual([
      BLOCK.goal,
      BLOCK.remembers,
      BLOCK.feature,
      BLOCK.show,
    ])
  })

  it("never leaves the stack broken when splicing", () => {
    const { workspace, goal } = seeded()
    addBrick(workspace, BLOCK.style, { x: 0, y: 0 })
    // Show it is still attached, not orphaned by the disconnect/reconnect.
    expect(workspace.getTopBlocks(false)).toHaveLength(1)
    expect(stack(goal)).toContain(BLOCK.show)
  })

  it("adds a proof to the promise it was dropped on", () => {
    const { workspace, feature } = seeded()

    const result = addBrick(workspace, BLOCK.proof, { x: 0, y: 0 })

    expect(result.ok).toBe(true)
    expect(proofsIn(feature)).toHaveLength(2)
  })

  it("refuses a proof with nowhere to go, and leaves it for the child to move", () => {
    const workspace = new Blockly.Workspace()
    const goal = workspace.newBlock(BLOCK.goal)
    goal.setFieldValue("a game", "GOAL")

    const result = addBrick(workspace, BLOCK.proof, null)

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/Checks go inside a promise/)

    // The brick stays on the canvas rather than vanishing. Deleting a child's
    // work silently would be worse than leaving it loose: the interpreter counts
    // it as an orphan and the studio nudges them to connect it.
    const loose = workspace
      .getAllBlocks(false)
      .filter((b) => b.type === BLOCK.proof)
    expect(loose).toHaveLength(1)

    const saved = Blockly.serialization.workspaces.save(
      workspace
    ) as unknown as WorkspaceState
    expect(interpretWorkspace(saved).orphanCount).toBe(1)
  })
})

describe("tapping a brick, with no drop point", () => {
  it("appends above Show it, because Show it ends the stack", () => {
    const { workspace, goal } = seeded()

    addBrick(workspace, BLOCK.remembers, null)

    expect(stack(goal)).toEqual([
      BLOCK.goal,
      BLOCK.feature,
      BLOCK.remembers,
      BLOCK.show,
    ])
  })

  it("allows only one Goal brick", () => {
    const { workspace } = seeded()
    const result = addBrick(workspace, BLOCK.goal, null)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/already have/)
  })

  it("allows only one Show it brick", () => {
    const { workspace } = seeded()
    const result = addBrick(workspace, BLOCK.show, null)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/already have/)
  })

  it("places the first brick loose when there is no Goal yet", () => {
    const workspace = new Blockly.Workspace()
    const result = addBrick(workspace, BLOCK.goal, null)
    expect(result.ok).toBe(true)
    expect(workspace.getTopBlocks(false)).toHaveLength(1)
  })
})

describe("the result still interprets", () => {
  it("produces a spec the agents can read after a drop", () => {
    const { workspace } = seeded()
    addBrick(workspace, BLOCK.remembers, { x: 0, y: 0 })
    workspace
      .getAllBlocks(false)
      .find((b) => b.type === BLOCK.remembers)!
      .setFieldValue("my best score", "WHAT")

    const saved = Blockly.serialization.workspaces.save(
      workspace
    ) as unknown as WorkspaceState
    const result = interpretWorkspace(saved)

    expect(result.problems).toEqual([])
    expect(result.spec!.data).toEqual(["my best score"])
    expect(result.orphanCount).toBe(0)
  })
})
