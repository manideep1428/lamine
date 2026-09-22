import { describe, expect, it } from "vitest"

import { loadNewest, type LocalProject, type RemoteProject } from "./storage"

const local = (updatedAt: number, workspace = "local-ws"): LocalProject => ({
  id: "p1",
  secret: "s",
  name: "Local name",
  kind: "game",
  workspace,
  updatedAt,
})

const remote = (updatedAt: number, workspace = "remote-ws"): RemoteProject => ({
  id: "p1",
  name: "Remote name",
  kind: "game",
  workspace,
  updatedAt,
})

describe("loadNewest", () => {
  it("returns neither when both sides are missing", () => {
    const r = loadNewest(null, null)
    expect(r.source).toBe("neither")
    expect(r.workspace).toBeNull()
  })

  it("uses local when there is no remote copy", () => {
    const r = loadNewest(local(100), null)
    expect(r.source).toBe("local")
    expect(r.workspace).toBe("local-ws")
  })

  it("uses remote when there is no local copy", () => {
    const r = loadNewest(null, remote(100))
    expect(r.source).toBe("remote")
    expect(r.workspace).toBe("remote-ws")
  })

  it("prefers whichever side is newer", () => {
    expect(loadNewest(local(200), remote(100)).source).toBe("local")
    expect(loadNewest(local(100), remote(200)).source).toBe("remote")
  })

  // The tab-closed-mid-sync case: local is ahead, so it must win.
  it("keeps unsynced local edits", () => {
    const r = loadNewest(local(500, "edited-offline"), remote(400))
    expect(r.workspace).toBe("edited-offline")
  })

  it("breaks ties in favour of remote so devices converge", () => {
    const r = loadNewest(local(300), remote(300))
    expect(r.source).toBe("remote")
    expect(r.workspace).toBe("remote-ws")
  })

  it("always returns both copies so the caller can reconcile", () => {
    const r = loadNewest(local(100), remote(200))
    expect(r.local).not.toBeNull()
    expect(r.remote).not.toBeNull()
    expect(r.name).toBe("Remote name")
  })
})
