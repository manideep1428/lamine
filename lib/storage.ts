/**
 * Local-first project storage.
 *
 * localStorage is the *fast* copy: written on every block change, works
 * offline, zero latency. Convex is the *real* copy: written on a debounce,
 * holds builds, previews and the agent feed.
 *
 * On load we take whichever side has the newer `updatedAt`, which covers the
 * case where the tab closed mid-sync.
 */

import type { ProjectKind } from "./core/spec"
import { randomId } from "./identity"

const INDEX_KEY = "lamine:projects"
const projectKey = (id: string) => `lamine:project:${id}`

/** What we keep locally. A subset of the Convex document. */
export interface LocalProject {
  id: string
  /** Capability key. Possession of this is the permission — never shown in UI. */
  secret: string
  name: string
  kind: ProjectKind
  workspace: string
  updatedAt: number
}

/** The fields we care about when merging with the server copy. */
export interface RemoteProject {
  id: string
  name: string
  kind: ProjectKind
  workspace: string
  updatedAt: number
}

function hasStorage(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage
  } catch {
    return false
  }
}

function readJson<T>(key: string): T | null {
  if (!hasStorage()) return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    // Corrupt entry — treat as absent rather than breaking the studio.
    return null
  }
}

function writeJson(key: string, value: unknown): boolean {
  if (!hasStorage()) return false
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    // Quota exceeded. The Convex copy is still authoritative, so this is
    // survivable; the caller may surface a gentle warning.
    return false
  }
}

export function newSecret(): string {
  return randomId()
}

export function listLocalProjects(): LocalProject[] {
  const ids = readJson<string[]>(INDEX_KEY) ?? []
  return ids
    .map((id) => readJson<LocalProject>(projectKey(id)))
    .filter((p): p is LocalProject => p !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function loadLocalProject(id: string): LocalProject | null {
  return readJson<LocalProject>(projectKey(id))
}

/** Write the project locally and make sure it is in the index. */
export function saveLocalProject(
  project: Omit<LocalProject, "updatedAt">
): LocalProject {
  const record: LocalProject = { ...project, updatedAt: Date.now() }
  writeJson(projectKey(record.id), record)

  const ids = readJson<string[]>(INDEX_KEY) ?? []
  if (!ids.includes(record.id)) writeJson(INDEX_KEY, [record.id, ...ids])

  return record
}

export function forgetLocalProject(id: string): void {
  if (!hasStorage()) return
  try {
    window.localStorage.removeItem(projectKey(id))
  } catch {
    /* ignore */
  }
  const ids = readJson<string[]>(INDEX_KEY) ?? []
  writeJson(
    INDEX_KEY,
    ids.filter((x) => x !== id)
  )
}

export interface MergeResult<L, R> {
  /** Which copy won. "neither" means the project is genuinely unknown. */
  source: "local" | "remote" | "neither"
  workspace: string | null
  name: string | null
  local: L | null
  remote: R | null
}

/**
 * Last-write-wins merge. Pure and exported so it can be tested without a browser.
 *
 * Ties go to remote: if both stamps are identical the server copy is the one
 * other devices can see, so preferring it keeps things converging.
 */
export function loadNewest(
  local: LocalProject | null,
  remote: RemoteProject | null
): MergeResult<LocalProject, RemoteProject> {
  if (!local && !remote) {
    return {
      source: "neither",
      workspace: null,
      name: null,
      local: null,
      remote: null,
    }
  }
  if (local && !remote) {
    return {
      source: "local",
      workspace: local.workspace,
      name: local.name,
      local,
      remote: null,
    }
  }
  if (!local && remote) {
    return {
      source: "remote",
      workspace: remote.workspace,
      name: remote.name,
      local: null,
      remote,
    }
  }

  const l = local!
  const r = remote!
  const localWins = l.updatedAt > r.updatedAt
  return {
    source: localWins ? "local" : "remote",
    workspace: localWins ? l.workspace : r.workspace,
    name: localWins ? l.name : r.name,
    local: l,
    remote: r,
  }
}
