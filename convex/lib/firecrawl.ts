"use node"

/**
 * Firecrawl, used at build time only.
 *
 * A child's "Look up…" brick is resolved while the project is being built, and
 * what comes back is written into the project as ordinary content. The finished
 * thing therefore needs no network, carries no API key, and costs nothing to run —
 * which matters because a published project is public static files that anyone can
 * read the source of.
 *
 * Runtime lookups from a child's own code would need a public endpoint of ours,
 * per-project rate limiting and its own abuse story. That is a separate feature.
 */

const ENDPOINT = "https://api.firecrawl.dev/v1/search"

/** How much of the web we are willing to put in front of a child, per lookup. */
const LIMITS = {
  results: 3,
  charsPerResult: 1200,
  totalChars: 4000,
  timeoutMs: 20_000,
} as const

export function firecrawlConfigured(): boolean {
  return Boolean(process.env.FIRECRAWL_API_KEY)
}

export interface LookupResult {
  /** Plain text the agent can read and rewrite. Never raw HTML. */
  text: string
  /** Where it came from, so the generated project can credit it. */
  sources: string[]
}

/**
 * Search the web and return readable text.
 *
 * Deliberately defensive about the response shape: this runs inside a build that a
 * child is watching, so an unexpected payload has to degrade to "I could not find
 * anything" rather than throw and fail their project.
 */
export async function lookUp(query: string): Promise<LookupResult> {
  if (!firecrawlConfigured()) {
    return { text: "", sources: [] }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LIMITS.timeoutMs)

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: query.slice(0, 200),
        limit: LIMITS.results,
        scrapeOptions: { formats: ["markdown"] },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      return { text: "", sources: [] }
    }

    const payload: unknown = await response.json()
    return readResults(payload)
  } catch {
    // A timeout, a network refusal or malformed JSON. The build continues without
    // the lookup; the agent is told plainly that nothing came back.
    return { text: "", sources: [] }
  } finally {
    clearTimeout(timer)
  }
}

/** Pull text and URLs out of whatever shape the API returned. */
function readResults(payload: unknown): LookupResult {
  const rows = extractRows(payload)
  const parts: string[] = []
  const sources: string[] = []
  let total = 0

  for (const row of rows.slice(0, LIMITS.results)) {
    if (!isRecord(row)) continue

    const url = typeof row.url === "string" ? row.url : ""
    const body =
      firstString(row.markdown) ??
      firstString(row.description) ??
      firstString(row.content) ??
      firstString(row.title)

    if (!body) continue

    const clean = body
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, LIMITS.charsPerResult)
    if (total + clean.length > LIMITS.totalChars) break

    total += clean.length
    parts.push(clean)
    if (url) sources.push(url)
  }

  return { text: parts.join("\n\n"), sources }
}

function extractRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!isRecord(payload)) return []
  for (const key of ["data", "results", "web"]) {
    const value = payload[key]
    if (Array.isArray(value)) return value
  }
  return []
}

function firstString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
