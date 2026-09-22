"use client"

import { useAction, useMutation, useQuery } from "convex/react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type {
  BlockCanvasHandle,
  BrickSelection,
} from "@/components/blocks/BlockCanvas"
import { isConvexConfigured } from "@/components/convex-client-provider"
import { NuggetPicker } from "@/components/explorer/NuggetPicker"
import { BrickEditor } from "@/components/studio/BrickEditor"
import { BRICK_DRAG_TYPE, BrickTray } from "@/components/studio/BrickTray"
import { BuddyDock } from "@/components/studio/BuddyDock"
import { BuildRail, type StudioView } from "@/components/studio/BuildRail"
import { ChecksPanel } from "@/components/studio/ChecksPanel"
import { CodeDrawer } from "@/components/studio/CodeDrawer"
import { Instructions } from "@/components/studio/Instructions"
import { Preview } from "@/components/studio/Preview"
import { SharePanel } from "@/components/studio/SharePanel"
import { TaskGraph } from "@/components/studio/TaskGraph"
import { TopBar } from "@/components/studio/TopBar"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useStoredValue } from "@/hooks/use-local"
import { useStudioProject } from "@/hooks/use-project"
import { interpretWorkspace, type WorkspaceState } from "@/lib/core/blocks"
import { readiness, type NuggetSpec, type SpecWarning } from "@/lib/core/spec"
import { BLANK_WORKSPACE, type ExampleNugget } from "@/lib/examples"
import { useVoice } from "@/lib/voice"

/** Blockly touches the DOM on import, so it never runs on the server. */
const BlockCanvas = dynamic(
  () => import("@/components/blocks/BlockCanvas").then((m) => m.BlockCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center text-sm text-slate">
        Tipping out the bricks…
      </div>
    ),
  }
)

const LIVE_STATES = new Set(["planning", "executing", "testing", "previewing"])

interface Interpretation {
  spec: NuggetSpec | null
  warnings: SpecWarning[]
  problems: string[]
}

export function Studio({ projectId }: { projectId: string }) {
  if (!isConvexConfigured) return <BackendMissing />
  return <StudioInner projectId={projectId as Id<"projects">} />
}

function StudioInner({ projectId }: { projectId: Id<"projects"> }) {
  const project = useStudioProject(projectId)
  const voice = useVoice()
  const canvas = useRef<BlockCanvasHandle>(null)

  const [shareOpen, setShareOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const [waking, setWaking] = useState(false)
  const [sending, setSending] = useState(false)
  const [nudge, setNudge] = useState<string | null>(null)

  /**
   * The helpers panel, remembered across visits.
   *
   * Collapsing it gives the canvas the full width, which matters on a laptop.
   * Stored rather than reset each visit, because it is a working preference.
   */
  const [helpersOpen, setHelpersOpen] = useStoredValue(
    "lamine:helpers-open",
    true,
    parseFlag
  )
  const [helpersClosedAt, setHelpersClosedAt] = useState<number | null>(null)
  const toggleHelpers = useCallback(() => {
    const next = !helpersOpen
    setHelpersOpen(next)
    setHelpersClosedAt(next ? null : Date.now())
  }, [helpersOpen, setHelpersOpen])
  const [selected, setSelected] = useState<BrickSelection | null>(null)
  const [dropActive, setDropActive] = useState(false)

  /* ── build state, live from Convex ── */
  const secret = project.secret
  const args = secret ? { projectId, secret } : "skip"

  const session = useQuery(api.sessions.latest, args)
  const sessionId = session?._id ?? null
  const tasks = useQuery(api.sessions.tasksFor, { sessionId }) ?? []
  const events = useQuery(api.sessions.eventsFor, { sessionId }) ?? []
  const files = useQuery(api.sessions.filesFor, { sessionId }) ?? []
  const messages = useQuery(api.messages.listFor, args) ?? []
  const published = useQuery(api.published.status, args) ?? null

  const startBuild = useMutation(api.sessions.start)
  const stopBuild = useMutation(api.sessions.stop)
  const chat = useAction(api.crew.chat)
  const explain = useAction(api.crew.explainError)
  const wake = useAction(api.projects.wake)

  const state = session?.state ?? "idle"
  const building = LIVE_STATES.has(state)

  /* ── the spec, recomputed from the canvas ── */
  const [edited, setEdited] = useState<Interpretation | null>(null)

  // Before the first edit the spec comes from the restored workspace, so GO works
  // the moment a project opens. After it, the canvas is the source of truth.
  const restored = useMemo<Interpretation>(() => {
    const result = interpretWorkspace(project.initialWorkspace)
    return {
      spec: result.spec,
      warnings: result.warnings,
      problems: result.problems,
    }
  }, [project.initialWorkspace])

  const interpreted = edited ?? restored

  const onCanvasChange = useCallback(
    (workspace: WorkspaceState) => {
      const result = interpretWorkspace(workspace)
      setEdited({
        spec: result.spec,
        warnings: result.warnings,
        problems: result.problems,
      })
      project.save(workspace, result.spec)
    },
    [project]
  )

  const ready = useMemo(() => {
    const check = readiness(interpreted.spec)
    return {
      ok: check.ready,
      reasons: [...interpreted.problems, ...check.reasons],
    }
  }, [interpreted.spec, interpreted.problems])

  /* ── the tray ── */
  const onAddBrick = useCallback(
    (type: string, at?: { clientX: number; clientY: number }) => {
      const result = canvas.current?.addBrick(type, at)
      setNudge(result?.ok ? null : (result?.message ?? null))
    },
    []
  )

  const onFieldChange = useCallback(
    (field: string, value: string) => {
      if (!selected) return
      canvas.current?.setField(selected.blockId, field, value)
      // Echo immediately so the textarea stays responsive; the canvas confirms it
      // on the next change event.
      setSelected({
        ...selected,
        fields: selected.fields.map((f) =>
          f.name === field ? { ...f, value } : f
        ),
      })
    },
    [selected]
  )

  const onRemoveBrick = useCallback(() => {
    if (!selected) return
    canvas.current?.removeBrick(selected.blockId)
    setSelected(null)
  }, [selected])

  /** A brick dragged out of the tray and dropped on the board. */
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      setDropActive(false)
      canvas.current?.highlightTarget(null)
      const type = event.dataTransfer.getData(BRICK_DRAG_TYPE)
      if (!type) return
      event.preventDefault()
      onAddBrick(type, { clientX: event.clientX, clientY: event.clientY })
    },
    [onAddBrick]
  )

  const onDragOver = useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes(BRICK_DRAG_TYPE)) return
    // Without preventDefault the browser refuses the drop outright.
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
    setDropActive(true)
    canvas.current?.highlightTarget({
      clientX: event.clientX,
      clientY: event.clientY,
    })
  }, [])

  const onPickExample = useCallback((example: ExampleNugget | null) => {
    setPicking(false)
    setNudge(null)
    canvas.current?.load(example?.workspace ?? BLANK_WORKSPACE)
  }, [])

  /* ── which view is showing ── */
  const previewUrl = project.previewUrl

  // A finished build takes over the centre until the child looks elsewhere.
  // Derived rather than pushed by an effect: "should I be showing the result?" has
  // an answer at every render, so it needs no state of its own.
  const [chosenView, setChosenView] = useState<StudioView | null>(null)
  const [ackPreview, setAckPreview] = useState<string | null>(null)
  const freshPreview =
    state === "done" && Boolean(previewUrl) && previewUrl !== ackPreview
  const view: StudioView = freshPreview ? "play" : (chosenView ?? "bricks")

  const onView = useCallback(
    (next: StudioView) => {
      setChosenView(next)
      if (previewUrl) setAckPreview(previewUrl)
    },
    [previewUrl]
  )

  /* ── actions ── */
  const onGo = useCallback(async () => {
    if (!secret || !interpreted.spec) return
    project.flush()
    try {
      await startBuild({ projectId, secret, spec: interpreted.spec })
      setChosenView("plan")
    } catch (error) {
      console.warn("Could not start the build:", error)
    }
  }, [interpreted.spec, project, projectId, secret, startBuild])

  const onStop = useCallback(() => {
    if (!secret || !sessionId) return
    void stopBuild({ projectId, secret, sessionId }).catch(() => undefined)
  }, [projectId, secret, sessionId, stopBuild])

  const onSend = useCallback(
    async (text: string) => {
      if (!secret) return
      setSending(true)
      try {
        await chat({
          projectId,
          secret,
          text,
          situation: describeSituation(state, view),
        })
      } finally {
        setSending(false)
      }
    },
    [chat, projectId, secret, state, view]
  )

  const onRuntimeError = useCallback(
    (message: string) => {
      if (!secret) return
      void explain({
        projectId,
        secret,
        message,
        where: "playing it in the preview",
      }).catch(() => undefined)
    },
    [explain, projectId, secret]
  )

  const onWake = useCallback(async () => {
    if (!secret) return
    setWaking(true)
    try {
      await wake({ projectId, secret })
    } catch {
      /* the sandbox may be gone; the UI already says how to rebuild */
    } finally {
      setWaking(false)
    }
  }, [projectId, secret, wake])

  /* ── shell ── */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault()
        toggleHelpers()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [toggleHelpers])

  useEffect(() => {
    document.body.dataset.shell = "studio"
    return () => {
      delete document.body.dataset.shell
    }
  }, [])

  if (project.status === "loading") {
    return <Centered>Opening your project…</Centered>
  }

  if (project.status !== "ready") {
    return <NoAccess reason={project.status} />
  }

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-paper">
      <TopBar
        name={project.name}
        onRename={project.rename}
        ready={ready.ok}
        building={building}
        reasons={ready.reasons}
        onGo={onGo}
        onStop={onStop}
        saving={project.dirty}
        voiceOn={voice.enabled}
        voiceSupported={voice.supported}
        onToggleVoice={voice.toggle}
        onShare={() => setShareOpen(true)}
        helpersOpen={helpersOpen}
        onToggleHelpers={toggleHelpers}
        onUndo={() => canvas.current?.undo()}
        onRedo={() => canvas.current?.redo()}
        canEdit={view === "bricks" && !building}
      />

      <div className="flex min-h-0 flex-1">
        {view === "bricks" ? (
          <BrickTray onAdd={onAddBrick} disabled={building} nudge={nudge} />
        ) : null}

        <main className="relative min-w-0 flex-1">
          {/* The canvas stays mounted across views so Blockly keeps its state. */}
          <div
            className={
              view === "bricks" ? "plate-grid relative h-full" : "hidden"
            }
            onDragOver={onDragOver}
            onDragLeave={() => {
              setDropActive(false)
              canvas.current?.highlightTarget(null)
            }}
            onDrop={onDrop}
          >
            <BlockCanvas
              handleRef={canvas}
              initialWorkspace={project.initialWorkspace}
              onChange={onCanvasChange}
              onSelect={setSelected}
              readOnly={building}
            />

            {/* Shown only while a tray brick is over the board. */}
            {dropActive ? (
              <div className="pointer-events-none absolute inset-2 z-20 rounded-xl border-2 border-dashed border-brick-blue/60 bg-brick-blue/5" />
            ) : null}
            {/* One slot, two states: the selected brick's words while a brick is
                selected, otherwise what the whole stack adds up to. */}
            <div className="pointer-events-none absolute inset-0">
              {selected ? (
                <BrickEditor
                  selection={selected}
                  onChange={onFieldChange}
                  onRemove={onRemoveBrick}
                  onClose={() => setSelected(null)}
                  disabled={building}
                />
              ) : (
                <Instructions
                  spec={interpreted.spec}
                  warnings={interpreted.warnings}
                  problems={interpreted.problems}
                />
              )}
            </div>
            {!building ? (
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="panel absolute top-4 right-4 z-10 px-3 py-1.5 text-[12px] font-semibold text-slate hover:bg-paper-sunken"
              >
                Start from an example
              </button>
            ) : null}
          </div>

          {view === "plan" ? <TaskGraph tasks={tasks} phase={state} /> : null}
          {view === "code" ? <CodeDrawer files={files} phase={state} /> : null}
          {view === "checks" ? (
            <ChecksPanel
              events={events}
              passed={session?.testsPassed ?? null}
              total={session?.testsTotal ?? null}
              phase={state}
            />
          ) : null}
          {view === "play" ? (
            <Preview
              url={previewUrl}
              building={building}
              onWake={onWake}
              waking={waking}
              onRuntimeError={onRuntimeError}
            />
          ) : null}
        </main>

        <BuddyDock
          events={events}
          messages={messages}
          planning={state === "planning"}
          onSend={onSend}
          sending={sending}
          say={voice.say}
          voiceOn={voice.enabled}
          open={helpersOpen}
          onToggle={toggleHelpers}
          closedAt={helpersClosedAt}
        />
      </div>

      <BuildRail
        view={view}
        onView={onView}
        sessionState={state}
        taskCount={tasks.length}
        doneCount={tasks.filter((t) => t.status === "done").length}
        fileCount={files.length}
        testsPassed={session?.testsPassed ?? null}
        testsTotal={session?.testsTotal ?? null}
        hasPreview={Boolean(previewUrl)}
      />

      {shareOpen && secret ? (
        <SharePanel
          projectId={projectId}
          secret={secret}
          name={project.name}
          published={published}
          onClose={() => setShareOpen(false)}
        />
      ) : null}

      {picking ? (
        <NuggetPicker
          busy={false}
          onPick={onPickExample}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </div>
  )
}

/** Stored preferences are strings; anything unrecognised falls back to the default. */
function parseFlag(raw: string): boolean | null {
  if (raw === "true") return true
  if (raw === "false") return false
  return null
}

/* ════════════════════════════════════════════════════════════════════════
   States that are not the studio
   ════════════════════════════════════════════════════════════════════════ */

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="plate-grid grid h-svh place-items-center text-sm text-slate">
      {children}
    </div>
  )
}

function NoAccess({ reason }: { reason: "denied" | "missing" }) {
  return (
    <div className="plate-grid flex h-svh flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-display text-2xl font-bold text-ink">
        {reason === "missing"
          ? "That project isn't here"
          : "I can't open that one"}
      </h1>
      <p className="max-w-md text-sm leading-snug text-slate">
        {reason === "missing"
          ? "It may have been deleted."
          : "Projects live in the browser that made them. If it's yours, open it on that computer — or ask for the share link, which carries the key."}
      </p>
      <Link href="/" className="brick bg-brick-blue px-4 py-2.5 text-sm">
        Back to my projects
      </Link>
    </div>
  )
}

function BackendMissing() {
  return (
    <div className="plate-grid flex h-svh flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-display text-2xl font-bold text-ink">
        The workshop isn&apos;t connected
      </h1>
      <p className="max-w-md text-sm leading-snug text-slate">
        A grown-up needs to set{" "}
        <code className="font-mono">NEXT_PUBLIC_CONVEX_URL</code> and run{" "}
        <code className="font-mono">bunx convex dev</code>. Bricks and building
        both need the backend.
      </p>
    </div>
  )
}

/** One line of context so Codey can answer "what are you doing?" honestly. */
function describeSituation(state: string, view: StudioView): string {
  const phase =
    state === "planning"
      ? "planning the build"
      : state === "executing"
        ? "writing the code"
        : state === "testing"
          ? "running the checks"
          : state === "previewing"
            ? "starting the preview"
            : state === "done"
              ? "finished building"
              : state === "failed"
                ? "stopped because something went wrong"
                : "waiting for the child to press GO"

  return `The build is ${phase}. The child is looking at the ${view} view.`
}
