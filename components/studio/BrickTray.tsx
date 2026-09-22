"use client"

import { useState } from "react"

import { BRICK, TRAY, type TrayBrick } from "@/components/blocks/definitions"
import { cn } from "@/lib/utils"

/** The payload a dragged brick carries. */
export const BRICK_DRAG_TYPE = "application/x-lamine-brick"

interface BrickTrayProps {
  onAdd: (type: string) => void
  disabled?: boolean
  /** Set when the last add had nowhere legal to go. */
  nudge?: string | null
}

/**
 * The palette.
 *
 * Two ways to use it, because children reach for different ones: tap a brick and
 * it snaps onto the end of the stack, or drag it onto the canvas and drop it where
 * you want. Tapping is what works on a trackpad and from the keyboard; dragging is
 * what everyone expects of blocks. Blockly still handles all dragging *between*
 * blocks once they exist.
 */
export function BrickTray({ onAdd, disabled = false, nudge }: BrickTrayProps) {
  const [hint, setHint] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)

  return (
    <aside
      className="flex w-56 shrink-0 flex-col border-r border-line bg-surface"
      aria-label="Brick tray"
    >
      <div className="border-b border-line px-3 py-2.5">
        <h2 className="font-display text-sm font-bold text-ink">Bricks</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {TRAY.map((group) => (
          <section key={group.name} className="mb-3">
            <h3 className="mb-1.5 px-1 text-[12px] font-medium text-slate">
              {group.name}
            </h3>
            <ul className="space-y-1.5">
              {group.bricks.map((brick) => (
                <li key={brick.type}>
                  <BrickButton
                    brick={brick}
                    disabled={disabled}
                    dragging={dragging === brick.type}
                    onClick={() => onAdd(brick.type)}
                    onHover={setHint}
                    onDragState={setDragging}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* One line of help, shared by hover, drag and a refused add. */}
      <div
        className="min-h-14 border-t border-line px-3 py-2 text-[12px] leading-snug"
        aria-live="polite"
      >
        {nudge ? (
          <span className="font-medium text-brick-red">{nudge}</span>
        ) : hint ? (
          <span className="text-slate">{hint}</span>
        ) : (
          <span className="text-slate">
            Tap a brick, or drag it onto the board.
          </span>
        )}
      </div>
    </aside>
  )
}

function BrickButton({
  brick,
  disabled,
  dragging,
  onClick,
  onHover,
  onDragState,
}: {
  brick: TrayBrick
  disabled: boolean
  dragging: boolean
  onClick: () => void
  onHover: (hint: string | null) => void
  onDragState: (type: string | null) => void
}) {
  const colour = BRICK[brick.colour]

  return (
    <button
      type="button"
      draggable={!disabled}
      onClick={onClick}
      disabled={disabled}
      onDragStart={(event) => {
        event.dataTransfer.setData(BRICK_DRAG_TYPE, brick.type)
        // Some browsers refuse a drag without a text/plain payload.
        event.dataTransfer.setData("text/plain", brick.label)
        event.dataTransfer.effectAllowed = "copy"
        onDragState(brick.type)
      }}
      onDragEnd={() => onDragState(null)}
      onMouseEnter={() => onHover(brick.hint)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(brick.hint)}
      onBlur={() => onHover(null)}
      title={brick.hint}
      className={cn(
        "brick w-full cursor-grab px-3 py-2.5 text-left text-[13px] leading-tight active:cursor-grabbing",
        dragging && "opacity-45"
      )}
      style={{ background: colour.fill, color: colour.ink }}
    >
      {brick.label}
    </button>
  )
}
