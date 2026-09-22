/**
 * Blocks → NuggetSpec.
 *
 * This is the piece that turns what a kid connected on the canvas into the
 * contract the build agents read. elisa walks live Blockly block objects; we
 * walk Blockly's *serialized JSON* instead, which makes this module pure —
 * no DOM, no Blockly runtime, fully unit-testable in Node.
 *
 * The shapes below intentionally mirror `blockly/core/serialization/blocks`
 * (`State`) so `Blockly.serialization.workspaces.save()` output drops straight in.
 */

import {
  finalizeSpec,
  type Framework,
  type NuggetSpec,
  type ProjectKind,
  type SpecDraft,
  type SpecWarning,
} from "./spec"

/* ── Block type ids ─────────────────────────────────────────────────────── */

export const BLOCK = {
  goal: "lamine_goal",
  like: "lamine_like",
  feature: "lamine_feature",
  whenThen: "lamine_when_then",
  remembers: "lamine_remembers",
  proof: "lamine_proof",
  style: "lamine_style",
  rule: "lamine_rule",
  show: "lamine_show",
} as const

export type BlockType = (typeof BLOCK)[keyof typeof BLOCK]

/** Blocks that stack in the main body, under the Goal. */
export const BODY_BLOCKS: readonly string[] = [
  BLOCK.like,
  BLOCK.feature,
  BLOCK.whenThen,
  BLOCK.remembers,
  BLOCK.style,
  BLOCK.rule,
  BLOCK.show,
]

/* ── Blockly serialization shapes (structural, not imported) ───────────── */

export interface ConnectionState {
  block?: BlockState
  shadow?: BlockState
}

export interface BlockState {
  type: string
  id?: string
  /** Canvas position, present on top-level blocks. */
  x?: number
  y?: number
  fields?: Record<string, unknown>
  inputs?: Record<string, ConnectionState>
  next?: ConnectionState
}

export interface WorkspaceState {
  blocks?: { languageVersion?: number; blocks?: BlockState[] }
}

/* ── Result ─────────────────────────────────────────────────────────────── */

export interface InterpretResult {
  spec: NuggetSpec | null
  warnings: SpecWarning[]
  /** Kid-facing things to fix, shown next to the GO button. */
  problems: string[]
  /** Blocks left floating, so the UI can highlight them. */
  orphanCount: number
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function str(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" || typeof value === "boolean")
    return String(value)
  return ""
}

function isKind(v: string): v is ProjectKind {
  return v === "game" || v === "website"
}

function isFramework(v: string): v is Framework {
  return v === "canvas" || v === "phaser" || v === "p5" || v === "none"
}

/** Walk a `next` chain into a flat list. */
function chain(first: BlockState | undefined): BlockState[] {
  const out: BlockState[] = []
  let cursor = first
  // Blockly cannot produce a cycle here, but cap anyway so a hand-edited
  // workspace can never hang the interpreter.
  let guard = 0
  while (cursor && guard++ < 500) {
    out.push(cursor)
    cursor = cursor.next?.block
  }
  return out
}

/** Stable per-block id, falling back to position when Blockly omitted one. */
function blockId(block: BlockState, index: number, prefix: string): string {
  return (block.id ?? `${prefix}${index}`).slice(0, 64)
}

/** Read the Proof blocks nested inside a Feature or When/Then. */
function readProofs(
  parent: BlockState,
  requirementId: string,
  out: SpecDraft["behavioralTests"]
): void {
  const nested = parent.inputs?.PROOFS?.block
  chain(nested).forEach((proof, i) => {
    if (proof.type !== BLOCK.proof) return
    const check = str(proof.fields?.CHECK)
    if (!check) return
    out.push({
      id: blockId(proof, i, `${requirementId}-p`),
      when: check,
      // A bare "check that X" reads as: after it runs, X should be true.
      then: check,
      requirementId,
    })
  })
}

/* ── The interpreter ────────────────────────────────────────────────────── */

/**
 * Turn a serialized Blockly workspace into a NuggetSpec.
 *
 * Only the stack hanging off the Goal block counts. Floating blocks are
 * reported via `orphanCount` so the UI can nudge the kid to connect them,
 * which matches how the canvas actually reads: connected means included.
 */
export function interpretWorkspace(
  state: WorkspaceState | null | undefined
): InterpretResult {
  const problems: string[] = []
  const topBlocks = state?.blocks?.blocks ?? []

  const goal = topBlocks.find((b) => b.type === BLOCK.goal)
  if (!goal) {
    return {
      spec: null,
      warnings: [],
      problems: ["Add a Goal block to say what you want to make."],
      orphanCount: topBlocks.length,
    }
  }

  const orphanCount = topBlocks.filter((b) => b !== goal).length

  const kindRaw = str(goal.fields?.KIND)
  const frameworkRaw = str(goal.fields?.FRAMEWORK)
  const kind: ProjectKind = isKind(kindRaw) ? kindRaw : "website"
  let framework: Framework = isFramework(frameworkRaw) ? frameworkRaw : "canvas"
  // A website has no game loop; canvas/phaser/p5 would just confuse the planner.
  if (kind === "website") framework = "none"

  const goalText = str(goal.fields?.GOAL)
  if (!goalText) problems.push("Type what you want to make in the Goal block.")

  const draft: SpecDraft = {
    nugget: { goal: goalText, kind },
    framework,
    requirements: [],
    behavioralTests: [],
    data: [],
    skills: [],
  }

  const body = chain(goal.next?.block)
  let sawShow = false

  body.forEach((block, index) => {
    switch (block.type) {
      case BLOCK.like: {
        const example = str(block.fields?.EXAMPLE)
        if (example) draft.basedOn = example
        break
      }

      case BLOCK.feature: {
        const what = str(block.fields?.WHAT)
        if (!what) break
        const id = blockId(block, index, "r")
        draft.requirements.push({ id, description: what })
        readProofs(block, id, draft.behavioralTests)
        break
      }

      case BLOCK.whenThen: {
        const when = str(block.fields?.WHEN)
        const then = str(block.fields?.THEN)
        if (!when || !then) break
        const id = blockId(block, index, "r")
        draft.requirements.push({
          id,
          description: `When ${when}, then ${then}`,
        })
        draft.behavioralTests.push({
          id: `${id}-main`,
          when,
          then,
          requirementId: id,
        })
        readProofs(block, id, draft.behavioralTests)
        break
      }

      case BLOCK.remembers: {
        const what = str(block.fields?.WHAT)
        if (what) draft.data.push(what)
        break
      }

      case BLOCK.style: {
        const visual = str(block.fields?.VISUAL)
        const personality = str(block.fields?.PERSONALITY)
        if (visual) {
          draft.style = { visual, ...(personality ? { personality } : {}) }
        }
        break
      }

      case BLOCK.rule: {
        const name = str(block.fields?.NAME)
        const prompt = str(block.fields?.PROMPT)
        if (prompt) draft.skills.push({ name: name || "My rule", prompt })
        break
      }

      case BLOCK.show:
        sawShow = true
        break

      default:
        // Unknown block type: ignore rather than fail. Keeps old saved
        // workspaces loadable after we rename or retire a block.
        break
    }
  })

  if (draft.requirements.length === 0) {
    problems.push("Add at least one 'It must…' block so I know what to build.")
  }
  if (!sawShow) {
    problems.push("Snap a 'Show it in my browser' block on the end.")
  }
  if (orphanCount > 0) {
    problems.push(
      orphanCount === 1
        ? "One block isn't connected — join it to the stack or bin it."
        : `${orphanCount} blocks aren't connected — join them to the stack or bin them.`
    )
  }

  // A goal-less draft can't be finalized; bail before zod rejects it.
  if (!goalText) {
    return { spec: null, warnings: [], problems, orphanCount }
  }

  const { spec, warnings } = finalizeSpec(draft)
  return { spec, warnings, problems, orphanCount }
}
