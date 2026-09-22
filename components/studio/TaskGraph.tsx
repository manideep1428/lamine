"use client"

import { useMemo } from "react"

import { isBuilding, Working, type Phase } from "@/components/studio/Working"
import { cn } from "@/lib/utils"

export interface TaskRow {
  taskId: string
  name: string
  agentName: string
  role: string
  dependsOn: string[]
  status: string
  verdict?: string
  summary?: string
  order: number
}

/* Node geometry. Layers run DOWN the page, not across: a plan is usually a chain,
   and six steps across overflowed the pane and clipped the last one. Vertical also
   matches how the bricks and the build rail already read, and it leaves horizontal
   room for the tasks that genuinely run in parallel. */
const NODE_W = 232
const NODE_H = 66
const GAP_X = 20
const GAP_Y = 40
const PAD = 20

const ROLE_LABEL: Record<string, string> = {
  builder: "builds",
  tester: "checks",
  reviewer: "reads it over",
}

/**
 * The plan, as the graph it actually is.
 *
 * The MetaPlanner emits real `dependsOn` edges; rendering them as a flat list
 * threw that structure away. Tasks are placed in dependency layers left to right,
 * so a child can see what is waiting on what, and the whole thing fills in live
 * as agents claim tasks.
 *
 * An ordered list of the same information is kept for screen readers — the graph
 * is the enhancement, not the only way to read it.
 */
export function TaskGraph({
  tasks,
  phase,
}: {
  tasks: TaskRow[]
  phase: Phase
}) {
  const layout = useMemo(() => layoutTasks(tasks), [tasks])

  if (tasks.length === 0 && isBuilding(phase)) {
    return <Working phase={phase} />
  }

  if (tasks.length === 0) {
    return (
      <div className="plate-grid grid h-full place-items-center p-8 text-center">
        <p className="max-w-sm text-sm text-slate">
          Press <strong>GO!</strong> and your helpers will work out a plan.
          Every step shows up here, and lights up as it gets done.
        </p>
      </div>
    )
  }

  return (
    <div className="plate-grid h-full overflow-auto p-6">
      <ol className="sr-only">
        {tasks.map((task) => (
          <li key={task.taskId}>
            {task.name} — {task.agentName} {ROLE_LABEL[task.role] ?? task.role}{" "}
            — {task.status}
            {task.verdict ? ` (${task.verdict})` : ""}
            {task.dependsOn.length
              ? `, after ${task.dependsOn.join(" and ")}`
              : ""}
          </li>
        ))}
      </ol>

      <div
        className="relative"
        style={{ width: layout.width, height: layout.height }}
        aria-hidden
      >
        <svg
          className="absolute inset-0"
          width={layout.width}
          height={layout.height}
          role="presentation"
        >
          {layout.edges.map((edge) => (
            <path
              key={edge.key}
              d={edge.d}
              fill="none"
              strokeWidth={3}
              strokeLinecap="round"
              className={edge.done ? "stroke-brick-green" : "stroke-line"}
            />
          ))}
        </svg>

        {layout.nodes.map(({ task, x, y }) => (
          <article
            key={task.taskId}
            className={cn(
              "absolute flex flex-col justify-center rounded-xl px-3 py-2.5",
              statusClass(task.status)
            )}
            style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
          >
            <p className="truncate font-display text-[13px] font-semibold">
              {task.name}
            </p>
            <p className="truncate text-[11px] opacity-85">
              {task.agentName} {ROLE_LABEL[task.role] ?? task.role}
            </p>
            {task.verdict ? (
              <p className="mt-0.5 text-[11px] font-semibold opacity-90">
                {task.verdict}
              </p>
            ) : null}
          </article>
        ))}
      </div>

      {/* Summaries read better as prose underneath than crammed into a node. */}
      <div className="mt-6 space-y-2">
        {tasks
          .filter((t) => t.summary && t.status !== "pending")
          .map((task) => (
            <div key={task.taskId} className="panel px-3 py-2">
              <p className="font-display text-[12px] font-semibold text-ink">
                {task.name}
              </p>
              <p className="text-[12px] leading-snug text-slate">
                {task.summary}
              </p>
            </div>
          ))}
      </div>
    </div>
  )
}

function statusClass(status: string): string {
  switch (status) {
    case "done":
      return "brick bg-brick-green"
    case "running":
      return "brick bg-brick-blue"
    case "failed":
      return "brick bg-brick-red"
    default:
      return "panel text-slate"
  }
}

interface Placed {
  task: TaskRow
  x: number
  y: number
}

/**
 * Put every task in a dependency layer: layer 0 has no dependencies, and a task
 * sits one layer *below* its deepest dependency, with tasks that can run at the
 * same time side by side in that row. Cycles cannot reach here — `validatePlan`
 * rejects them — but the guard keeps a hand-edited plan from hanging the UI.
 */
function layoutTasks(tasks: TaskRow[]) {
  const byId = new Map(tasks.map((t) => [t.taskId, t]))
  const depth = new Map<string, number>()

  const depthOf = (id: string, seen: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!
    if (seen.has(id)) return 0
    seen.add(id)
    const task = byId.get(id)
    const value = !task?.dependsOn.length
      ? 0
      : Math.max(
          ...task.dependsOn.map((dep) =>
            byId.has(dep) ? depthOf(dep, seen) + 1 : 0
          )
        )
    depth.set(id, value)
    return value
  }

  for (const task of tasks) depthOf(task.taskId, new Set())

  const layers = new Map<number, TaskRow[]>()
  for (const task of [...tasks].sort((a, b) => a.order - b.order)) {
    const level = depth.get(task.taskId) ?? 0
    layers.set(level, [...(layers.get(level) ?? []), task])
  }

  const nodes: Placed[] = []
  for (const [level, group] of layers) {
    group.forEach((task, index) => {
      nodes.push({
        task,
        // Siblings across, layers down.
        x: PAD + index * (NODE_W + GAP_X),
        y: PAD + level * (NODE_H + GAP_Y),
      })
    })
  }

  const at = new Map(nodes.map((n) => [n.task.taskId, n]))
  const edges = nodes.flatMap((node) =>
    node.task.dependsOn
      .map((dep) => at.get(dep))
      .filter((from): from is Placed => Boolean(from))
      .map((from) => {
        // Out of the bottom of the dependency, into the top of the task.
        const x1 = from.x + NODE_W / 2
        const y1 = from.y + NODE_H
        const x2 = node.x + NODE_W / 2
        const y2 = node.y
        const mid = (y1 + y2) / 2
        return {
          key: `${from.task.taskId}->${node.task.taskId}`,
          d: `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`,
          done: from.task.status === "done",
        }
      })
  )

  const width = Math.max(...nodes.map((n) => n.x + NODE_W), NODE_W) + PAD
  const height = Math.max(...nodes.map((n) => n.y + NODE_H), NODE_H) + PAD

  return { nodes, edges, width, height }
}
