"use client"

/**
 * Blockly, mounted.
 *
 * Everything that makes the canvas feel real — connectors, snapping, nesting,
 * undo/redo, keyboard navigation, serialization — comes from Blockly. Nothing in
 * here re-implements drag and drop, and nothing should.
 *
 * Two departures from a stock setup:
 *
 *  1. The `lego` renderer (components/blocks/legoRenderer.ts) gives the brick
 *     silhouette.
 *  2. Blockly's toolbox is switched off. `BrickTray` calls `addBrick()` instead,
 *     so a child taps a brick and it snaps onto the end of their stack — which
 *     beats dragging out of a flyout on a trackpad, and is reachable by keyboard
 *     and touch without any extra work.
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
import { BLOCK, type WorkspaceState } from "@/lib/core/blocks"

/** What happened when a child tapped a brick in the tray. */
export interface AddResult {
  ok: boolean
  /** Kid-facing nudge when the brick had nowhere legal to go. */
  message?: string
}

export interface BlockCanvasHandle {
  /** Snap a new brick onto the stack. */
  addBrick: (type: string) => AddResult
  /** Replace the canvas contents, e.g. when a kid picks a starter nugget. */
  load: (state: WorkspaceState) => void
  resize: () => void
  undo: () => void
  redo: () => void
  zoom: (direction: 1 | -1 | 0) => void
}

interface BlockCanvasProps {
  initialWorkspace?: WorkspaceState | null
  onChange: (state: WorkspaceState) => void
  /** True while a build is running: the blocks are the brief, so they freeze. */
  readOnly?: boolean
  handleRef?: Ref<BlockCanvasHandle>
}

let localeSet = false

/** Blocks that can hold Proof bricks inside them. */
const PROMISE_TYPES = new Set<string>([BLOCK.feature, BLOCK.whenThen])

export function BlockCanvas({
  initialWorkspace,
  onChange,
  readOnly = false,
  handleRef,
}: BlockCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null)

  // Read the latest props from inside the one-shot inject effect without making
  // it re-run and rebuild the whole canvas.
  const onChangeRef = useRef(onChange)
  const initialRef = useRef(initialWorkspace)
  useEffect(() => {
    onChangeRef.current = onChange
    initialRef.current = initialWorkspace
  })

  useImperativeHandle(handleRef, () => ({
    addBrick(type: string) {
      const workspace = workspaceRef.current
      if (!workspace) return { ok: false }
      return addBrick(workspace, type)
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
    zoom(direction: 1 | -1 | 0) {
      const workspace = workspaceRef.current
      if (!workspace) return
      if (direction === 0) workspace.setScale(0.95)
      else workspace.zoomCenter(direction)
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
      grid: { spacing: 28, length: 0, colour: "transparent", snap: true },
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
      // Selecting, scrolling and opening a menu are not edits.
      if (event.isUiEvent) return
      if (workspace.isDragging()) return
      onChangeRef.current(
        Blockly.serialization.workspaces.save(
          workspace
        ) as unknown as WorkspaceState
      )
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
          <span className="brick brick-studs bg-brick-blue px-4 pt-3.5 pb-1.5 text-sm">
            Building — your bricks are locked while I work
          </span>
        </div>
      ) : null}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   Tap to add
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Create a brick and connect it where it belongs.
 *
 * Body bricks go on the end of the stack but *above* "Show it", because that one
 * ends the stack. Proof bricks go inside the last promise. Everything happens in
 * one Blockly event group, so one tap is one undo.
 */
function addBrick(workspace: Blockly.WorkspaceSvg, type: string): AddResult {
  const tops = workspace.getTopBlocks(true)
  const goal = tops.find((b) => b.type === BLOCK.goal)

  if (type === BLOCK.goal && goal) {
    return {
      ok: false,
      message: "You already have a Goal brick — there's only ever one.",
    }
  }

  Blockly.Events.setGroup(true)
  try {
    const block = workspace.newBlock(type)
    block.initSvg()
    block.render()

    if (type === BLOCK.goal || !goal) {
      // Nothing to attach to: drop it where it can be seen.
      block.moveBy(48, 40)
      return { ok: true }
    }

    const chain = stackOf(goal)

    if (type === BLOCK.proof) {
      const holder = [...chain].reverse().find((b) => PROMISE_TYPES.has(b.type))
      if (!holder) {
        block.dispose(false)
        return {
          ok: false,
          message: "Checks go inside a promise. Add an “It must…” brick first.",
        }
      }
      const slot = holder.getInput("PROOFS")?.connection
      if (!slot) {
        block.dispose(false)
        return { ok: false, message: "That brick has nowhere to put a check." }
      }
      // Walk to the end of the proofs already in the slot.
      let tail = slot.targetBlock()
      while (tail?.nextConnection?.targetBlock())
        tail = tail.nextConnection.targetBlock()
      const target = tail?.nextConnection ?? slot
      target.connect(block.previousConnection!)
      return { ok: true }
    }

    const show = chain.find((b) => b.type === BLOCK.show)
    if (show && type !== BLOCK.show) {
      // Slide the new brick in above "Show it".
      const above = show.previousConnection?.targetConnection
      if (above) {
        above.connect(block.previousConnection!)
        block.nextConnection?.connect(show.previousConnection!)
        return { ok: true }
      }
    }

    const last = chain[chain.length - 1]
    if (!last.nextConnection) {
      block.dispose(false)
      return {
        ok: false,
        message: "Nothing can go after “Show it!” — it finishes the stack.",
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
