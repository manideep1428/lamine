/**
 * Reading model output, and keeping saved history small enough to store.
 *
 * A Convex action caps out around ten minutes, so a long task runs across
 * several actions and its conversation is parked in the `tasks.history` field
 * between them. Convex documents cap at 1MB, and file contents flow through
 * this conversation — so trimming is not an optimisation, it is what keeps a
 * long build from failing on a document-too-large error.
 *
 * Pure module: the shapes are matched structurally, so nothing here imports the
 * OpenAI SDK and everything is testable in plain Node.
 */

export const HISTORY_LIMITS = {
  /** Well under Convex's 1MB document cap, leaving room for the rest of the row. */
  maxBytes: 240_000,
  /** How many recent items to keep when trimming. */
  keepTail: 40,
  /** Any single string longer than this is truncated with a marker. */
  maxStringChars: 12_000,
} as const

export interface FunctionCall {
  name: string
  callId: string
  arguments: string
}

/** Pull the function calls out of a Responses API `output` array. */
export function functionCalls(
  output: readonly unknown[] | undefined
): FunctionCall[] {
  const calls: FunctionCall[] = []
  for (const item of output ?? []) {
    if (!isRecord(item) || item.type !== "function_call") continue
    const name = typeof item.name === "string" ? item.name : ""
    const callId = typeof item.call_id === "string" ? item.call_id : ""
    if (!name || !callId) continue
    calls.push({
      name,
      callId,
      arguments: typeof item.arguments === "string" ? item.arguments : "",
    })
  }
  return calls
}

/**
 * Any prose the model emitted alongside its tool calls.
 *
 * This is what the narrator feed shows when an agent explains itself, so it is
 * worth surfacing rather than discarding.
 */
export function collectOutputText(
  output: readonly unknown[] | undefined
): string {
  const parts: string[] = []
  for (const item of output ?? []) {
    if (!isRecord(item) || item.type !== "message") continue
    const content = Array.isArray(item.content) ? item.content : []
    for (const chunk of content) {
      if (
        isRecord(chunk) &&
        chunk.type === "output_text" &&
        typeof chunk.text === "string"
      ) {
        parts.push(chunk.text)
      }
    }
  }
  return parts.join("\n").trim()
}

/**
 * Items that must not be echoed back on the next turn.
 *
 * Reasoning items are the important case: resending one without the item that
 * followed it is rejected by the API, and their content is not returned to us
 * anyway, so they are dropped rather than carried.
 */
const DROP_TYPES = new Set(["reasoning"])

export function keepableOutput(
  output: readonly unknown[] | undefined
): unknown[] {
  return (output ?? []).filter(
    (item) => !(isRecord(item) && DROP_TYPES.has(String(item.type)))
  )
}

/** The item shape for a tool result going back to the model. */
export function functionCallOutput(
  callId: string,
  output: string
): Record<string, unknown> {
  return {
    type: "function_call_output",
    call_id: callId,
    output: output.slice(0, HISTORY_LIMITS.maxStringChars),
  }
}

/* ════════════════════════════════════════════════════════════════════════
   Trimming
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Shrink a conversation so it fits in a Convex document.
 *
 * Strategy, in order:
 *  1. truncate over-long strings (file contents the agent wrote are the culprit),
 *  2. keep the first item — it is the task briefing, and losing it makes the
 *     agent forget the job — plus the most recent `keepTail` items,
 *  3. keep dropping from the middle until it fits.
 *
 * A dropped stretch is replaced with a marker so the model can tell that
 * something was elided rather than silently inventing continuity.
 */
export function trimHistory(items: readonly unknown[]): unknown[] {
  let working = items.map((item) => truncateStrings(item))

  if (byteSize(working) <= HISTORY_LIMITS.maxBytes) return working

  if (working.length > HISTORY_LIMITS.keepTail + 1) {
    const head = working[0]
    const tail = working.slice(-HISTORY_LIMITS.keepTail)
    working = [
      head,
      elision(working.length - HISTORY_LIMITS.keepTail - 1),
      ...tail,
    ]
  }

  // Still too big: drop from just after the briefing, oldest first.
  while (working.length > 3 && byteSize(working) > HISTORY_LIMITS.maxBytes) {
    working.splice(2, 1)
  }

  return working
}

function elision(count: number): Record<string, unknown> {
  return {
    role: "user",
    content: `[${count} earlier step(s) trimmed to save space. Keep going from what you can see.]`,
  }
}

export function byteSize(value: unknown): number {
  const json = JSON.stringify(value) ?? ""
  if (typeof TextEncoder !== "undefined")
    return new TextEncoder().encode(json).length
  return json.length
}

/**
 * Deep-copy with every long string truncated.
 *
 * Tool arguments are the reason this exists: a `write_file` call carries a whole
 * file, and the model does not need to re-read what it already wrote.
 */
function truncateStrings(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > HISTORY_LIMITS.maxStringChars
      ? `${value.slice(0, HISTORY_LIMITS.maxStringChars)}\n…(trimmed)`
      : value
  }
  if (Array.isArray(value)) return value.map(truncateStrings)
  if (isRecord(value)) {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value))
      out[key] = truncateStrings(item)
    return out
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
