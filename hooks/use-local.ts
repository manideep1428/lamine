"use client"

/**
 * localStorage, as a React external store.
 *
 * Reading the browser's storage in an effect and calling `setState` causes a
 * cascading render and an SSR/client mismatch. `useSyncExternalStore` is the
 * supported way to read a value that only exists on the client: React asks for a
 * server snapshot, then re-reads on the client, and re-renders when the store
 * says so.
 *
 * It also buys cross-tab sync for free — the `storage` event fires in every other
 * tab, so deleting a project in one updates the list in the rest.
 */

import { useCallback, useMemo, useSyncExternalStore } from "react"

import { getOwnerId } from "@/lib/identity"
import { listLocalProjects, type LocalProject } from "@/lib/storage"

type Listener = () => void

const listeners = new Set<Listener>()
let version = 0

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  if (listeners.size === 1 && typeof window !== "undefined") {
    window.addEventListener("storage", bump)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", bump)
    }
  }
}

/** Tell every reader that localStorage changed. */
export function bump(): void {
  version++
  for (const listener of listeners) listener()
}

/* ════════════════════════════════════════════════════════════════════════
   The project list
   ════════════════════════════════════════════════════════════════════════ */

const NO_PROJECTS: LocalProject[] = []

let listVersion = -1
let listCache: LocalProject[] = NO_PROJECTS

/**
 * Snapshots must be referentially stable or React re-renders for ever, so the
 * list is recomputed only when something said it changed.
 */
function projectsSnapshot(): LocalProject[] {
  if (listVersion !== version) {
    listCache = listLocalProjects()
    listVersion = version
  }
  return listCache
}

function noProjects(): LocalProject[] {
  return NO_PROJECTS
}

export function useLocalProjects(): LocalProject[] {
  return useSyncExternalStore(subscribe, projectsSnapshot, noProjects)
}

export function useLocalProject(id: string): LocalProject | null {
  const all = useLocalProjects()
  return useMemo(() => all.find((p) => p.id === id) ?? null, [all, id])
}

/* ════════════════════════════════════════════════════════════════════════
   The anonymous owner id
   ════════════════════════════════════════════════════════════════════════ */

let ownerCache: string | null = null

function ownerSnapshot(): string | null {
  ownerCache ??= getOwnerId()
  return ownerCache
}

function noOwner(): string | null {
  return null
}

/** Null on the server, a stable UUID in the browser. */
export function useOwnerId(): string | null {
  return useSyncExternalStore(subscribe, ownerSnapshot, noOwner)
}

/* ════════════════════════════════════════════════════════════════════════
   Hydration
   ════════════════════════════════════════════════════════════════════════ */

const yes = () => true
const no = () => false

/**
 * False on the server and during hydration, true afterwards.
 *
 * Without this, a component cannot tell "localStorage says there is no project"
 * from "localStorage has not been read yet", and the studio flashes a
 * can't-open-that message before settling.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, yes, no)
}

/* ════════════════════════════════════════════════════════════════════════
   Small stored preferences
   ════════════════════════════════════════════════════════════════════════ */

const scalarCache = new Map<string, { version: number; value: unknown }>()

/**
 * A single remembered setting — the voice toggle, the bottom bar's height.
 *
 * The fallback is what the server renders, so a preference that changes layout
 * should only be read inside a tree that is client-only (the studio renders a
 * loading state until localStorage has been read).
 */
export function useStoredValue<T>(
  key: string,
  fallback: T,
  parse: (raw: string) => T | null
): [T, (value: T) => void] {
  const snapshot = useCallback((): T => {
    const cached = scalarCache.get(key)
    if (cached && cached.version === version) return cached.value as T

    let value = fallback
    try {
      const raw =
        typeof window === "undefined" ? null : window.localStorage.getItem(key)
      const parsed = raw === null ? null : parse(raw)
      if (parsed !== null) value = parsed
    } catch {
      /* private mode: the fallback is correct */
    }
    scalarCache.set(key, { version, value })
    return value
  }, [fallback, key, parse])

  const serverSnapshot = useCallback(() => fallback, [fallback])

  const value = useSyncExternalStore(subscribe, snapshot, serverSnapshot)

  const set = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, String(next))
      } catch {
        /* private mode: the change lives for this session only */
      }
      scalarCache.set(key, { version: version + 1, value: next })
      bump()
    },
    [key]
  )

  return [value, set]
}
