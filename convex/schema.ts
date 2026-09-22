import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

/**
 * There are no accounts. `ownerId` is a random UUID from the browser's
 * localStorage, so it is a claim rather than an identity. The real gate is
 * `secret`: every private read and every write must present it. Possession of
 * the link is the permission. See lib/storage.ts and ARCHITECTURE.md §3.
 */
export default defineSchema({
  projects: defineTable({
    name: v.string(),
    kind: v.union(v.literal("game"), v.literal("website")),
    ownerId: v.string(),
    /** Capability key. Never rendered in the UI. */
    secret: v.string(),
    /** Blockly serialization — the source of truth for what the kid built. */
    workspace: v.string(),
    /** Last interpreted NuggetSpec, re-validated server-side on write. */
    spec: v.optional(v.any()),
    visibility: v.union(
      v.literal("private"),
      v.literal("link"),
      v.literal("published")
    ),
    /** E2B sandbox to reconnect to. Paused sandboxes resume on demand. */
    sandboxId: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
    publishedUrl: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_updated", ["ownerId", "updatedAt"]),

  sessions: defineTable({
    projectId: v.id("projects"),
    /** idle | planning | executing | testing | previewing | done | failed | stopped */
    state: v.string(),
    spec: v.any(),
    explanation: v.optional(v.string()),
    framework: v.optional(v.string()),
    error: v.optional(v.string()),
    /** Test phase bookkeeping. Optional so old sessions stay readable. */
    testsPassed: v.optional(v.number()),
    testsTotal: v.optional(v.number()),
    /** Bounded auto-repair: how many times we asked a builder to fix failures. */
    fixAttempts: v.optional(v.number()),
    reviewVerdict: v.optional(v.string()),
    /** Rough spend guard. Incremented as turns complete. */
    turnsUsed: v.number(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
  }).index("by_project", ["projectId"]),

  tasks: defineTable({
    sessionId: v.id("sessions"),
    taskId: v.string(),
    name: v.string(),
    description: v.string(),
    agentName: v.string(),
    role: v.string(),
    /** The persona the planner invented for this agent, shown to the child. */
    persona: v.optional(v.string()),
    dependsOn: v.array(v.string()),
    allowedPaths: v.array(v.string()),
    acceptanceCriteria: v.array(v.string()),
    /** pending | running | done | failed */
    status: v.string(),
    verdict: v.optional(v.string()),
    summary: v.optional(v.string()),
    /** Saved conversation so a fresh action can resume mid-task. */
    history: v.optional(v.any()),
    turns: v.number(),
    order: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_order", ["sessionId", "order"]),

  /**
   * The narrator feed, agent tool calls, test results and teaching moments all
   * land here. This single table is the whole realtime layer: we insert a row,
   * and every subscribed client updates. No sockets, no connection manager.
   */
  events: defineTable({
    sessionId: v.id("sessions"),
    /** narrator | tool_call | task_started | task_done | test_result | teaching | error */
    kind: v.string(),
    who: v.optional(v.string()),
    mood: v.optional(v.string()),
    text: v.string(),
    taskId: v.optional(v.string()),
  }).index("by_session", ["sessionId"]),

  /** Mirror of what agents wrote, so the code drawer works without the sandbox. */
  files: defineTable({
    sessionId: v.id("sessions"),
    path: v.string(),
    content: v.string(),
    byTask: v.string(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_path", ["sessionId", "path"]),

  /** Buddy chat, separate from build events so it survives across sessions. */
  messages: defineTable({
    projectId: v.id("projects"),
    who: v.string(),
    text: v.string(),
    mood: v.optional(v.string()),
  }).index("by_project", ["projectId"]),

  /**
   * A published snapshot. E2B is metered compute and ephemeral, so a finished
   * project is copied into Convex file storage and served from `.convex.site` —
   * a different origin from the app, permanent, and free to keep.
   */
  published: defineTable({
    projectId: v.id("projects"),
    path: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
    size: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_path", ["projectId", "path"]),
})
