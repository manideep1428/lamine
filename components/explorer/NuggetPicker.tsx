"use client"

import { Sparkles, X } from "lucide-react"

import { EXAMPLES, type ExampleNugget } from "@/lib/examples"

interface NuggetPickerProps {
  onPick: (example: ExampleNugget | null) => void
  onClose: () => void
  busy: boolean
}

/**
 * Starter sets.
 *
 * Each one drops a real, connected stack of bricks onto the canvas — not a
 * finished project. The child presses GO and the agents build *their* version of
 * it, which is why "make the rocks faster" is a one-brick change afterwards.
 */
export function NuggetPicker({ onPick, onClose, busy }: NuggetPickerProps) {
  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Pick something to start from"
      onClick={onClose}
    >
      <div
        className="panel snap-in w-full max-w-2xl p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-ink">
              What are we making?
            </h2>
            <p className="text-[13px] text-slate">
              Pick a set to start from, then change anything you like.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border-2 border-line p-1.5 text-slate hover:bg-paper-sunken"
          >
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2">
          {EXAMPLES.map((example) => (
            <li key={example.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onPick(example)}
                className="brick h-full w-full bg-brick-blue px-4 py-3.5 text-left disabled:opacity-50"
              >
                <span className="flex items-center gap-2 font-display text-[15px] font-bold">
                  <span aria-hidden>
                    {example.category === "game" ? "🎮" : "🌐"}
                  </span>
                  {example.name}
                </span>
                <span className="mt-1 block text-[12px] leading-snug font-normal opacity-90">
                  {example.description}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          disabled={busy}
          onClick={() => onPick(null)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line px-4 py-3 text-[13px] font-semibold text-slate hover:bg-paper-sunken hover:text-ink disabled:opacity-50"
        >
          <Sparkles className="size-4" />
          Start from nothing — just a Goal brick
        </button>
      </div>
    </div>
  )
}
