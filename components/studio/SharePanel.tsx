"use client"

import { useAction, useMutation } from "convex/react"
import { Check, Download, ExternalLink, Loader2, X } from "lucide-react"
import { useState } from "react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"

interface SharePanelProps {
  projectId: Id<"projects">
  secret: string
  name: string
  published: {
    visibility: string
    publishedUrl: string | null
    fileCount: number
  } | null
  onClose: () => void
}

const SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? ""

/**
 * Sharing, in three honest tiers.
 *
 *  1. The link — carries the capability key in the URL fragment. Anyone who has
 *     it can open and edit the project. The copy says exactly that.
 *  2. Publish — needs a grown-up, and is off until one acts. The published site
 *     is genuinely public; nothing here calls it protected, because with no
 *     accounts it is not.
 *  3. Download — a zip that works offline, for ever, with nothing running.
 */
export function SharePanel({
  projectId,
  secret,
  name,
  published,
  onClose,
}: SharePanelProps) {
  const publish = useAction(api.publish.publish)
  const unpublish = useMutation(api.published.unpublish)

  const [grownUp, setGrownUp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const shareLink =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/studio/${projectId}#k=${secret}`

  const exportUrl = `${SITE_URL}/export?projectId=${projectId}&secret=${encodeURIComponent(secret)}`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setMessage("I couldn't copy it — select the link and copy it yourself.")
    }
  }

  const doPublish = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await publish({
        projectId,
        secret,
        grownUpConfirmed: grownUp,
      })
      setMessage(result.message)
    } catch {
      setMessage("That didn't work. Try again in a moment.")
    } finally {
      setBusy(false)
    }
  }

  const doUnpublish = async () => {
    setBusy(true)
    try {
      await unpublish({ projectId, secret })
      setMessage("Taken down. The link doesn't work any more.")
    } catch {
      setMessage("I couldn't take it down. Try again in a moment.")
    } finally {
      setBusy(false)
    }
  }

  const isPublished =
    published?.visibility === "published" && published.publishedUrl

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Share your project"
      onClick={onClose}
    >
      <div
        className="plate animate-snap-in w-full max-w-lg rounded-2xl p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">
              Share {name}
            </h2>
            <p className="text-xs text-ink-faint">
              Three ways, from private to public.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-faint hover:bg-plate-hover"
          >
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        {/* 1 — the link */}
        <section className="mb-4">
          <h3 className="text-sm font-semibold text-ink">Send a link</h3>
          <p className="mb-2 text-xs text-ink-soft">
            Opens your project on another computer. Anyone who has this link can
            open and change it, so only send it to people you trust.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={shareLink}
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg bg-plate px-3 py-1.5 font-mono text-[11px] text-ink-soft"
            />
            <button
              type="button"
              onClick={copyLink}
              className="rounded-lg bg-plate-hover px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-plate"
            >
              {copied ? "copied" : "copy"}
            </button>
          </div>
        </section>

        {/* 2 — publish */}
        <section className="mb-4 rounded-xl border border-plate-edge bg-plate/60 p-3">
          <h3 className="text-sm font-semibold text-ink">
            Put it on the internet{" "}
            <span className="font-normal text-ink-faint">
              — grown-up needed
            </span>
          </h3>

          {isPublished ? (
            <div className="mt-2 space-y-2">
              <a
                href={published.publishedUrl ?? "#"}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-1.5 text-sm text-brick-blue hover:underline"
              >
                <ExternalLink className="size-3.5" />
                {published.publishedUrl}
              </a>
              <p className="text-xs text-ink-soft">
                {published.fileCount} files are live. This page is public —
                anyone can see it.
              </p>
              <button
                type="button"
                onClick={doUnpublish}
                disabled={busy}
                className="rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
              >
                Take it down
              </button>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-ink-soft">
                This copies the finished files to a permanent web address. It
                keeps working after the workshop shuts down. Anyone with the
                address can see it, so don&apos;t put your full name, school,
                photo or address in your project.
              </p>
              <label className="flex items-start gap-2 text-xs text-ink-soft">
                <input
                  type="checkbox"
                  checked={grownUp}
                  onChange={(event) => setGrownUp(event.target.checked)}
                  className="mt-0.5"
                />
                I&apos;m a grown-up, I&apos;ve looked at this project, and
                I&apos;m happy for it to be public.
              </label>
              <button
                type="button"
                onClick={doPublish}
                disabled={busy || !grownUp}
                className="flex items-center gap-1.5 rounded-lg bg-brick-green/15 px-3 py-1.5 text-xs font-medium text-brick-green hover:bg-brick-green/25 disabled:opacity-40"
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Publish it
              </button>
            </div>
          )}
        </section>

        {/* 3 — download */}
        <section>
          <h3 className="text-sm font-semibold text-ink">Download it</h3>
          <p className="mb-2 text-xs text-ink-soft">
            A zip with every file. Unzip it, open index.html, and it runs on
            your own computer with no internet.
          </p>
          <a
            href={exportUrl}
            className="inline-flex items-center gap-1.5 rounded-lg bg-plate-hover px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-plate"
          >
            <Download className="size-3.5" />
            Download the zip
          </a>
        </section>

        {message ? (
          <p className="mt-4 rounded-lg bg-plate-hover px-3 py-2 text-xs text-ink-soft">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  )
}
