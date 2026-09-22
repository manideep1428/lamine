"use client"

/**
 * The studio's project state: local-first, Convex-backed.
 *
 * localStorage is the fast copy — written on every block change, works offline,
 * zero latency. Convex is the real copy — debounced, and the only one that can
 * run a build. On load we take whichever is newer, which covers the tab that
 * closed mid-sync (PLAN.md §3).
 *
 * Nothing here copies external state into React state. The local copy arrives
 * through `useSyncExternalStore`, the remote copy through a Convex subscription,
 * and the merge is a `useMemo` over the two.
 */

import { useMutation, useQuery } from "convex/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { bump, useHydrated, useLocalProject } from "@/hooks/use-local"
import type { WorkspaceState } from "@/lib/core/blocks"
import type { NuggetSpec } from "@/lib/core/spec"
import { loadNewest, saveLocalProject } from "@/lib/storage"

/** How long after the last block change we write to Convex. */
const SYNC_DEBOUNCE_MS = 500

export type ProjectStatus = "loading" | "ready" | "denied" | "missing"

export interface StudioProject {
  status: ProjectStatus
  secret: string | null
  name: string
  kind: "game" | "website"
  /** Fed to the canvas at mount; the canvas owns the workspace afterwards. */
  initialWorkspace: WorkspaceState | null
  sandboxId: string | null
  previewUrl: string | null
  visibility: "private" | "link" | "published"
  /** True while the debounced write is outstanding. */
  dirty: boolean
  save: (workspace: WorkspaceState, spec: NuggetSpec | null) => void
  rename: (name: string) => void
  flush: () => void
}

function parseWorkspace(raw: string | null | undefined): WorkspaceState | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as WorkspaceState
  } catch {
    return null
  }
}

/**
 * The capability key from a share link.
 *
 * It travels in the URL fragment, which browsers never send to a server and
 * never put in a Referer header. Cached at module scope because we strip it from
 * the address bar as soon as it is stored.
 */
let fragmentKey: string | null | undefined
function shareKey(): string | null {
  if (fragmentKey !== undefined) return fragmentKey
  if (typeof window === "undefined") return null
  fragmentKey = new URLSearchParams(window.location.hash.replace(/^#/, "")).get(
    "k"
  )
  return fragmentKey
}

export function useStudioProject(projectId: Id<"projects">): StudioProject {
  const hydrated = useHydrated()
  const local = useLocalProject(projectId)
  const [renamed, setRenamed] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const saveWorkspace = useMutation(api.projects.saveWorkspace)
  const renameRemote = useMutation(api.projects.rename)

  const secret = local?.secret ?? (hydrated ? shareKey() : null)

  /* ── a share link hands us the key; store it and clean the URL ── */
  useEffect(() => {
    const key = shareKey()
    if (!key || local) return
    saveLocalProject({
      id: projectId,
      secret: key,
      name: "Shared project",
      kind: "game",
      workspace: "",
    })
    window.history.replaceState(null, "", window.location.pathname)
    bump()
  }, [local, projectId])

  const remote = useQuery(
    api.projects.get,
    secret ? { projectId, secret } : "skip"
  )
  const project = remote?.ok ? remote.project : null

  /* ── last write wins ── */
  const merged = useMemo(
    () =>
      loadNewest(
        local,
        project
          ? {
              id: projectId,
              name: project.name,
              kind: project.kind,
              workspace: project.workspace,
              updatedAt: project.updatedAt,
            }
          : null
      ),
    [local, project, projectId]
  )

  const initialWorkspace = useMemo(
    () => parseWorkspace(merged.workspace),
    [merged.workspace]
  )
  const name = renamed ?? merged.name ?? "My project"

  /* ── debounced write-behind ── */
  const pending = useRef<{ workspace: string; spec: NuggetSpec | null } | null>(
    null
  )
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const payload = pending.current
    if (!payload || !secret) return
    pending.current = null

    void saveWorkspace({
      projectId,
      secret,
      workspace: payload.workspace,
      spec: payload.spec ?? undefined,
    })
      .then(() => setDirty(false))
      .catch(() => {
        // Offline, or the server rejected the spec. The local copy is intact, so
        // the next change tries again.
        setDirty(true)
      })
  }, [projectId, saveWorkspace, secret])

  const kind: "game" | "website" = local?.kind ?? project?.kind ?? "game"

  const save = useCallback(
    (workspace: WorkspaceState, spec: NuggetSpec | null) => {
      const serialized = JSON.stringify(workspace)

      // localStorage first, always. Losing work is the one unforgivable bug.
      saveLocalProject({
        id: projectId,
        secret: secret ?? "",
        name,
        kind: spec?.nugget.kind ?? kind,
        workspace: serialized,
      })
      bump()

      if (!secret) return
      pending.current = { workspace: serialized, spec }
      setDirty(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, SYNC_DEBOUNCE_MS)
    },
    [flush, kind, name, projectId, secret]
  )

  const rename = useCallback(
    (next: string) => {
      const trimmed = next.slice(0, 80) || "My project"
      setRenamed(trimmed)
      if (local) {
        saveLocalProject({ ...local, name: trimmed })
        bump()
      }
      if (secret) {
        void renameRemote({ projectId, secret, name: trimmed }).catch(
          () => undefined
        )
      }
    },
    [local, projectId, renameRemote, secret]
  )

  /* ── never lose the last edit ── */
  useEffect(() => {
    const onLeave = () => flush()
    window.addEventListener("pagehide", onLeave)
    document.addEventListener("visibilitychange", onLeave)
    return () => {
      window.removeEventListener("pagehide", onLeave)
      document.removeEventListener("visibilitychange", onLeave)
      onLeave()
    }
  }, [flush])

  const status: ProjectStatus = !hydrated
    ? "loading"
    : !secret
      ? "denied"
      : remote === undefined
        ? "loading"
        : remote.ok
          ? "ready"
          : remote.reason === "denied"
            ? "denied"
            : "missing"

  return {
    status,
    secret,
    name,
    kind,
    initialWorkspace,
    sandboxId: project?.sandboxId ?? null,
    previewUrl: project?.previewUrl ?? null,
    visibility: project?.visibility ?? "private",
    dirty,
    save,
    rename,
    flush,
  }
}
