"use node"

/**
 * Publish — copy the project out of the sandbox and host it properly.
 *
 * Two rules from ARCHITECTURE.md §10 are enforced here, not in the UI:
 *
 *  1. A project is private until someone deliberately publishes it. The gate is
 *     a grown-up confirmation, and it is honest about what it is: a speed bump,
 *     not a wall. Until real auth exists, nothing here should be described to a
 *     child as "protected".
 *  2. Nothing is ever served from the sandbox. Files are copied into Convex
 *     storage and served from `.convex.site`, which is both permanent and a
 *     different origin from the app.
 */

import { v } from "convex/values"

import { contentTypeFor, selectPublishFiles } from "../lib/core/publishing"
import { internal } from "./_generated/api"
import { action } from "./_generated/server"
import { describeError } from "./lib/phaseUtils"
import { collectFiles, getSandbox } from "./lib/sandbox"

export interface PublishResult {
  ok: boolean
  url: string | null
  /** Kid-facing. Rendered as-is. */
  message: string
  skipped: string[]
}

export const publish = action({
  args: {
    projectId: v.id("projects"),
    secret: v.string(),
    /** The grown-up gate. False is a refusal, not a default. */
    grownUpConfirmed: v.boolean(),
  },
  handler: async (ctx, args): Promise<PublishResult> => {
    const allowed = await ctx.runQuery(internal.projects.checkSecret, {
      projectId: args.projectId,
      secret: args.secret,
    })
    if (!allowed) throw new Error("You don't have the key for that project.")

    if (!args.grownUpConfirmed) {
      return {
        ok: false,
        url: null,
        message: "Ask a grown-up to help you share this.",
        skipped: [],
      }
    }

    const project = await ctx.runQuery(internal.projects.loadInternal, {
      projectId: args.projectId,
    })
    if (!project) throw new Error("That project doesn't exist.")

    if (!project.sandboxId) {
      return {
        ok: false,
        url: null,
        message: "There's nothing to share yet — press GO to build it first.",
        skipped: [],
      }
    }

    /* ── read it out of the sandbox ── */
    let collected: { path: string; content: string }[]
    try {
      const sandbox = await getSandbox(project.sandboxId)
      collected = await collectFiles(sandbox)
    } catch (error) {
      return {
        ok: false,
        url: null,
        message:
          "I couldn't reach your project's workshop. Press GO to build it again.",
        skipped: [describeError(error).slice(0, 200)],
      }
    }

    const selection = selectPublishFiles(collected)
    if (selection.problem) {
      return {
        ok: false,
        url: null,
        message: selection.problem,
        skipped: selection.skipped,
      }
    }

    /* ── store each file ── */
    const stored: {
      path: string
      storageId: Awaited<ReturnType<typeof ctx.storage.store>>
      contentType: string
      size: number
    }[] = []

    for (const file of selection.files) {
      const contentType = contentTypeFor(file.path)
      const blob = new Blob([file.content], { type: contentType })
      const storageId = await ctx.storage.store(blob)
      stored.push({ path: file.path, storageId, contentType, size: blob.size })
    }

    await ctx.runMutation(internal.published.replaceAll, {
      projectId: args.projectId,
      files: stored,
    })

    const site = process.env.CONVEX_SITE_URL ?? ""
    const url = `${site}/p/${args.projectId}/`

    await ctx.runMutation(internal.projects.setPublished, {
      projectId: args.projectId,
      publishedUrl: url,
      visibility: "published",
    })

    return {
      ok: true,
      url,
      message: `Shared! ${stored.length} file${stored.length === 1 ? "" : "s"} are live at that link.`,
      skipped: selection.skipped,
    }
  },
})
