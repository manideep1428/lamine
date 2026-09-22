"use node"

/**
 * E2B sandbox helpers.
 *
 * Four rules encoded here, all from PLAN.md §9:
 *
 *  1. `lifecycle.onTimeout: 'pause'`. The E2B default is kill, which would
 *     destroy a child's project after five idle minutes. Pausing keeps the
 *     filesystem and costs nothing while paused.
 *  2. `lifecycle.autoResume: true`. The kid comes back tomorrow, the iframe hits
 *     the preview URL, the sandbox wakes with their game still in it.
 *  3. No outbound internet. The microVM already protects our infrastructure;
 *     this protects the child from agent-written code fetching anything.
 *  4. Never hold a sandbox open across a whole build. Store the id, reconnect
 *     each step — Convex actions cap out around ten minutes.
 */

import { CommandExitError, Sandbox } from "e2b"

import {
  assertCommandAllowed,
  PROJECT_ROOT,
  resolveReadPath,
  resolveWritePath,
} from "../../lib/core/paths"

/** Pre-baked template with node, a static server and vendored game libs. */
export const TEMPLATE = process.env.E2B_TEMPLATE ?? "base"

/** Short fuse: the sandbox pauses quickly when the kid stops doing anything. */
const IDLE_MS = 5 * 60_000

export const PREVIEW_PORT = 3000

/**
 * Outbound internet is off unless a deployment opts in. Agents are told not to
 * install packages; this is the part that is not a request.
 */
const ALLOW_INTERNET = process.env.E2B_ALLOW_INTERNET === "true"

export function sandboxConfigured(): boolean {
  return Boolean(process.env.E2B_API_KEY)
}

function assertConfigured(): void {
  if (!sandboxConfigured()) {
    throw new Error(
      "E2B_API_KEY is not set. Add it in the Convex dashboard under Settings → Environment Variables."
    )
  }
}

/**
 * Reconnect to the project's sandbox, or create one.
 * `Sandbox.connect` resumes a paused sandbox automatically.
 */
export async function getSandbox(sandboxId?: string | null): Promise<Sandbox> {
  assertConfigured()
  if (sandboxId) {
    try {
      const existing = await Sandbox.connect(sandboxId, { timeoutMs: IDLE_MS })
      await existing.files.makeDir(PROJECT_ROOT).catch(() => undefined)
      return existing
    } catch {
      // Killed, expired, or from a deleted deployment. Fall through and make a
      // fresh one rather than failing the build.
    }
  }
  const sandbox = await Sandbox.create(TEMPLATE, {
    timeoutMs: IDLE_MS,
    allowInternetAccess: ALLOW_INTERNET,
    lifecycle: {
      onTimeout: "pause",
      autoResume: true,
    },
  })
  await sandbox.files.makeDir(PROJECT_ROOT).catch(() => undefined)
  return sandbox
}

/** Keep the sandbox awake while a build is actively running. */
export async function keepAlive(sandbox: Sandbox): Promise<void> {
  try {
    await sandbox.setTimeout(IDLE_MS)
  } catch {
    /* non-fatal */
  }
}

/* ════════════════════════════════════════════════════════════════════════
   Running commands
   ════════════════════════════════════════════════════════════════════════ */

export interface CommandOutcome {
  exitCode: number
  output: string
}

/**
 * Run a command and return its result even when it fails.
 *
 * The SDK throws `CommandExitError` on a non-zero exit. For an agent — and for
 * the test phase — a failing command is *information*, not an exception, so it
 * is caught here rather than at every call site.
 */
export async function runCommand(
  sandbox: Sandbox,
  cmd: string,
  timeoutMs = 60_000
): Promise<CommandOutcome> {
  try {
    const result = await sandbox.commands.run(cmd, {
      timeoutMs,
      requestTimeoutMs: timeoutMs + 10_000,
    })
    return {
      exitCode: result.exitCode,
      output: joinOutput(result.stdout, result.stderr),
    }
  } catch (error) {
    if (error instanceof CommandExitError) {
      return {
        exitCode: error.exitCode,
        output: joinOutput(error.stdout, error.stderr),
      }
    }
    throw error
  }
}

function joinOutput(stdout: string, stderr: string): string {
  return [stdout, stderr].filter(Boolean).join("\n").trim()
}

/* ════════════════════════════════════════════════════════════════════════
   The agent tool surface
   ════════════════════════════════════════════════════════════════════════ */

export interface ToolOutcome {
  output: string
  /** Set when the call wrote a file, so the caller can mirror it into Convex. */
  wrote?: { path: string; content: string }
}

/**
 * Execute one tool call against the sandbox.
 *
 * Every path goes through `lib/core/paths`, which is the actual boundary. The
 * prompt also tells the agent the rules, but prompts are advice and this is code.
 */
export async function runTool(
  sandbox: Sandbox,
  name: string,
  args: Record<string, unknown>,
  allowedPaths: readonly string[]
): Promise<ToolOutcome> {
  switch (name) {
    case "write_file": {
      const rel = String(args.path ?? "")
      const content = String(args.content ?? "")
      const abs = resolveWritePath(rel, allowedPaths)
      await sandbox.files.write(abs, content)
      return {
        output: `Wrote ${rel} (${content.split("\n").length} lines).`,
        wrote: { path: rel, content },
      }
    }

    case "read_file": {
      const rel = String(args.path ?? "")
      const abs = resolveReadPath(rel)
      try {
        const text = await sandbox.files.read(abs)
        // Truncate so one huge file cannot eat the whole context window.
        const body = typeof text === "string" ? text : String(text)
        return {
          output:
            body.length > 20_000
              ? `${body.slice(0, 20_000)}\n…(truncated)`
              : body,
        }
      } catch {
        return { output: `${rel} does not exist yet.` }
      }
    }

    case "list_files": {
      const rel = String(args.dir ?? "")
      const abs = rel ? resolveReadPath(rel) : PROJECT_ROOT
      try {
        const entries = await sandbox.files.list(abs)
        if (!entries.length) return { output: "(empty)" }
        return {
          output: entries
            .map((e) => `${e.name}${e.type === "dir" ? "/" : ""}`)
            .sort()
            .join("\n"),
        }
      } catch {
        return { output: "(no such folder)" }
      }
    }

    case "run": {
      const cmd = String(args.cmd ?? "")
      assertCommandAllowed(cmd)
      const result = await runCommand(sandbox, `cd ${PROJECT_ROOT} && ${cmd}`)
      return {
        output: `exit ${result.exitCode}\n${result.output.slice(0, 12_000) || "(no output)"}`,
      }
    }

    default:
      return { output: `Unknown tool "${name}".` }
  }
}

/* ════════════════════════════════════════════════════════════════════════
   Preview
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Start a static server in the background and return its public URL.
 *
 * The URL is a different origin from the app, which is what gives us origin
 * isolation for free — no srcdoc sandbox juggling. `python3 -m http.server` is
 * used rather than `npx serve` because it needs no network: the sandbox has no
 * outbound internet.
 */
export async function startPreview(sandbox: Sandbox): Promise<string> {
  // Kill anything already bound so a rebuild does not stack servers.
  await runCommand(
    sandbox,
    `pkill -f "http.server ${PREVIEW_PORT}" || true`,
    10_000
  ).catch(() => undefined)

  await sandbox.commands.run(
    `cd ${PROJECT_ROOT} && nohup python3 -m http.server ${PREVIEW_PORT} > /tmp/preview.log 2>&1 &`,
    { background: true, timeoutMs: 15_000 }
  )

  return `https://${sandbox.getHost(PREVIEW_PORT)}`
}

/** Read every project file back out, for publish and export. */
export async function collectFiles(
  sandbox: Sandbox
): Promise<{ path: string; content: string }[]> {
  const listing = await runCommand(
    sandbox,
    `cd ${PROJECT_ROOT} && find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" | head -200`,
    30_000
  )

  const out: { path: string; content: string }[] = []
  for (const line of listing.output.split("\n")) {
    const rel = line.trim().replace(/^\.\//, "")
    if (!rel) continue
    try {
      const content = await sandbox.files.read(resolveReadPath(rel))
      out.push({
        path: rel,
        content: typeof content === "string" ? content : String(content),
      })
    } catch {
      /* skip unreadable entries */
    }
  }
  return out
}
