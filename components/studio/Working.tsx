"use client"

/**
 * What a view shows while the helpers are working.
 *
 * The plan, code and checks views used to show the same invitation — "press GO"
 * — even while a build was running, which reads as nothing happening. A view with
 * no data yet now says which phase is underway and, when it is waiting on an
 * earlier phase, what it is waiting for.
 *
 * The phase label comes from the session state rather than from the view, so it
 * is always what is genuinely happening and never a guess.
 */

const PHASE_LABEL: Record<string, string> = {
  planning: "Working out a plan…",
  executing: "Writing the code…",
  testing: "Running your checks…",
  previewing: "Getting it ready to play…",
}

/** The phases in the order they run, for working out what is still to come. */
const PHASE_ORDER = ["planning", "executing", "testing", "previewing"] as const

export type Phase = string

export function isBuilding(phase: Phase): boolean {
  return phase in PHASE_LABEL
}

export function phaseLabel(phase: Phase): string {
  // The fallback is unreachable while `isBuilding` gates the loader, but if a new
  // phase is ever added it should still read like a sentence to a child.
  return PHASE_LABEL[phase] ?? "Working on it…"
}

/**
 * Has `phase` not yet reached `waitingFor`?
 *
 * Used to tell a child "your checks run after the code is written" instead of
 * spinning at them as though checks were already underway.
 */
export function stillAhead(
  phase: Phase,
  waitingFor: (typeof PHASE_ORDER)[number]
): boolean {
  const now = PHASE_ORDER.indexOf(phase as (typeof PHASE_ORDER)[number])
  const target = PHASE_ORDER.indexOf(waitingFor)
  return now >= 0 && target >= 0 && now < target
}

interface WorkingProps {
  phase: Phase
  /** Shown under the label when this view is waiting on an earlier phase. */
  hint?: string
}

export function Working({ phase, hint }: WorkingProps) {
  return (
    <div
      className="plate-grid grid h-full place-items-center p-8 text-center"
      aria-live="polite"
      aria-busy="true"
    >
      <div>
        <div
          className="brick-wave mb-4 flex justify-center gap-1.5"
          aria-hidden
        >
          <span className="size-3.5 rounded bg-brick-blue" />
          <span className="size-3.5 rounded bg-brick-green" />
          <span className="size-3.5 rounded bg-brick-amber" />
        </div>
        <p className="font-display text-[15px] font-semibold text-ink">
          {phaseLabel(phase)}
        </p>
        {hint ? (
          <p className="mt-1 max-w-sm text-[13px] text-slate">{hint}</p>
        ) : null}
      </div>
    </div>
  )
}
