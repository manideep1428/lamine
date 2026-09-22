"use client"

import { Trash2, X } from "lucide-react"

import type { BrickSelection } from "@/components/blocks/BlockCanvas"
import {
  brickLabel,
  fieldLabel,
  isLongField,
} from "@/components/blocks/definitions"
import { cn } from "@/lib/utils"

interface BrickEditorProps {
  selection: BrickSelection
  onChange: (field: string, value: string) => void
  onRemove: () => void
  onClose: () => void
  disabled?: boolean
}

/**
 * Edit the selected brick's words here rather than inside the brick.
 *
 * Blockly grows a block horizontally to fit its text and never wraps, so a
 * sentence typed into a block makes it wider than the screen. The brick shows a
 * shortened version; this panel holds the whole thing in a real textarea that
 * wraps, which is the right shape for "the ship stops at the edge of the screen".
 */
export function BrickEditor({
  selection,
  onChange,
  onRemove,
  onClose,
  disabled = false,
}: BrickEditorProps) {
  return (
    <section
      className="panel pointer-events-auto absolute bottom-4 left-4 z-10 w-[28rem] max-w-[calc(100%-2rem)]"
      aria-label={`Edit ${brickLabel(selection.type)}`}
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <h2 className="flex-1 font-display text-[13px] font-bold text-ink">
          {brickLabel(selection.type)}
        </h2>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          title="Remove this brick"
          className="rounded-lg p-1.5 text-slate hover:bg-paper-sunken hover:text-brick-red disabled:opacity-40"
        >
          <Trash2 className="size-4" />
          <span className="sr-only">Remove this brick</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Done"
          className="rounded-lg p-1.5 text-slate hover:bg-paper-sunken hover:text-ink"
        >
          <X className="size-4" />
          <span className="sr-only">Done editing</span>
        </button>
      </div>

      {selection.fields.length === 0 ? (
        <p className="px-3 py-3 text-[13px] text-slate">
          This brick has nothing to fill in. It just needs to be in the right
          place.
        </p>
      ) : (
        <div className="space-y-3 px-3 py-3">
          {selection.fields.map((field) => {
            const id = `brick-${selection.blockId}-${field.name}`
            const label = fieldLabel(selection.type, field.name)

            return (
              <div key={field.name}>
                <label
                  htmlFor={id}
                  className="mb-1 block text-[13px] font-medium text-ink"
                >
                  {label}
                </label>

                {field.kind === "choice" ? (
                  <select
                    id={id}
                    value={field.value}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange(field.name, event.target.value)
                    }
                    className={inputClass}
                  >
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : isLongField(selection.type, field.name) ? (
                  <textarea
                    id={id}
                    value={field.value}
                    disabled={disabled}
                    rows={3}
                    maxLength={500}
                    spellCheck
                    placeholder="Write it the way you'd say it out loud."
                    onChange={(event) =>
                      onChange(field.name, event.target.value)
                    }
                    className={cn(
                      inputClass,
                      "min-h-20 resize-y leading-relaxed"
                    )}
                  />
                ) : (
                  <input
                    id={id}
                    type="text"
                    value={field.value}
                    disabled={disabled}
                    maxLength={200}
                    onChange={(event) =>
                      onChange(field.name, event.target.value)
                    }
                    className={inputClass}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

const inputClass =
  "w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-[14px] text-ink outline-none focus:border-brick-blue disabled:opacity-60"
