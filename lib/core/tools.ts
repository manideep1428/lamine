/**
 * The agent tool surface.
 *
 * These are the OpenAI Responses API function definitions the builder, tester
 * and reviewer call. `strict: true` means the arguments are constrained at
 * decode time, so `write_file` can never arrive without a `path` — which is why
 * there is no defensive re-validation of shapes downstream, only of *values*
 * (see `lib/core/paths.ts`).
 *
 * Pure module: no OpenAI import, no Convex, no sandbox. The execute phase wires
 * it up; this file is what the tests assert against.
 */

import type { AgentRole } from "./plan"

export const TOOL = {
  write: "write_file",
  read: "read_file",
  list: "list_files",
  run: "run",
  done: "done",
} as const

export type ToolName = (typeof TOOL)[keyof typeof TOOL]

/** Verdicts `done()` accepts, across all three roles. */
export const VERDICTS = [
  "OK",
  "PASS",
  "FAIL",
  "APPROVED",
  "NEEDS_CHANGES",
] as const
export type Verdict = (typeof VERDICTS)[number]

/** Verdicts that mean "this task landed". Anything else is a failure. */
const GOOD_VERDICTS = new Set<string>(["OK", "PASS", "APPROVED"])

export function verdictIsGood(verdict: string | undefined): boolean {
  return GOOD_VERDICTS.has((verdict ?? "").toUpperCase())
}

/* ════════════════════════════════════════════════════════════════════════
   Definitions
   ════════════════════════════════════════════════════════════════════════ */

export interface ToolProperty {
  type: string
  description: string
  enum?: readonly string[]
}

/**
 * A type alias rather than an interface on purpose: TypeScript only grants an
 * implicit index signature to aliases, which is what lets these pass straight
 * into the OpenAI SDK's `parameters: { [key: string]: unknown }`.
 */
export type ToolParameters = {
  type: "object"
  additionalProperties: false
  required: string[]
  properties: Record<string, ToolProperty>
}

export type FunctionToolDef = {
  type: "function"
  name: ToolName
  description: string
  strict: true
  parameters: ToolParameters
}

const WRITE_FILE: FunctionToolDef = {
  type: "function",
  name: TOOL.write,
  description:
    "Create or replace a file in the project. Always write the whole file, never a fragment. The path must be relative to the project root and inside the files this task is allowed to write.",
  strict: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["path", "content"],
    properties: {
      path: {
        type: "string",
        description: "Project-relative path, e.g. src/player.js",
      },
      content: {
        type: "string",
        description: "The complete contents of the file.",
      },
    },
  },
}

const READ_FILE: FunctionToolDef = {
  type: "function",
  name: TOOL.read,
  description:
    "Read a file another agent wrote. Anywhere inside the project is readable.",
  strict: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["path"],
    properties: {
      path: {
        type: "string",
        description: "Project-relative path, e.g. index.html",
      },
    },
  },
}

const LIST_FILES: FunctionToolDef = {
  type: "function",
  name: TOOL.list,
  description:
    "List a folder in the project. Pass an empty string for the project root.",
  strict: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["dir"],
    properties: {
      dir: {
        type: "string",
        description: 'Project-relative folder, or "" for the root.',
      },
    },
  },
}

const RUN: FunctionToolDef = {
  type: "function",
  name: TOOL.run,
  description:
    "Run a shell command in the project folder. Use it for `node --check file.js` and for running your tests. Network commands, package installs and servers are refused.",
  strict: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["cmd"],
    properties: {
      cmd: {
        type: "string",
        description: "The command, e.g. node --check src/main.js",
      },
    },
  },
}

const DONE: FunctionToolDef = {
  type: "function",
  name: TOOL.done,
  description:
    "Finish the task. Call this exactly once, at the end, with your verdict and a short summary the next agent will read.",
  strict: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["verdict", "summary"],
    properties: {
      verdict: {
        type: "string",
        description:
          "Builders use OK or FAIL. Testers use PASS or FAIL. Reviewers use APPROVED or NEEDS_CHANGES.",
        enum: VERDICTS,
      },
      summary: {
        type: "string",
        description:
          "Two or three sentences: what you did, which files, what the next agent needs.",
      },
    },
  },
}

/**
 * Which tools a role gets.
 *
 * The reviewer has no `write_file` — that is the difference between a reviewer
 * and a second builder. It reports problems; the team fixes them.
 */
export function toolsFor(role: AgentRole | string): FunctionToolDef[] {
  if (role === "reviewer") return [READ_FILE, LIST_FILES, RUN, DONE]
  return [WRITE_FILE, READ_FILE, LIST_FILES, RUN, DONE]
}

export function toolNamesFor(role: AgentRole | string): ToolName[] {
  return toolsFor(role).map((t) => t.name)
}

/* ════════════════════════════════════════════════════════════════════════
   Argument handling
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Parse a tool call's arguments.
 *
 * `strict: true` makes malformed JSON essentially impossible, but a thrown
 * SyntaxError inside the loop would abandon a child's build — so we degrade to
 * an empty object and let the path/command guards produce a message the agent
 * can actually act on.
 */
export function parseToolArguments(
  raw: string | undefined | null
): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return {}
  } catch {
    return {}
  }
}

export interface DoneArgs {
  verdict: Verdict
  summary: string
}

/** Read a `done` call, tolerating a model that invents a verdict. */
export function readDoneArgs(
  args: Record<string, unknown>,
  role: AgentRole | string
): DoneArgs {
  const raw =
    typeof args.verdict === "string" ? args.verdict.toUpperCase().trim() : ""
  const verdict = (VERDICTS as readonly string[]).includes(raw)
    ? (raw as Verdict)
    : defaultVerdict(role)
  const summary = typeof args.summary === "string" ? args.summary.trim() : ""
  return { verdict, summary }
}

function defaultVerdict(role: AgentRole | string): Verdict {
  if (role === "tester") return "FAIL"
  if (role === "reviewer") return "NEEDS_CHANGES"
  return "OK"
}

/**
 * One line for the narrator feed. Kept short: this renders in a panel a child
 * is watching, not in a log.
 */
export function describeToolCall(
  name: string,
  args: Record<string, unknown>
): string {
  const path = typeof args.path === "string" ? args.path : ""
  switch (name) {
    case TOOL.write:
      return `Writing ${path || "a file"}`
    case TOOL.read:
      return `Reading ${path || "a file"}`
    case TOOL.list:
      return `Looking in ${typeof args.dir === "string" && args.dir ? args.dir : "the project folder"}`
    case TOOL.run:
      return `Running ${typeof args.cmd === "string" ? args.cmd.slice(0, 120) : "a command"}`
    case TOOL.done:
      return `Finished: ${typeof args.verdict === "string" ? args.verdict : "done"}`
    default:
      return name
  }
}
