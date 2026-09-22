"use client"

import { ExternalLink, Loader2, RefreshCw } from "lucide-react"
import { useEffect, useRef, useState } from "react"

interface PreviewProps {
  url: string | null
  building: boolean
  /** Wakes a paused sandbox and returns a fresh URL. */
  onWake: () => void
  waking: boolean
  /** A runtime error from inside the project, for Dr. Bug to explain. */
  onRuntimeError: (message: string) => void
}

/**
 * The kid's project, running.
 *
 * The iframe points at the sandbox's exposed port, which is a different origin —
 * so the project is isolated from the studio for free, and the only thing that
 * can cross is a `postMessage` the project sends on purpose (the error bridge
 * the builder is told to include).
 */
export function Preview({
  url,
  building,
  onWake,
  waking,
  onRuntimeError,
}: PreviewProps) {
  const [nonce, setNonce] = useState(0)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const reported = useRef(new Set<string>())

  // The iframe's identity. Deriving "have we loaded?" from it means a reload or a
  // new preview URL is pending again without an effect resetting anything.
  const frameKey = `${url ?? ""}#${nonce}`
  const loaded = loadedKey === frameKey

  /* ── the error bridge ── */
  useEffect(() => {
    if (!url) return
    let origin: string
    try {
      origin = new URL(url).origin
    } catch {
      return
    }

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin) return
      const data = event.data as { type?: string; message?: string } | null
      if (!data || data.type !== "lamine:error") return
      const message = String(data.message ?? "").slice(0, 500)
      // The same error can fire every animation frame; ask once.
      if (!message || reported.current.has(message)) return
      reported.current.add(message)
      onRuntimeError(message)
    }

    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [url, onRuntimeError])

  if (!url) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-ink-soft">
          {building
            ? "Your helpers are building it. This is where you'll play it."
            : "Nothing to show yet. Press GO and I'll build it."}
        </p>
        {building ? (
          <Loader2 className="size-5 animate-spin text-brick-blue" />
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b-2 border-plate-edge px-3 py-1.5">
        <span className="truncate font-mono text-[11px] text-ink-faint">
          {url}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          title="Reload"
          className="rounded-lg border-2 border-plate-edge p-1.5 text-ink-soft hover:bg-plate-hover hover:text-ink"
        >
          <RefreshCw className="size-3.5" />
          <span className="sr-only">Reload</span>
        </button>
        <button
          type="button"
          onClick={onWake}
          disabled={waking}
          title="Wake it up if it went to sleep"
          className="rounded-lg border-2 border-plate-edge px-2 py-1 text-xs text-ink-soft hover:bg-plate-hover hover:text-ink disabled:opacity-50"
        >
          {waking ? "waking…" : "wake"}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          title="Open in a new tab"
          className="rounded-lg border-2 border-plate-edge p-1.5 text-ink-soft hover:bg-plate-hover hover:text-ink"
        >
          <ExternalLink className="size-3.5" />
          <span className="sr-only">Open in a new tab</span>
        </a>
      </div>

      <div className="relative flex-1 bg-white">
        {!loaded ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-ink-faint">
            <Loader2 className="size-4 animate-spin" />
            Waking your project up…
          </div>
        ) : null}
        <iframe
          key={frameKey}
          src={url}
          title="Your project"
          onLoad={() => {
            // A fresh page can hit the same bug again, and Dr. Bug should hear
            // about it once per load rather than once per session.
            reported.current.clear()
            setLoadedKey(frameKey)
          }}
          className="h-full w-full border-0"
          // The project is the child's own code on another origin. Scripts and
          // same-origin storage are what make a game work; everything else stays off.
          sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms"
          allow="autoplay; fullscreen"
        />
      </div>
    </div>
  )
}
