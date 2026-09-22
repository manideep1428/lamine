"use client"

import { cn } from "@/lib/utils"

interface GoButtonProps {
  ready: boolean
  building: boolean
  /** Why it isn't ready, in the kid's words. Shown next to the brick. */
  reasons: string[]
  onGo: () => void
  onStop: () => void
}

/**
 * One brick, three states: ready (green, bobbing), building (red STOP), and
 * not-ready — which says *why* instead of just being greyed out. A disabled
 * button with no explanation is the fastest way to lose a nine-year-old.
 */
export function GoButton({
  ready,
  building,
  reasons,
  onGo,
  onStop,
}: GoButtonProps) {
  // Studs and padding are identical in all three states on purpose: varying them
  // changed the brick's height, and the whole header jumped the moment a child's
  // bricks became valid.
  const shape = "brick px-7 py-3 text-base tracking-wide"

  if (building) {
    return (
      <button
        type="button"
        onClick={onStop}
        className={cn(shape, "bg-brick-red")}
      >
        STOP
      </button>
    )
  }

  return (
    <div className="flex items-center gap-3">
      {!ready && reasons.length > 0 ? (
        <p className="hidden max-w-56 text-right text-[11px] leading-snug text-slate sm:block">
          {reasons[0]}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onGo}
        disabled={!ready}
        aria-describedby={!ready && reasons.length ? "go-reasons" : undefined}
        className={cn(shape, ready ? "bg-brick-green" : "")}
      >
        GO!
      </button>
      {!ready && reasons.length > 0 ? (
        <span id="go-reasons" className="sr-only">
          {reasons.join(" ")}
        </span>
      ) : null}
    </div>
  )
}
