import { describe, expect, it } from "vitest"

import {
  failureDigest,
  gateDecision,
  kidSummary,
  parseTestOutput,
  sawNoTests,
  TEST_GATE,
  testCommand,
} from "./testing"

describe("parseTestOutput", () => {
  it("reads the PASS/FAIL contract the tester prompt mandates", () => {
    const report = parseTestOutput(
      [
        "--- tests/test_t1.js",
        "PASS: player moves on keydown",
        "FAIL: rock collision loses a life",
        "PASS: score goes up",
      ].join("\n")
    )
    expect(report.total).toBe(3)
    expect(report.passed).toBe(2)
    expect(report.failed).toBe(1)
    expect(report.passRate).toBeCloseTo(2 / 3)
  })

  it("ignores prose around the results", () => {
    const report = parseTestOutput(
      "Running checks now...\nPASS: it exists\nDone.\nnothing else to report"
    )
    expect(report.cases).toEqual([{ name: "it exists", passed: true }])
  })

  it("lets a re-run replace an earlier result for the same test", () => {
    const report = parseTestOutput("FAIL: flaky check\nPASS: flaky check")
    expect(report.cases).toEqual([{ name: "flaky check", passed: true }])
    expect(report.total).toBe(1)
  })

  it("tolerates bullets, dashes and casing", () => {
    const report = parseTestOutput("- pass - one\n* FAIL: two\nPASS three")
    expect(report.total).toBe(3)
    expect(report.passed).toBe(2)
  })

  it("reports zero tests rather than a perfect score", () => {
    const report = parseTestOutput("no output at all")
    expect(report.total).toBe(0)
    expect(report.passRate).toBe(0)
  })
})

describe("gateDecision", () => {
  const report = (passed: number, failed: number) =>
    parseTestOutput(
      [
        ...Array.from({ length: passed }, (_, i) => `PASS: p${i}`),
        ...Array.from({ length: failed }, (_, i) => `FAIL: f${i}`),
      ].join("\n")
    )

  it("passes a clean run", () => {
    expect(gateDecision(report(3, 0), 0).outcome).toBe("pass")
  })

  it("passes a partial run above the bar, so the kid still sees their thing", () => {
    const decision = gateDecision(report(2, 1), 0)
    expect(decision.outcome).toBe("pass")
    expect(decision.message).toContain("2 of 3")
  })

  it("asks for a repair below the bar while an attempt is left", () => {
    expect(gateDecision(report(1, 3), 0).outcome).toBe("fix")
  })

  it("stops repairing once the attempts are used up", () => {
    expect(gateDecision(report(1, 3), TEST_GATE.maxFixAttempts).outcome).toBe(
      "accept"
    )
  })

  it("never blocks the preview when no checks existed", () => {
    expect(gateDecision(report(0, 0), 0).outcome).toBe("pass")
  })
})

describe("reporting helpers", () => {
  it("digests failures for Dr. Bug", () => {
    const digest = failureDigest(parseTestOutput("FAIL: a\nFAIL: b\nPASS: c"))
    expect(digest).toBe("- a\n- b")
  })

  it("summarises in one sentence", () => {
    expect(kidSummary(parseTestOutput("PASS: a\nPASS: b"))).toBe(
      "All 2 checks passed."
    )
    expect(kidSummary(parseTestOutput("PASS: a\nFAIL: b"))).toBe(
      "1 of 2 checks passed."
    )
  })
})

describe("testCommand", () => {
  it("keeps running after a failing file", () => {
    expect(testCommand()).toContain("set +e")
  })

  it("signals the no-tests case instead of looking like a pass", () => {
    expect(sawNoTests("NO_TESTS")).toBe(true)
    expect(sawNoTests("PASS: a")).toBe(false)
  })
})
