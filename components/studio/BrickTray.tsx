"use client"

import { useState } from "react"

import { BRICK, TRAY, type TrayBrick } from "@/components/blocks/definitions"
import { cn } from "@/lib/utils"

interface BrickTrayProps {
  onAdd: (type: string) => void
  disabled?: boolean
  /** Set when the last tap had nowhere legal to go. */
  nudge?: string | null
}

/**
 * The palette, as a tray of bricks you tap.
 *
 * Blockly's own toolbox is a category tree with a drag-out flyout. Tapping is
 * better here: it works on a trackpad, on a touchscreen and from the keyboard
 * with no extra code, and a child never has to aim. The canvas still supports
 * dragging blocks around once they exist — this only replaces "get a new one".
 */
export function BrickTray({ onAdd, disabled = false, nudge }: BrickTrayProps) {
  const [hint, setHint] = useState<string | null>(null)

  return (
    <aside
      className="plate-flat flex w-56 shrink-0 flex-col border-y-0 border-l-0 bg-plate-raised"
      aria-label="Brick tray"
    >
      <div className="border-b-2 border-plate-edge px-3 py-2">
        <h2 className="font-display text-xs font-bold tracking-widest text-ink-faint uppercase">
          Bricks
        </h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {TRAY.map((group) => (
          <section key={group.name} className="mb-3">
            <h3 className="mb-1.5 px-1 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
              {group.name}
            </h3>
            <ul className="space-y-2">
              {group.bricks.map((brick) => (
                <li key={brick.type}>
                  <BrickButton
                    brick={brick}
                    disabled={disabled}
                    onClick={() => onAdd(brick.type)}
                    onHover={setHint}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* One line of help, shared by hover and by a refused tap. */}
      <div
        className="min-h-14 border-t-2 border-plate-edge px-3 py-2 text-[11px] leading-snug"
        aria-live="polite"
      >
        {nudge ? (
          <span className="font-medium text-brick-red">{nudge}</span>
        ) : hint ? (
          <span className="text-ink-soft">{hint}</span>
        ) : (
          <span className="text-ink-faint">Tap a brick to snap it on.</span>
        )}
      </div>
    </aside>
  )
}

function BrickButton({
  brick,
  disabled,
  onClick,
  onHover,
}: {
  brick: TrayBrick
  disabled: boolean
  onClick: () => void
  onHover: (hint: string | null) => void
}) {
  const colour = BRICK[brick.colour]

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => onHover(brick.hint)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(brick.hint)}
      onBlur={() => onHover(null)}
      title={brick.hint}
      className={cn(
        "brick brick-studs w-full px-3 pt-4 pb-2.5 text-left text-[13px] leading-tight"
      )}
      style={{ background: colour.fill, color: colour.ink }}
    >
      {brick.label}
    </button>
  )
}
