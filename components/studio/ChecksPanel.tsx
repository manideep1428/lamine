"use client"

import type { Doc } from "@/convex/_generated/dataModel"
import { cn } from "@/lib/utils"

interface ChecksPanelProps {
  events: Doc<"events">[]
  passed: number | null
  total: number | null
}

/**
 * The Proof bricks, as results.
 *
 * Every "Check that…" brick becomes a real test that really runs in the sandbox.
 * This is where a child finds out whether the thing they asked for actually
 * happened — so a failure is shown plainly, next to Dr. Bug's explanation, rather
 * than softened.
 */
export function ChecksPanel({ events, passed, total }: ChecksPanelProps) {
  const results = events.filter((e) => e.kind === "test_result")
  const teaching = events.filter((e) => e.kind === "teaching")

  if (results.length === 0) {
    return (
      <div className="plate-grid grid h-full place-items-center p-8 text-center">
        <p className="max-w-sm text-sm leading-snug text-slate">
          Your 🔍 <strong>Check that…</strong> bricks become real tests. Snap
          one inside a promise, press GO!, and the results land here.
        </p>
      </div>
    )
  }

  const failing = results.filter((e) => e.text.startsWith("FAIL")).length

  return (
    <div className="plate-grid h-full overflow-y-auto p-6">
      <div className="mb-4 flex items-center gap-3">
        <span
          className={cn(
            "brick px-4 py-2.5 font-display text-lg",
            failing === 0 ? "bg-brick-green" : "bg-brick-red"
          )}
        >
          {passed ?? 0} / {total ?? results.length}
        </span>
        <p className="text-sm text-slate">
          {failing === 0
            ? "Everything you asked for works."
            : `${failing} check${failing === 1 ? "" : "s"} still failing.`}
        </p>
      </div>

      <ul className="space-y-1.5">
        {results.map((event) => {
          const ok = event.text.startsWith("PASS")
          return (
            <li
              key={event._id}
              className="panel flex items-start gap-2.5 px-3 py-2"
            >
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded font-bold text-white",
                  ok ? "bg-brick-green" : "bg-brick-red"
                )}
                aria-hidden
              >
                {ok ? "✓" : "✗"}
              </span>
              <span className="text-[13px] leading-snug text-ink">
                {event.text.replace(/^(PASS|FAIL):\s*/, "")}
                <span className="sr-only">{ok ? " passed" : " failed"}</span>
              </span>
            </li>
          )
        })}
      </ul>

      {teaching.length > 0 ? (
        <div className="mt-5 space-y-2">
          {teaching.map((event) => (
            <div
              key={event._id}
              className="rounded-xl border-2 border-brick-red/40 bg-surface px-3 py-2"
            >
              <p className="text-[11px] font-semibold text-slate">
                🐞 Dr. Bug explains
              </p>
              <p className="text-[13px] leading-snug text-ink">{event.text}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
