/**
 * Path guard for agent file operations.
 *
 * elisa enforces `allowed_paths` partly in the prompt. Prompts are advice; this
 * module is the boundary. Every agent tool call goes through `resolveWritePath`
 * or `resolveReadPath` before it touches the sandbox filesystem.
 *
 * Pure module — no filesystem, no sandbox. Just string decisions.
 */

/** Everything the agents build lives here inside the E2B sandbox. */
export const PROJECT_ROOT = "/home/user/project"

/** Paths agents may never touch, even if a plan lists them. */
const DENY_SEGMENTS = new Set([
  ".git",
  "node_modules",
  ".env",
  ".ssh",
  ".aws",
  ".config",
  ".npmrc",
])

export class PathViolation extends Error {
  constructor(
    readonly requested: string,
    reason: string
  ) {
    super(`Refused path "${requested}": ${reason}`)
    this.name = "PathViolation"
  }
}

/**
 * Normalise a project-relative path, or throw.
 *
 * Rejects absolute paths, drive letters, parent traversal, null bytes, and
 * anything that resolves outside the project. Backslashes are treated as
 * separators so a Windows-flavoured path from the model can't slip through.
 */
export function normalizeRelPath(input: string): string {
  if (typeof input !== "string" || input.trim() === "") {
    throw new PathViolation(String(input), "empty path")
  }
  if (input.includes("\0")) {
    throw new PathViolation(input, "null byte")
  }

  const unified = input.replace(/\\/g, "/").trim()

  if (unified.startsWith("/")) {
    throw new PathViolation(input, "absolute paths are not allowed")
  }
  if (/^[a-zA-Z]:/.test(unified)) {
    throw new PathViolation(input, "drive letters are not allowed")
  }
  if (unified.startsWith("~")) {
    throw new PathViolation(input, "home-relative paths are not allowed")
  }

  const segments: string[] = []
  for (const raw of unified.split("/")) {
    if (raw === "" || raw === ".") continue
    if (raw === "..") {
      // Reject rather than pop: "src/../../etc" must not silently become "etc".
      throw new PathViolation(input, "parent traversal is not allowed")
    }
    if (DENY_SEGMENTS.has(raw)) {
      throw new PathViolation(input, `"${raw}" is off limits`)
    }
    segments.push(raw)
  }

  if (segments.length === 0) {
    throw new PathViolation(input, "path resolves to the project root")
  }
  return segments.join("/")
}

/**
 * Does `relPath` fall inside one of the allowed patterns?
 *
 * Supported pattern forms, matching what the planner is told to emit:
 *   "index.html"     exact file
 *   "src/"           directory and everything under it
 *   "src/**"         same as above
 *   "scenes/*.js"    single-segment wildcard with an extension
 */
export function matchesAllowed(
  relPath: string,
  patterns: readonly string[]
): boolean {
  for (const raw of patterns) {
    let pattern: string
    try {
      // Reuse the normaliser so patterns get the same safety treatment.
      pattern = normalizeRelPath(
        raw.replace(/\*+$/, "").replace(/\/$/, "") || "."
      )
    } catch {
      continue // a malformed pattern grants nothing
    }

    const isDirPattern =
      /\/$|\/\*\*$|^\*\*$/.test(raw.trim()) || !raw.includes(".")

    if (raw.includes("*") && raw.includes(".")) {
      // e.g. "scenes/*.js"
      const dir = raw.slice(0, raw.lastIndexOf("/")).replace(/\/$/, "")
      const ext = raw.slice(raw.lastIndexOf("."))
      const inDir =
        dir === "" ? !relPath.includes("/") : relPath.startsWith(`${dir}/`)
      const depthOk =
        dir === "" || relPath.slice(dir.length + 1).split("/").length === 1
      if (inDir && depthOk && relPath.endsWith(ext)) return true
      continue
    }

    if (relPath === pattern) return true
    if (isDirPattern && relPath.startsWith(`${pattern}/`)) return true
  }
  return false
}

/**
 * Resolve a path the agent wants to WRITE. Must normalise cleanly *and* sit
 * inside the task's allowlist.
 */
export function resolveWritePath(
  input: string,
  allowed: readonly string[]
): string {
  const rel = normalizeRelPath(input)
  if (!matchesAllowed(rel, allowed)) {
    throw new PathViolation(
      input,
      `outside this task's files (allowed: ${allowed.join(", ") || "none"})`
    )
  }
  return `${PROJECT_ROOT}/${rel}`
}

/**
 * Resolve a path the agent wants to READ. Reads are allowed anywhere inside the
 * project — agents need to see what teammates built — but still never outside it.
 */
export function resolveReadPath(input: string): string {
  return `${PROJECT_ROOT}/${normalizeRelPath(input)}`
}

/** Commands the agent is never allowed to run inside the sandbox. */
const BLOCKED_COMMAND = [
  /\bcurl\b/,
  /\bwget\b/,
  /\bssh\b/,
  /\bscp\b/,
  /\bgit\s+(push|remote|clone)\b/,
  /\bnpm\s+(publish|login)\b/,
  // Anchored rather than \b-bounded: `\benv\b` also matches `cat notes.env` and
  // `node build.env.js`, refusing a legitimate call and wasting one of the
  // agent's turns. The point is to stop `env`/`printenv` as commands.
  /(^|[;&|]\s*|\s)(printenv|env)(\s|$)/,
  /\$\{?(OPENAI|E2B|CONVEX)/i,
  /\brm\s+-rf\s+\/(?!home\/user\/project)/,
  /\bsudo\b/,
  /\bchmod\s+777\b/,
  />\s*\/etc\//,
]

/**
 * Guard shell commands. The sandbox is disposable, so this is not about
 * protecting infrastructure — it's about keeping agents from exfiltrating keys
 * or wandering off task.
 */
export function assertCommandAllowed(cmd: string): void {
  if (typeof cmd !== "string" || !cmd.trim()) {
    throw new PathViolation(String(cmd), "empty command")
  }
  for (const re of BLOCKED_COMMAND) {
    if (re.test(cmd)) {
      throw new PathViolation(cmd, "that command is not allowed in the sandbox")
    }
  }
}
