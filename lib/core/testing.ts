/**
 * Reading test output, and deciding what to do about it.
 *
 * The tester prompt (`lib/core/prompts/shared.ts`) mandates exactly one line
 * per test: `PASS: <name>` or `FAIL: <name>`. That contract is what makes this
 * module possible without a test framework inside the sandbox.
 *
 * Pure module — the test phase does the running, this does the thinking.
 */

export interface TestCase {
  name: string
  passed: boolean
}

export interface TestReport {
  cases: TestCase[]
  passed: number
  failed: number
  total: number
  /** 0..1. A run with no tests has a rate of 0, not 1 — see `gateDecision`. */
  passRate: number
}

const RESULT_LINE = /^\s*(?:[-*]\s*)?(PASS|FAIL)\b[\s:–—-]*(.*)$/i

/**
 * Pull test results out of whatever the sandbox printed.
 *
 * A re-run appends to the same output, so a later line for the same test name
 * replaces the earlier one — the tester is told to run twice and confirm.
 */
export function parseTestOutput(output: string): TestReport {
  const byName = new Map<string, boolean>()
  const order: string[] = []

  for (const line of String(output ?? "").split(/\r?\n/)) {
    const match = RESULT_LINE.exec(line)
    if (!match) continue
    const passed = match[1].toUpperCase() === "PASS"
    const name =
      match[2].trim().replace(/\s+/g, " ").slice(0, 200) || "unnamed check"
    if (!byName.has(name)) order.push(name)
    byName.set(name, passed)
  }

  const cases = order.map((name) => ({
    name,
    passed: byName.get(name) === true,
  }))
  const passed = cases.filter((c) => c.passed).length
  const failed = cases.length - passed

  return {
    cases,
    passed,
    failed,
    total: cases.length,
    passRate: cases.length === 0 ? 0 : passed / cases.length,
  }
}

/* ════════════════════════════════════════════════════════════════════════
   The gate
   ════════════════════════════════════════════════════════════════════════ */

/**
 * elisa gates on pass rate by level: explorer none, builder 50% + 1 auto-fix,
 * architect 80% + 2. v1 ships the builder setting for everyone — a child should
 * see their thing run, so a partial pass still previews.
 */
export const TEST_GATE = {
  minPassRate: 0.5,
  maxFixAttempts: 1,
} as const

export type GateOutcome = "pass" | "fix" | "accept"

export interface GateDecision {
  outcome: GateOutcome
  /** Kid-facing. Goes straight into the narrator feed. */
  message: string
}

/**
 * What to do after a test run.
 *
 * - `pass`    — good enough, carry on to the preview.
 * - `fix`     — below the bar and we still have a repair attempt left.
 * - `accept`  — below the bar with no attempts left: preview anyway and be
 *               honest about what is broken. Never leave a child with nothing.
 */
export function gateDecision(
  report: TestReport,
  fixAttempts: number
): GateDecision {
  if (report.total === 0) {
    return {
      outcome: "pass",
      message:
        "I didn't have any checks to run this time, so I'll show you what I made.",
    }
  }

  if (report.passRate >= TEST_GATE.minPassRate && report.failed === 0) {
    return { outcome: "pass", message: `All ${report.total} checks passed. 🎉` }
  }

  if (report.passRate >= TEST_GATE.minPassRate) {
    return {
      outcome: "pass",
      message: `${report.passed} of ${report.total} checks passed. I'll show it to you — one part still needs work.`,
    }
  }

  if (fixAttempts < TEST_GATE.maxFixAttempts) {
    return {
      outcome: "fix",
      message: `${report.failed} of ${report.total} checks failed. Let me have one go at fixing that.`,
    }
  }

  return {
    outcome: "accept",
    message: `${report.failed} of ${report.total} checks still fail. Here's what I built — let's look at it together.`,
  }
}

/** The first few failures, for Dr. Bug and for the repair task's description. */
export function failureDigest(report: TestReport, limit = 5): string {
  const failures = report.cases.filter((c) => !c.passed).slice(0, limit)
  if (!failures.length) return ""
  return failures.map((f) => `- ${f.name}`).join("\n")
}

/** One sentence for the feed. */
export function kidSummary(report: TestReport): string {
  if (report.total === 0) return "No checks ran."
  if (report.failed === 0) return `All ${report.total} checks passed.`
  return `${report.passed} of ${report.total} checks passed.`
}

/* ════════════════════════════════════════════════════════════════════════
   Running them
   ════════════════════════════════════════════════════════════════════════ */

/** Where the tester is told to put its tests. */
export const TESTS_DIR = "tests"

/**
 * The command that runs every test file and keeps going after a failure.
 *
 * `set +e` matters: without it the first non-zero exit would hide every later
 * test, and the tester's whole job is to report all of them.
 */
export function testCommand(): string {
  return [
    "set +e",
    `if [ ! -d ${TESTS_DIR} ]; then echo "NO_TESTS"; exit 0; fi`,
    `files=$(ls ${TESTS_DIR}/*.js 2>/dev/null)`,
    'if [ -z "$files" ]; then echo "NO_TESTS"; exit 0; fi',
    'for f in $files; do echo "--- $f"; node "$f" 2>&1; done',
  ].join("; ")
}

export function sawNoTests(output: string): boolean {
  return /\bNO_TESTS\b/.test(output)
}
