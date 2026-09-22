import { describe, expect, it } from "vitest"

import {
  byteSize,
  collectOutputText,
  functionCallOutput,
  functionCalls,
  HISTORY_LIMITS,
  keepableOutput,
  trimHistory,
} from "./turns"

describe("functionCalls", () => {
  it("picks out the tool calls and ignores everything else", () => {
    const calls = functionCalls([
      { type: "reasoning", summary: [] },
      {
        type: "function_call",
        name: "write_file",
        call_id: "c1",
        arguments: '{"path":"a.js"}',
      },
      { type: "message", content: [{ type: "output_text", text: "hi" }] },
    ])
    expect(calls).toEqual([
      { name: "write_file", callId: "c1", arguments: '{"path":"a.js"}' },
    ])
  })

  it("skips a malformed call rather than throwing mid-build", () => {
    expect(functionCalls([{ type: "function_call", name: "run" }])).toEqual([])
    expect(functionCalls(undefined)).toEqual([])
  })
})

describe("collectOutputText", () => {
  it("joins the model's prose", () => {
    const text = collectOutputText([
      {
        type: "message",
        content: [{ type: "output_text", text: "Built the player." }],
      },
      { type: "function_call", name: "done", call_id: "c1", arguments: "{}" },
    ])
    expect(text).toBe("Built the player.")
  })

  it("returns an empty string when the model only used tools", () => {
    expect(
      collectOutputText([
        { type: "function_call", name: "run", call_id: "c", arguments: "{}" },
      ])
    ).toBe("")
  })
})

describe("keepableOutput", () => {
  it("drops reasoning items, which cannot be replayed", () => {
    const kept = keepableOutput([
      { type: "reasoning", id: "rs_1" },
      { type: "function_call", name: "run", call_id: "c1", arguments: "{}" },
    ])
    expect(kept).toEqual([
      { type: "function_call", name: "run", call_id: "c1", arguments: "{}" },
    ])
  })
})

describe("functionCallOutput", () => {
  it("shapes a tool result and caps its size", () => {
    const item = functionCallOutput(
      "c1",
      "x".repeat(HISTORY_LIMITS.maxStringChars + 50)
    )
    expect(item.type).toBe("function_call_output")
    expect(item.call_id).toBe("c1")
    expect(String(item.output).length).toBe(HISTORY_LIMITS.maxStringChars)
  })
})

describe("trimHistory", () => {
  it("leaves a small conversation alone", () => {
    const items = [
      { role: "user", content: "do the thing" },
      { type: "function_call" },
    ]
    expect(trimHistory(items)).toEqual(items)
  })

  it("truncates a giant file write instead of storing it", () => {
    const trimmed = trimHistory([
      { role: "user", content: "brief" },
      {
        type: "function_call",
        arguments: JSON.stringify({ content: "x".repeat(50_000) }),
      },
    ]) as Record<string, unknown>[]
    expect(String(trimmed[1].arguments)).toContain("(trimmed)")
    expect(String(trimmed[1].arguments).length).toBeLessThan(
      HISTORY_LIMITS.maxStringChars + 100
    )
  })

  it("keeps the briefing and the recent turns, and marks what it dropped", () => {
    const items = [
      { role: "user", content: "THE BRIEFING" },
      ...Array.from({ length: 200 }, (_, i) => ({
        type: "function_call_output",
        output: "y".repeat(5_000),
        seq: i,
      })),
    ]

    const trimmed = trimHistory(items) as Record<string, unknown>[]

    expect(byteSize(trimmed)).toBeLessThanOrEqual(HISTORY_LIMITS.maxBytes)
    expect(trimmed[0]).toEqual({ role: "user", content: "THE BRIEFING" })
    expect(String(trimmed[1].content)).toMatch(/trimmed to save space/)
    // the newest item survives
    expect(trimmed[trimmed.length - 1].seq).toBe(199)
  })
})
