import { describe, expect, it } from "vitest"

import {
  describeToolCall,
  parseToolArguments,
  readDoneArgs,
  TOOL,
  toolNamesFor,
  toolsFor,
  verdictIsGood,
  VERDICTS,
} from "./tools"

describe("toolsFor", () => {
  it("gives builders and testers the write tool", () => {
    expect(toolNamesFor("builder")).toContain(TOOL.write)
    expect(toolNamesFor("tester")).toContain(TOOL.write)
  })

  it("refuses the reviewer a write tool — that is what makes it a reviewer", () => {
    const names = toolNamesFor("reviewer")
    expect(names).not.toContain(TOOL.write)
    expect(names).toEqual([TOOL.read, TOOL.list, TOOL.run, TOOL.done])
  })

  it("always includes done, so a task can always end", () => {
    for (const role of ["builder", "tester", "reviewer", "nonsense"]) {
      expect(toolNamesFor(role)).toContain(TOOL.done)
    }
  })

  it("declares every tool strict with a closed schema", () => {
    for (const tool of toolsFor("builder")) {
      expect(tool.strict).toBe(true)
      expect(tool.parameters.additionalProperties).toBe(false)
      // strict mode requires every property to be listed as required
      expect(tool.parameters.required.sort()).toEqual(
        Object.keys(tool.parameters.properties).sort()
      )
    }
  })
})

describe("parseToolArguments", () => {
  it("reads an object", () => {
    expect(parseToolArguments('{"path":"a.js","content":"x"}')).toEqual({
      path: "a.js",
      content: "x",
    })
  })

  it("degrades to an empty object rather than throwing", () => {
    expect(parseToolArguments("not json")).toEqual({})
    expect(parseToolArguments("[1,2]")).toEqual({})
    expect(parseToolArguments("null")).toEqual({})
    expect(parseToolArguments(undefined)).toEqual({})
  })
})

describe("readDoneArgs", () => {
  it("accepts and normalises a known verdict", () => {
    expect(
      readDoneArgs({ verdict: "pass", summary: " ran them " }, "tester")
    ).toEqual({
      verdict: "PASS",
      summary: "ran them",
    })
  })

  it("falls back per role when the model invents a verdict", () => {
    expect(readDoneArgs({ verdict: "vibes" }, "tester").verdict).toBe("FAIL")
    expect(readDoneArgs({}, "reviewer").verdict).toBe("NEEDS_CHANGES")
    expect(readDoneArgs({}, "builder").verdict).toBe("OK")
  })
})

describe("verdictIsGood", () => {
  it("treats OK, PASS and APPROVED as success", () => {
    expect(VERDICTS.filter(verdictIsGood)).toEqual(["OK", "PASS", "APPROVED"])
  })

  it("treats a missing verdict as failure", () => {
    expect(verdictIsGood(undefined)).toBe(false)
  })
})

describe("describeToolCall", () => {
  it("reads like something a child could follow", () => {
    expect(describeToolCall(TOOL.write, { path: "src/player.js" })).toBe(
      "Writing src/player.js"
    )
    expect(describeToolCall(TOOL.list, {})).toBe(
      "Looking in the project folder"
    )
  })

  it("truncates a long command", () => {
    const text = describeToolCall(TOOL.run, { cmd: "x".repeat(400) })
    expect(text.length).toBeLessThan(140)
  })
})
