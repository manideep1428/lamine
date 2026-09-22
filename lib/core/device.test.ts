import { describe, expect, it } from "vitest"

import { interpretWorkspace } from "./blocks"
import { expectedScaffold, frameworkGuidance } from "./prompts/frameworks"
import { buildSystemPrompt, buildTaskPrompt } from "./prompts/shared"
import { metaPlannerUser } from "./prompts/planner"
import { finalizeSpec, readiness, type SpecDraft } from "./spec"
import { EXAMPLES } from "../examples"

/**
 * The device target.
 *
 * A board project is the one case where the promise "your checks really run"
 * cannot hold — there is no board in the sandbox. These tests pin down the two
 * things that keep it honest: the agents are told what is wired up and told never
 * to touch anything else, and the tester is told it cannot run the sketch.
 */

function deviceSpec(
  parts: { part: string; pin: string }[] = [{ part: "LED", pin: "13" }]
) {
  const draft: SpecDraft = {
    nugget: { goal: "a night light", kind: "device" },
    framework: "arduino",
    requirements: [{ id: "r1", description: "turn on when it is dark" }],
    behavioralTests: [
      { id: "b1", when: "it gets dark", then: "the light comes on" },
    ],
    data: [],
    parts,
    skills: [],
  }
  return finalizeSpec(draft).spec
}

describe("the device target", () => {
  it("will not build until a part is wired up", () => {
    expect(readiness(deviceSpec([])).reasons.join(" ")).toMatch(
      /plugged into your board/
    )
    expect(readiness(deviceSpec()).ready).toBe(true)
  })

  it("scaffolds a sketch folder, not a web page", () => {
    const files = expectedScaffold("arduino", "device")
    expect(files).toContain("sketch/sketch.ino")
    expect(files).toContain("sketch/pins.h")
    // The Arduino IDE requires the .ino to sit in a folder of the same name.
    expect(files.every((f) => !f.endsWith(".html"))).toBe(true)
  })

  it("gives the builder sketch guidance and no browser error bridge", () => {
    const guidance = frameworkGuidance("arduino", "device")
    expect(guidance).toContain("ESP32 sketch")
    expect(guidance).toContain("millis()")
    // window.onerror does not exist on a board.
    expect(guidance).not.toContain("lamine:error")
  })

  it("warns the builder off delay() and off unlisted pins", () => {
    const prompt = buildSystemPrompt({
      role: "builder",
      agentName: "Codey",
      persona: "careful",
      spec: deviceSpec(),
      allowedPaths: ["sketch/"],
      maxTurns: 12,
    })
    expect(prompt).toContain("Do NOT use `delay()`")
    expect(prompt).toContain("pins the child did not list")
  })

  it("tells the tester it cannot run the sketch, and drops the browser rule", () => {
    const prompt = buildSystemPrompt({
      role: "tester",
      agentName: "Dr. Bug",
      persona: "honest",
      spec: deviceSpec(),
      allowedPaths: ["tests/"],
      maxTurns: 12,
    })
    expect(prompt).toContain("How to check a sketch you cannot run")
    expect(prompt).toContain("never claim a behaviour was observed")
    expect(prompt).not.toContain("do NOT install jsdom")
  })

  it("keeps the browser rule for a game", () => {
    const game = finalizeSpec({
      nugget: { goal: "dodging rocks", kind: "game" },
      framework: "canvas",
      requirements: [{ id: "r1", description: "move" }],
      behavioralTests: [],
      data: [],
      skills: [],
    }).spec
    const prompt = buildSystemPrompt({
      role: "tester",
      agentName: "Dr. Bug",
      persona: "honest",
      spec: game,
      allowedPaths: ["tests/"],
      maxTurns: 12,
    })
    expect(prompt).toContain("do NOT install jsdom")
    expect(prompt).not.toContain("How to check a sketch you cannot run")
  })

  it("passes the wiring to both the planner and the builder", () => {
    const spec = deviceSpec([
      { part: "LED", pin: "13" },
      { part: "button", pin: "12" },
    ])

    const planner = metaPlannerUser(spec)
    expect(planner).toContain("LED on pin 13")
    expect(planner).toContain("button on pin 12")
    expect(planner).toMatch(/Never use a pin that is not in this list/)

    const task = buildTaskPrompt({
      taskId: "t1",
      taskName: "Scaffold",
      description: "Create the sketch.",
      acceptanceCriteria: [],
      spec,
      predecessors: [],
      fileManifest: [],
    })
    expect(task).toContain("LED on pin 13")
    expect(task).toMatch(/Never read or write a pin that is not in this list/)
  })

  it("caps a pin label rather than trusting it", () => {
    const spec = deviceSpec([
      { part: "LED", pin: "GPIO4-and-a-whole-sentence-more" },
    ])
    expect(spec.parts[0].pin.length).toBeLessThanOrEqual(12)
  })

  it("ships a device example that is ready to build", () => {
    const example = EXAMPLES.find((e) => e.category === "device")
    expect(example, "no device example is bundled").toBeDefined()
    const result = interpretWorkspace(example!.workspace)
    expect(result.problems).toEqual([])
    expect(readiness(result.spec).ready).toBe(true)
    expect(result.spec!.framework).toBe("arduino")
  })
})
