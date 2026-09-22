"use client"

import { Check, Loader2, X } from "lucide-react"

import { cn } from "@/lib/utils"

export type StudioView = "bricks" | "plan" | "code" | "checks" | "play"

/** What a plate looks like right now. */
type PlateState = "idle" | "active" | "done" | "failed"

interface BuildRailProps {
  view: StudioView
  onView: (view: StudioView) => void
  /** Session state from Convex: idle|planning|executing|testing|previewing|done|failed|stopped */
  sessionState: string
  taskCount: number
  doneCount: number
  fileCount: number
  testsPassed: number | null
  testsTotal: number | null
  hasPreview: boolean
}

/**
 * The build rail: one control that is both the progress indicator and the view
 * switcher.
 *
 * It reads like the step strip on the back of a LEGO box — five plates that fill
 * in as the build advances, and tapping one shows you that step. Doing both jobs
 * with one control is what let the separate tab bar and bottom drawer go away,
 * which gives the canvas the whole middle of the screen.
 */
export function BuildRail({
  view,
  onView,
  sessionState,
  taskCount,
  doneCount,
  fileCount,
  testsPassed,
  testsTotal,
  hasPreview,
}: BuildRailProps) {
  const failed = sessionState === "failed"
  const building = ["planning", "executing", "testing", "previewing"].includes(
    sessionState
  )

  const plates: {
    id: StudioView
    label: string
    detail: string
    state: PlateState
  }[] = [
    {
      id: "bricks",
      label: "Bricks",
      detail: "your idea",
      state: view === "bricks" ? "active" : "done",
    },
    {
      id: "plan",
      label: "Plan",
      detail: taskCount ? `${doneCount}/${taskCount} steps` : "not yet",
      state:
        sessionState === "planning"
          ? "active"
          : failed && taskCount === 0
            ? "failed"
            : taskCount > 0
              ? doneCount === taskCount
                ? "done"
                : "active"
              : "idle",
    },
    {
      id: "code",
      label: "Code",
      detail: fileCount ? `${fileCount} files` : "not yet",
      state:
        sessionState === "executing"
          ? "active"
          : fileCount > 0
            ? "done"
            : "idle",
    },
    {
      id: "checks",
      label: "Checks",
      detail:
        testsTotal && testsTotal > 0
          ? `${testsPassed ?? 0}/${testsTotal} passed`
          : "not yet",
      state:
        sessionState === "testing"
          ? "active"
          : testsTotal && testsTotal > 0
            ? (testsPassed ?? 0) === testsTotal
              ? "done"
              : "failed"
            : "idle",
    },
    {
      id: "play",
      label: "Play",
      detail: hasPreview ? "ready" : building ? "soon" : "not yet",
      state:
        sessionState === "previewing"
          ? "active"
          : hasPreview
            ? "done"
            : failed
              ? "failed"
              : "idle",
    },
  ]

  return (
    <nav
      className="plate-flat flex shrink-0 items-stretch gap-1.5 border-x-0 border-b-0 p-1.5"
      aria-label="Build steps"
    >
      {plates.map((plate, index) => {
        const selected = view === plate.id
        return (
          <button
            key={plate.id}
            type="button"
            onClick={() => onView(plate.id)}
            aria-current={selected ? "step" : undefined}
            className={cn(
              "rail-plate relative flex flex-1 items-center gap-2 px-3 py-1.5 text-left",
              plate.state === "active" && "rail-plate-active",
              plate.state === "done" && "rail-plate-done",
              plate.state === "failed" && "rail-plate-failed",
              selected &&
                "ring-2 ring-ink/60 ring-offset-1 ring-offset-plate-raised"
            )}
          >
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                plate.state === "idle"
                  ? "bg-plate-edge text-ink-soft"
                  : "bg-white/25 text-white"
              )}
              aria-hidden
            >
              {plate.state === "done" ? (
                <Check className="size-3" />
              ) : plate.state === "failed" ? (
                <X className="size-3" />
              ) : plate.state === "active" && plate.id !== "bricks" ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                index + 1
              )}
            </span>
            <span className="min-w-0">
              <span className="block font-display text-[13px] leading-tight font-semibold">
                {plate.label}
              </span>
              <span className="block truncate text-[10px] leading-tight opacity-80">
                {plate.detail}
              </span>
            </span>
          </button>
        )
      })}
    </nav>
  )
}
