"use client"

import { ChevronRight } from "lucide-react"
import { useState } from "react"

import type { NuggetSpec, SpecWarning } from "@/lib/core/spec"
import { cn } from "@/lib/utils"

interface InstructionsProps {
  spec: NuggetSpec | null
  warnings: SpecWarning[]
  problems: string[]
}

/**
 * The instruction booklet: what the bricks currently add up to.
 *
 * The bricks are not code — they are a specification, and the agents read this
 * object rather than the canvas. Showing it is the clearest way to teach that
 * difference, so it sits on the canvas next to the bricks rather than being
 * hidden behind a developer toggle.
 */
export function Instructions({ spec, warnings, problems }: InstructionsProps) {
  const [open, setOpen] = useState(true)
  const [showJson, setShowJson] = useState(false)

  return (
    <section
      className="border-b border-line bg-surface"
      aria-label="What you're building"
    >
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left"
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-slate transition-transform",
            open && "rotate-90"
          )}
        />
        <span className="font-display text-[13px] font-bold text-ink">
          What you&apos;re building
        </span>
        {!open && problems.length > 0 ? (
          <span className="ml-1 rounded bg-brick-amber px-1.5 text-[10px] font-bold text-white">
            {problems.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="max-h-72 space-y-2 overflow-y-auto border-t border-line px-3 py-2 text-[13px]">
          {problems.length > 0 ? (
            <ul className="space-y-1">
              {problems.map((problem) => (
                <li
                  key={problem}
                  className="flex items-start gap-1.5 text-slate"
                >
                  <span aria-hidden className="font-bold text-brick-amber">
                    →
                  </span>
                  {problem}
                </li>
              ))}
            </ul>
          ) : null}

          {spec ? (
            <>
              <p className="leading-snug text-ink">
                A <strong>{spec.nugget.kind}</strong> about{" "}
                <strong>{spec.nugget.goal}</strong>
                {spec.style ? <> that feels {spec.style.visual}</> : null}.
              </p>

              <dl className="grid grid-cols-4 gap-2 text-[11px]">
                <Count label="must do" value={spec.requirements.length} />
                <Count label="checks" value={spec.behavioralTests.length} />
                <Count label="remembers" value={spec.data.length} />
                <Count label="your rules" value={spec.skills.length} />
              </dl>

              {warnings.length > 0 ? (
                <ul className="space-y-0.5 text-[11px] text-brick-amber">
                  {warnings.map((warning, index) => (
                    <li key={`${warning.field}-${index}`}>{warning.message}</li>
                  ))}
                </ul>
              ) : null}

              <button
                type="button"
                onClick={() => setShowJson((was) => !was)}
                className="text-[11px] text-slate underline-offset-2 hover:underline"
              >
                {showJson ? "hide" : "show"} what the helpers actually read
              </button>

              {showJson ? (
                <pre className="code-panel max-h-40 overflow-auto rounded-lg p-2.5 font-mono text-[10px] leading-relaxed">
                  <code>{JSON.stringify(spec, null, 2)}</code>
                </pre>
              ) : null}
            </>
          ) : (
            <p className="text-slate">
              Start with a <strong>Make a…</strong> brick. Everything else snaps
              underneath it.
            </p>
          )}
        </div>
      ) : null}
    </section>
  )
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div
      className={cn(
        "rounded-lg px-2 py-1",
        value === 0 ? "bg-paper text-slate" : "bg-brick-green/12 text-ink"
      )}
    >
      <dt className="text-[10px] leading-tight">{label}</dt>
      <dd className="font-display text-sm leading-tight font-bold">{value}</dd>
    </div>
  )
}
