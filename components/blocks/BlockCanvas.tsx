"use client"

/**
 * Blockly, mounted.
 *
 * Everything that makes the canvas feel real — connectors, snapping, nesting,
 * undo/redo, keyboard navigation, serialization — comes from Blockly. Nothing in
 * here re-implements drag and drop between blocks, and nothing should.
 *
 * Three departures from a stock setup:
 *
 *  1. The `lego` renderer (components/blocks/legoRenderer.ts) gives the brick
 *     silhouette and fixes the text colours Blockly forces on itself.
 *  2. Blockly's toolbox is switched off. `BrickTray` adds bricks by tap or by
 *     dragging onto the canvas, so a child can use whichever they reach for.
 *  3. Selection is reported upward, so the studio can offer a real textarea for
 *     the sentences a child writes — the block itself only shows a short version.
 *
 * Loaded with `ssr: false` by the studio: Blockly touches the DOM at import time.
 */

import * as Blockly from "blockly/core"
import * as En from "blockly/msg/en"
import { useEffect, useImperativeHandle, useRef, type Ref } from "react"

import { lamineTheme, registerBlocks } from "@/components/blocks/definitions"
import {
  LEGO_RENDERER,
  registerLegoRenderer,
} from "@/components/blocks/legoRenderer"
import { BLOCK, ONE_PER_PROJECT, type WorkspaceState } from "@/lib/core/blocks"

/** What happened when a child added a brick. */
export interface AddResult {
  ok: boolean
  /** Kid-facing nudge when the brick had nowhere legal to go. */
  message?: string
}

/** One editable field on the selected brick. */
export interface BrickField {
  name: string
  kind: "text" | "choice"
  value: string
  options?: { label: string; value: string }[]
}

/** The selected brick, flattened for the editor panel. */
export interface BrickSelection {
  blockId: string
  type: string
  fields: BrickField[]
}

/** Where a dragged brick was dropped, in client coordinates. */
export interface DropPoint {
  clientX: number
  clientY: number
}

export interface BlockCanvasHandle {
  /** Snap a new brick onto the stack. `at` places it there if it cannot connect. */
  addBrick: (type: string, at?: DropPoint) => AddResult
  /** Highlight target block under drag cursor, or clear highlight if null. */
  highlightTarget: (at: DropPoint | null) => void
  /** Write a field on a brick, from the editor panel. */
  setField: (blockId: string, field: string, value: string) => void
  /** Remove a brick and everything nested inside it. */
  removeBrick: (blockId: string) => void
  load: (state: WorkspaceState) => void
  resize: () => void
  undo: () => void
  redo: () => void
}

interface BlockCanvasProps {
  initialWorkspace?: WorkspaceState | null
  onChange: (state: WorkspaceState) => void
  onSelect: (selection: BrickSelection | null) => void
  /** True while a build is running: the bricks are the brief, so they freeze. */
  readOnly?: boolean
  handleRef?: Ref<BlockCanvasHandle>
}

let localeSet = false

/** Blocks that can hold Proof bricks inside them. */
const PROMISE_TYPES = new Set<string>([BLOCK.feature, BLOCK.whenThen])

export function BlockCanvas({
  initialWorkspace,
  onChange,
  onSelect,
  readOnly = false,
  handleRef,
}: BlockCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null)
  const highlightedBlockRef = useRef<Blockly.BlockSvg | null>(null)

  // Read the latest props from inside the one-shot inject effect without making it
  // re-run and rebuild the whole canvas.
  const onChangeRef = useRef(onChange)
  const onSelectRef = useRef(onSelect)
  const initialRef = useRef(initialWorkspace)
  useEffect(() => {
    onChangeRef.current = onChange
    onSelectRef.current = onSelect
    initialRef.current = initialWorkspace
  })

  useImperativeHandle(handleRef, () => ({
    addBrick(type: string, at?: DropPoint) {
      const workspace = workspaceRef.current
      const container = containerRef.current
      if (highlightedBlockRef.current) {
        highlightedBlockRef.current
          .getSvgRoot()
          ?.classList.remove("lamine-drop-target")
        highlightedBlockRef.current = null
      }
      if (!workspace || !container) return { ok: false }
      return addBrick(
        workspace,
        type,
        at ? toWorkspaceXY(workspace, container, at) : null
      )
    },
    highlightTarget(at: DropPoint | null) {
      const workspace = workspaceRef.current
      const container = containerRef.current
      if (!workspace || !container || !at) {
        if (highlightedBlockRef.current) {
          highlightedBlockRef.current
            .getSvgRoot()
            ?.classList.remove("lamine-drop-target")
          highlightedBlockRef.current = null
        }
        return
      }
      const xy = toWorkspaceXY(workspace, container, at)
      const target = findBlockAt(workspace, xy) as Blockly.BlockSvg | null
      if (target !== highlightedBlockRef.current) {
        highlightedBlockRef.current
          ?.getSvgRoot()
          ?.classList.remove("lamine-drop-target")
        target?.getSvgRoot()?.classList.add("lamine-drop-target")
        highlightedBlockRef.current = target
      }
    },
    setField(blockId: string, field: string, value: string) {
      const block = workspaceRef.current?.getBlockById(blockId)
      if (!block) return
      // Same value, no event: otherwise every keystroke is an undo step.
      if (block.getFieldValue(field) === value) return
      block.setFieldValue(value, field)
    },
    removeBrick(blockId: string) {
      const block = workspaceRef.current?.getBlockById(blockId)
      block?.dispose(true)
    },
    load(state: WorkspaceState) {
      const workspace = workspaceRef.current
      if (workspace) loadInto(workspace, state)
    },
    resize() {
      if (workspaceRef.current) Blockly.svgResize(workspaceRef.current)
    },
    undo() {
      workspaceRef.current?.undo(false)
    },
    redo() {
      workspaceRef.current?.undo(true)
    },
  }))

  /* ── inject once ── */
  useEffect(() => {
    const container = containerRef.current
    if (!container || workspaceRef.current) return

    if (!localeSet) {
      // `blockly/core` ships without messages; without these the trashcan and
      // context menus render as blanks.
      Blockly.setLocale(En as unknown as Record<string, string>)
      localeSet = true
    }
    registerBlocks()
    registerLegoRenderer()

    const workspace = Blockly.inject(container, {
      // No toolbox: BrickTray is the palette.
      theme: lamineTheme,
      renderer: LEGO_RENDERER,
      grid: { spacing: 24, length: 0, colour: "transparent", snap: true },
      zoom: {
        controls: false,
        wheel: true,
        startScale: 0.95,
        maxScale: 2,
        minScale: 0.35,
      },
      move: { scrollbars: true, drag: true, wheel: false },
      trashcan: true,
      sounds: false,
    })
    workspaceRef.current = workspace

    // Load before listening, so restoring a saved project does not immediately
    // look like a change the kid made.
    if (initialRef.current) loadInto(workspace, initialRef.current)

    const handleChange = (event: Blockly.Events.Abstract) => {
      if (event.type === Blockly.Events.SELECTED) {
        const id = (event as Blockly.Events.Selected).newElementId
        const block = id ? workspace.getBlockById(id) : null
        onSelectRef.current(block ? describe(block) : null)
        return
      }

      // Selecting, scrolling and opening a menu are not edits.
      if (event.isUiEvent) return
      if (workspace.isDragging()) return

      onChangeRef.current(
        Blockly.serialization.workspaces.save(
          workspace
        ) as unknown as WorkspaceState
      )

      // A field edited on the canvas has to be reflected back in the panel.
      if (event.type === Blockly.Events.BLOCK_CHANGE) {
        const id = (event as Blockly.Events.BlockChange).blockId
        const block = id ? workspace.getBlockById(id) : null
        if (block && Blockly.common.getSelected()?.id === id) {
          onSelectRef.current(describe(block))
        }
      }
    }
    workspace.addChangeListener(handleChange)

    const observer = new ResizeObserver(() => Blockly.svgResize(workspace))
    observer.observe(container)

    return () => {
      observer.disconnect()
      workspace.removeChangeListener(handleChange)
      workspace.dispose()
      workspaceRef.current = null
    }
  }, [])

  /* ── read-only while building ── */
  useEffect(() => {
    const workspace = workspaceRef.current
    if (!workspace) return
    workspace.options.readOnly = readOnly
  }, [readOnly])

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="h-full w-full"
        data-testid="block-canvas"
      />
      {readOnly ? (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
          <span className="brick bg-brick-blue px-4 py-2 text-sm">
            Building — your bricks are locked while I work
          </span>
        </div>
      ) : null}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   Selection
   ════════════════════════════════════════════════════════════════════════ */

/** Flatten a block's editable fields for the editor panel. */
function describe(block: Blockly.Block): BrickSelection {
  const fields: BrickField[] = []

  for (const input of block.inputList) {
    for (const field of input.fieldRow) {
      if (!field.EDITABLE || !field.name) continue

      if (field instanceof Blockly.FieldDropdown) {
        // A dropdown option's label can be an image or an element, not only text.
        // Ours are all text; anything else falls back to its value so the panel
        // never renders an empty choice.
        const options: { label: string; value: string }[] = []
        for (const [label, value] of field.getOptions(false)) {
          if (typeof value !== "string") continue
          options.push({
            label: typeof label === "string" ? label : value,
            value,
          })
        }
        fields.push({
          name: field.name,
          kind: "choice",
          value: String(field.getValue() ?? ""),
          options,
        })
      } else {
        fields.push({
          name: field.name,
          kind: "text",
          value: String(field.getValue() ?? ""),
        })
      }
    }
  }

  return { blockId: block.id, type: block.type, fields }
}

/* ════════════════════════════════════════════════════════════════════════
   Adding bricks
   ════════════════════════════════════════════════════════════════════════ */

/** Client coordinates → workspace coordinates, accounting for pan and zoom. */
function toWorkspaceXY(
  workspace: Blockly.WorkspaceSvg,
  container: HTMLElement,
  at: DropPoint
): { x: number; y: number } {
  const rect = container.getBoundingClientRect()
  const origin = workspace.getOriginOffsetInPixels()
  const scale = workspace.getScale()
  return {
    x: (at.clientX - rect.left - origin.x) / scale,
    y: (at.clientY - rect.top - origin.y) / scale,
  }
}

/**
 * Find the block nearest to a drop point in workspace coordinates.
 *
 * If the point is inside one or more blocks (e.g. nested Proof in a Feature),
 * returns the innermost (smallest area) block. If not inside any block, returns
 * the nearest block within `maxDistance` pixels (default 48px).
 */
export function findBlockAt(
  workspace: Blockly.Workspace,
  dropAt: { x: number; y: number },
  maxDistance = 48
): Blockly.Block | null {
  const blocks = workspace.getAllBlocks(false)
  if (blocks.length === 0) return null

  let bestInside: { block: Blockly.Block; area: number } | null = null
  let bestNear: {
    block: Blockly.Block
    distance: number
    area: number
  } | null = null

  for (const block of blocks) {
    let rect: {
      top: number
      bottom: number
      left: number
      right: number
      contains?: (x: number, y: number) => boolean
      getWidth?: () => number
      getHeight?: () => number
    }

    if (
      typeof (block as unknown as { getBoundingRectangle?: () => unknown })
        .getBoundingRectangle === "function"
    ) {
      rect = (
        block as unknown as { getBoundingRectangle: () => typeof rect }
      ).getBoundingRectangle()
    } else {
      const pos = block.getRelativeToSurfaceXY()
      rect = {
        top: pos.y,
        bottom: pos.y + 48,
        left: pos.x,
        right: pos.x + 160,
      }
    }

    const width = rect.getWidth ? rect.getWidth() : rect.right - rect.left
    const height = rect.getHeight ? rect.getHeight() : rect.bottom - rect.top
    const area = Math.max(1, width * height)

    const isInside =
      typeof rect.contains === "function"
        ? rect.contains(dropAt.x, dropAt.y)
        : dropAt.x >= rect.left &&
          dropAt.x <= rect.right &&
          dropAt.y >= rect.top &&
          dropAt.y <= rect.bottom

    if (isInside) {
      if (!bestInside || area < bestInside.area) {
        bestInside = { block, area }
      }
    } else if (!bestInside) {
      const dx = Math.max(rect.left - dropAt.x, 0, dropAt.x - rect.right)
      const dy = Math.max(rect.top - dropAt.y, 0, dropAt.y - rect.bottom)
      const distance = Math.hypot(dx, dy)

      if (distance <= maxDistance) {
        if (
          !bestNear ||
          distance < bestNear.distance ||
          (distance === bestNear.distance && area < bestNear.area)
        ) {
          bestNear = { block, distance, area }
        }
      }
    }
  }

  return bestInside?.block ?? bestNear?.block ?? null
}

/**
 * Create a brick and connect it where it belongs.
 *
 * If a drop point is provided and hits an existing brick on the canvas:
 *  - Dropping a Proof brick onto a Feature or When/Then places it in that
 *    promise's PROOFS slot; dropping onto an existing Proof splices after it.
 *  - Dropping a Body brick onto Goal inserts it as the first item under Goal.
 *  - Dropping a Body brick onto Show it inserts it immediately above Show it.
 *  - Dropping a Body brick onto another Body brick splices it directly after it.
 *  - Dropping a Body brick onto a Proof block inserts it after the parent promise.
 *
 * If dropped in open space or tapped from the tray:
 *  - Body bricks go on the end of the stack, but above "Show it".
 *  - Proof bricks go inside the last promise on the stack.
 *
 * A brick that cannot connect is parked at `dropAt` with a kid-facing message.
 * All operations happen within one Blockly event group so one add is one undo.
 */
/**
 * Create a brick and connect it where it belongs.
 *
 * `dropAt` is where the child let go. When it lands on or near an existing brick,
 * the new one is spliced in there — which is what the drop-target highlight during
 * the drag has been promising. Without that, the highlight would point at one
 * place and the brick would appear in another.
 *
 * Exported for `placement.test.ts`: this is the most intricate logic in the UI
 * (it disconnects and reconnects live connections) and it is worth testing against
 * real Blockly rather than by eye.
 */
export function addBrick(
  workspace: Blockly.Workspace,
  type: string,
  dropAt: { x: number; y: number } | null
): AddResult {
  const tops = workspace.getTopBlocks(true)
  const goal = tops.find((b) => b.type === BLOCK.goal)

  // One-per-project bricks, checked across the whole workspace rather than only
  // the connected stack: a spare left floating still counts, because the child can
  // drag it in at any moment.
  const onlyOne = ONE_PER_PROJECT[type]
  if (onlyOne && workspace.getAllBlocks(false).some((b) => b.type === type)) {
    return {
      ok: false,
      message: `You already have a “${onlyOne}…” brick, and one is all it takes.`,
    }
  }

  Blockly.Events.setGroup(true)
  try {
    const block = workspace.newBlock(type)
    if ((workspace as Blockly.WorkspaceSvg).rendered) {
      ;(block as Blockly.BlockSvg).initSvg()
      ;(block as Blockly.BlockSvg).render()
    }

    const park = () => {
      if (dropAt) block.moveBy(dropAt.x, dropAt.y)
      else block.moveBy(48, 40)
    }

    if (type === BLOCK.goal || !goal) {
      park()
      return { ok: true }
    }

    const chain = stackOf(goal)
    const targetBlock = dropAt ? findBlockAt(workspace, dropAt) : null

    // ── 1. PROOF BRICKS ──────────────────────────────────────────────────
    if (type === BLOCK.proof) {
      if (targetBlock) {
        // Target is an existing Proof block: splice after it
        if (targetBlock.type === BLOCK.proof) {
          const nextConn = targetBlock.nextConnection
          const childConn = nextConn?.targetConnection
          if (childConn) nextConn?.disconnect()
          nextConn?.connect(block.previousConnection!)
          if (childConn && block.nextConnection) {
            block.nextConnection.connect(childConn)
          }
          return { ok: true }
        }

        // Target is a promise (Feature or When/Then): add to its PROOFS slot
        if (PROMISE_TYPES.has(targetBlock.type)) {
          const slot = targetBlock.getInput("PROOFS")?.connection
          if (slot) {
            let tail = slot.targetBlock()
            while (tail?.nextConnection?.targetBlock()) {
              tail = tail.nextConnection.targetBlock()
            }
            const targetConn = tail?.nextConnection ?? slot
            targetConn.connect(block.previousConnection!)
            return { ok: true }
          }
        }
      }

      // Fallback: find the last promise block in the stack
      const holder = [...chain].reverse().find((b) => PROMISE_TYPES.has(b.type))
      const slot = holder?.getInput("PROOFS")?.connection
      if (!slot) {
        park()
        return {
          ok: false,
          message:
            "Checks go inside a promise. Add an “It must…” brick, then drop this in it.",
        }
      }
      let tail = slot.targetBlock()
      while (tail?.nextConnection?.targetBlock()) {
        tail = tail.nextConnection.targetBlock()
      }
      ;(tail?.nextConnection ?? slot).connect(block.previousConnection!)
      return { ok: true }
    }

    // ── 2. SHOW IT BRICK ─────────────────────────────────────────────────
    if (type === BLOCK.show) {
      const existingShow = chain.find((b) => b.type === BLOCK.show)
      if (existingShow) {
        park()
        return {
          ok: false,
          message:
            "You already have a 'Show it in my browser' brick — it finishes the stack.",
        }
      }
      const last = chain[chain.length - 1]
      if (last.nextConnection) {
        last.nextConnection.connect(block.previousConnection!)
        return { ok: true }
      }
      park()
      return {
        ok: false,
        message: "Nothing goes after “Show it!” — it finishes the stack.",
      }
    }

    // ── 3. BODY BRICKS TARGETING A SPECIFIC BRICK ────────────────────────
    if (targetBlock) {
      // Dropped on Goal: insert as the very first block below Goal
      if (targetBlock.type === BLOCK.goal) {
        const nextConn = targetBlock.nextConnection
        const childConn = nextConn?.targetConnection
        if (childConn) nextConn?.disconnect()
        nextConn?.connect(block.previousConnection!)
        if (childConn && block.nextConnection) {
          block.nextConnection.connect(childConn)
        }
        return { ok: true }
      }

      // Dropped on Show it: insert right above Show it
      if (targetBlock.type === BLOCK.show) {
        const aboveConn = targetBlock.previousConnection?.targetConnection
        if (aboveConn && block.previousConnection && block.nextConnection) {
          targetBlock.previousConnection?.disconnect()
          aboveConn.connect(block.previousConnection)
          block.nextConnection.connect(targetBlock.previousConnection!)
          return { ok: true }
        }
      }

      // Dropped on a Proof block: insert after the promise block that contains it
      if (targetBlock.type === BLOCK.proof) {
        const parentPromise = chain.find((b) => {
          let curr = b.getInput("PROOFS")?.connection?.targetBlock()
          while (curr) {
            if (curr === targetBlock) return true
            curr = curr.nextConnection?.targetBlock() ?? null
          }
          return false
        })
        const insertAfter = parentPromise ?? chain[chain.length - 1]
        if (insertAfter && insertAfter.type !== BLOCK.show) {
          const nextConn = insertAfter.nextConnection
          const childConn = nextConn?.targetConnection
          if (childConn) nextConn?.disconnect()
          nextConn?.connect(block.previousConnection!)
          if (childConn && block.nextConnection) {
            block.nextConnection.connect(childConn)
          }
          return { ok: true }
        }
      }

      // Dropped on any body block in the main stack
      if (chain.includes(targetBlock) && targetBlock.type !== BLOCK.show) {
        const nextConn = targetBlock.nextConnection
        const childConn = nextConn?.targetConnection
        if (childConn) nextConn?.disconnect()
        nextConn?.connect(block.previousConnection!)
        if (childConn && block.nextConnection) {
          block.nextConnection.connect(childConn)
        }
        return { ok: true }
      }
    }

    // ── 4. DEFAULT PLACEMENT (open space or tapped) ─────────────────────
    const show = chain.find((b) => b.type === BLOCK.show)
    if (show && type !== BLOCK.show) {
      const above = show.previousConnection?.targetConnection
      if (above && block.previousConnection && block.nextConnection) {
        show.previousConnection?.disconnect()
        above.connect(block.previousConnection)
        block.nextConnection.connect(show.previousConnection!)
        return { ok: true }
      }
    }

    const last = chain[chain.length - 1]
    if (!last.nextConnection) {
      park()
      return {
        ok: false,
        message: "Nothing goes after “Show it!” — it finishes the stack.",
      }
    }
    last.nextConnection.connect(block.previousConnection!)
    return { ok: true }
  } catch (error) {
    console.warn("Could not add that brick:", error)
    return { ok: false, message: "That brick didn't fit. Try another spot." }
  } finally {
    Blockly.Events.setGroup(false)
  }
}

/** The main stack, top to bottom. */
function stackOf(goal: Blockly.Block): Blockly.Block[] {
  const out: Blockly.Block[] = []
  let cursor: Blockly.Block | null = goal
  let guard = 0
  while (cursor && guard++ < 500) {
    out.push(cursor)
    cursor = cursor.nextConnection?.targetBlock() ?? null
  }
  return out
}

/**
 * Load serialized blocks, tolerating a workspace saved by an older block set.
 *
 * A thrown deserialization error would leave a kid staring at a blank canvas with
 * no idea why, so the failure is contained and the canvas is left as it was.
 */
function loadInto(
  workspace: Blockly.WorkspaceSvg,
  state: WorkspaceState
): void {
  try {
    Blockly.serialization.workspaces.load(
      state as unknown as Record<string, unknown>,
      workspace
    )
  } catch (error) {
    console.warn("Could not load that workspace:", error)
  }
}
