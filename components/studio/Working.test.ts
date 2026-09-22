import { describe, expect, it } from "vitest"

import { isBuilding, phaseLabel, stillAhead } from "./Working"

/**
 * What a child is told while they wait.
 *
 * The plan, code and checks views used to show "press GO" even while a build was
 * running, which reads as nothing happening. These three functions decide between
 * an invitation, a loader, and a loader that explains what it is waiting for — so
 * getting them wrong means either a spinner that never resolves or an invitation
 * to do something already underway.
 */

const LIVE = ["planning", "executing", "testing", "previewing"]
const SETTLED = ["idle", "done", "failed", "stopped"]

describe("isBuilding", () => {
  it("is true for every phase of a running build", () => {
    for (const phase of LIVE) expect(isBuilding(phase), phase).toBe(true)
  })

  it("is false once a session has settled, so the invitation comes back", () => {
    for (const phase of SETTLED) expect(isBuilding(phase), phase).toBe(false)
  })
})

describe("phaseLabel", () => {
  it("names what is actually happening, in the child's words", () => {
    expect(phaseLabel("planning")).toBe("Working out a plan…")
    expect(phaseLabel("executing")).toBe("Writing the code…")
    expect(phaseLabel("testing")).toBe("Running your checks…")
    expect(phaseLabel("previewing")).toBe("Getting it ready to play…")
  })

  it("never shows a raw state name to a child", () => {
    for (const phase of [...LIVE, ...SETTLED, "nonsense"]) {
      const label = phaseLabel(phase)
      // A phrase, not an identifier: the state name itself must never surface.
      expect(label, phase).not.toBe(phase)
      expect(label, phase).toMatch(/^[A-Z].* /)
    }
  })
})

describe("stillAhead", () => {
  it("knows the checks have not started while the code is being written", () => {
    expect(stillAhead("executing", "testing")).toBe(true)
    expect(stillAhead("planning", "testing")).toBe(true)
  })

  it("knows they are underway once testing begins", () => {
    expect(stillAhead("testing", "testing")).toBe(false)
    expect(stillAhead("previewing", "testing")).toBe(false)
  })

  it("claims nothing about a settled session", () => {
    for (const phase of SETTLED) {
      expect(stillAhead(phase, "testing"), phase).toBe(false)
    }
  })
})
