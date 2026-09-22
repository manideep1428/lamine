"use client"

import Link from "next/link"
import { Redo2, Share2, Undo2, Volume2, VolumeX } from "lucide-react"

import { GoButton } from "@/components/studio/GoButton"
import { cn } from "@/lib/utils"

interface TopBarProps {
  name: string
  onRename: (name: string) => void
  ready: boolean
  building: boolean
  reasons: string[]
  onGo: () => void
  onStop: () => void
  saving: boolean
  voiceOn: boolean
  voiceSupported: boolean
  onToggleVoice: () => void
  onShare: () => void
  onUndo: () => void
  onRedo: () => void
  /** Undo/redo only make sense while the bricks are editable. */
  canEdit: boolean
}

/**
 * The header. No tabs — the build rail along the bottom does view switching and
 * progress in one control, which leaves this bar for identity and the one action
 * that matters.
 */
export function TopBar({
  name,
  onRename,
  ready,
  building,
  reasons,
  onGo,
  onStop,
  saving,
  voiceOn,
  voiceSupported,
  onToggleVoice,
  onShare,
  onUndo,
  onRedo,
  canEdit,
}: TopBarProps) {
  return (
    <header className="z-20 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
      <Link
        href="/"
        className="brick bg-brick-red px-3 py-2"
        title="My projects"
      >
        <span className="font-display text-base leading-none font-bold tracking-tight">
          lamine
        </span>
      </Link>

      <label className="sr-only" htmlFor="project-name">
        Project name
      </label>
      {/* Uncontrolled, keyed by the name: when the load-time merge picks the
          server's copy, the input remounts with it instead of an effect copying a
          prop into state. */}
      <input
        key={name}
        id="project-name"
        defaultValue={name}
        onBlur={(event) => {
          const next = event.target.value.trim()
          if (next !== name) onRename(next || "My project")
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
        className="w-48 rounded-lg border-2 border-transparent bg-transparent px-2 py-1 font-display text-sm font-semibold text-ink outline-none hover:border-line focus:border-brick-blue focus:bg-surface"
        maxLength={80}
      />

      <span
        className={cn(
          "text-[11px] transition-opacity",
          saving ? "text-slate opacity-100" : "opacity-0"
        )}
        aria-live="polite"
      >
        saving…
      </span>

      <div className="flex-1" />

      {canEdit ? (
        <div className="flex items-center gap-1">
          <IconButton label="Undo" onClick={onUndo}>
            <Undo2 className="size-4" />
          </IconButton>
          <IconButton label="Redo" onClick={onRedo}>
            <Redo2 className="size-4" />
          </IconButton>
        </div>
      ) : null}

      {voiceSupported ? (
        <IconButton
          label={voiceOn ? "Turn voices off" : "Let the helpers talk out loud"}
          onClick={onToggleVoice}
          pressed={voiceOn}
        >
          {voiceOn ? (
            <Volume2 className="size-4" />
          ) : (
            <VolumeX className="size-4" />
          )}
        </IconButton>
      ) : null}

      <IconButton label="Share or download" onClick={onShare}>
        <Share2 className="size-4" />
      </IconButton>

      <GoButton
        ready={ready}
        building={building}
        reasons={reasons}
        onGo={onGo}
        onStop={onStop}
      />
    </header>
  )
}

function IconButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string
  onClick: () => void
  pressed?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-pressed={pressed}
      className={cn(
        "rounded-lg border-2 p-1.5 transition-colors",
        pressed
          ? "border-brick-blue bg-brick-blue text-white"
          : "border-line text-slate hover:bg-paper-sunken hover:text-ink"
      )}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  )
}
