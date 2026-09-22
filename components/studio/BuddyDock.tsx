"use client"

import {
  Mic,
  MicOff,
  PanelRightClose,
  PanelRightOpen,
  Send,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import type { Doc } from "@/convex/_generated/dataModel"
import { BUDDY_LOOK, isBuddy, type BuddyId } from "@/lib/core/crew"
import { cn } from "@/lib/utils"
import { useListening } from "@/lib/voice"

/** Which events belong in the conversation, as opposed to the raw log. */
const STORY_KINDS = new Set(["narrator", "teaching", "agent_output"])

/** The brick each buddy wears. */
const BUDDY_BRICK: Record<BuddyId, string> = {
  codey: "bg-brick-blue",
  pixel: "bg-brick-purple",
  drbug: "bg-brick-red",
}

const MOOD_TINT: Record<string, string> = {
  excited: "border-brick-blue/40",
  encouraging: "border-brick-green/40",
  concerned: "border-brick-red/40",
  celebrating: "border-brick-amber/70",
}

interface FeedItem {
  id: string
  at: number
  who: string
  mood?: string
  text: string
}

interface BuddyDockProps {
  events: Doc<"events">[]
  messages: Doc<"messages">[]
  planning: boolean
  onSend: (text: string) => void
  sending: boolean
  say: (text: string, who?: string) => void
  voiceOn: boolean
  /** Collapsed to a rail when false. */
  open: boolean
  onToggle: () => void
  /** When the panel was collapsed, for counting what the child has not seen. */
  closedAt: number | null
  /** Sits above the crew when open. Carries "What you're building". */
  header?: React.ReactNode
}

/**
 * The three helpers, and what they are doing right now.
 *
 * The feed is fed by the `events` table during a build, so the buddies narrate
 * real tool calls rather than canned lines; `messages` carries the conversation a
 * child starts. Both are merged by time, because from a child's point of view
 * they are one conversation.
 *
 * Collapses to a rail rather than disappearing: the canvas gets the width back,
 * but the helpers stay visible and a dot shows when they have said something the
 * child has not seen.
 */
export function BuddyDock({
  events,
  messages,
  planning,
  onSend,
  sending,
  say,
  voiceOn,
  open,
  onToggle,
  closedAt,
  header,
}: BuddyDockProps) {
  const [showRaw, setShowRaw] = useState(false)
  const [draft, setDraft] = useState("")
  const scroller = useRef<HTMLDivElement>(null)
  const spoken = useRef(new Set<string>())

  const listening = useListening((heard) =>
    setDraft((was) => `${was} ${heard}`.trim())
  )

  const story = useMemo<FeedItem[]>(() => {
    const fromEvents = events
      .filter((e) => STORY_KINDS.has(e.kind))
      .map((e) => ({
        id: e._id,
        at: e._creationTime,
        who: e.who ?? "codey",
        mood: e.mood,
        text: e.text,
      }))
    const fromChat = messages.map((m) => ({
      id: m._id,
      at: m._creationTime,
      who: m.who,
      mood: m.mood,
      text: m.text,
    }))
    return [...fromEvents, ...fromChat].sort((a, b) => a.at - b.at)
  }, [events, messages])

  const raw = useMemo(
    () => events.filter((e) => !STORY_KINDS.has(e.kind)),
    [events]
  )

  /** Who said something most recently — their chip lights up. */
  const talking = story.at(-1)?.who

  useEffect(() => {
    const node = scroller.current
    if (node) node.scrollTop = node.scrollHeight
  }, [story.length, raw.length, showRaw])

  useEffect(() => {
    if (!voiceOn) return
    const latest = story.at(-1)
    if (!latest || latest.who === "kid" || spoken.current.has(latest.id)) return
    spoken.current.add(latest.id)
    say(latest.text, latest.who)
  }, [story, say, voiceOn])

  const submit = () => {
    const text = draft.trim()
    if (!text || sending) return
    setDraft("")
    onSend(text)
  }

  // Anything the helpers said after the panel was collapsed. Derived from a
  // timestamp the parent sets when closing, so nothing is read or written during
  // render and no effect has to copy state around.
  const unseen = closedAt
    ? story.filter((item) => item.at > closedAt).length
    : 0

  if (!open) {
    return (
      <aside
        className="flex w-14 shrink-0 flex-col items-center gap-3 border-l border-line bg-surface py-3"
        aria-label="Your helpers, collapsed"
      >
        <button
          type="button"
          onClick={onToggle}
          title="Open your helpers"
          className="relative rounded-lg border border-line p-1.5 text-slate hover:bg-paper-sunken hover:text-ink"
        >
          <PanelRightOpen className="size-4" />
          <span className="sr-only">Open your helpers</span>
          {unseen > 0 ? (
            <span
              className="absolute -top-1 -right-1 size-2.5 rounded-full bg-brick-red"
              aria-label={`${unseen} new messages`}
            />
          ) : null}
        </button>

        {/* The crew stays visible, so a child never wonders where they went. */}
        {(Object.keys(BUDDY_LOOK) as BuddyId[]).map((id) => (
          <span
            key={id}
            title={BUDDY_LOOK[id].name}
            className={cn(
              "grid size-8 place-items-center rounded-lg text-sm",
              BUDDY_BRICK[id],
              talking === id ? "opacity-100" : "opacity-45"
            )}
          >
            <span aria-hidden>{BUDDY_LOOK[id].emoji}</span>
            <span className="sr-only">{BUDDY_LOOK[id].name}</span>
          </span>
        ))}
      </aside>
    )
  }

  return (
    <aside
      className="flex w-80 shrink-0 flex-col border-l border-line bg-surface"
      aria-label="Your helpers"
    >
      {header}

      {/* The crew, as three bricks. */}
      <div className="flex items-center gap-1.5 border-b-2 border-line p-2">
        <button
          type="button"
          onClick={onToggle}
          title="Hide your helpers"
          className="rounded-lg border border-line p-1.5 text-slate hover:bg-paper-sunken hover:text-ink"
        >
          <PanelRightClose className="size-4" />
          <span className="sr-only">Hide your helpers</span>
        </button>
        {(Object.keys(BUDDY_LOOK) as BuddyId[]).map((id) => (
          <span
            key={id}
            className={cn(
              "brick flex flex-1 items-center justify-center gap-1 px-2 py-2 text-[11px] transition-opacity",
              BUDDY_BRICK[id],
              talking === id ? "opacity-100" : "opacity-55"
            )}
            title={BUDDY_LOOK[id].name}
          >
            <span aria-hidden>{BUDDY_LOOK[id].emoji}</span>
            <span className="truncate">{BUDDY_LOOK[id].name}</span>
          </span>
        ))}
      </div>

      <div
        ref={scroller}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3"
        aria-live="polite"
      >
        {showRaw ? (
          raw.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-slate">
              Every tool call and test result lands here while a build runs.
            </p>
          ) : (
            <ul className="space-y-1 font-mono text-[11px] leading-relaxed text-slate">
              {raw.map((event) => (
                <li key={event._id} className="flex gap-2">
                  <span className="shrink-0 text-slate">
                    {event.kind === "error"
                      ? "!"
                      : event.kind === "test_result"
                        ? "·"
                        : ">"}
                  </span>
                  <span
                    className={cn(
                      "break-all",
                      event.kind === "error" && "text-brick-red"
                    )}
                  >
                    {event.text}
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : story.length === 0 ? (
          <p className="py-6 text-center text-[13px] leading-snug text-slate">
            {planning
              ? "Codey is reading your bricks…"
              : "Snap some bricks together, then press GO! Your helpers will talk to you here."}
          </p>
        ) : (
          story.map((item) => <Bubble key={item.id} item={item} />)
        )}
      </div>

      <div className="border-t-2 border-line p-2">
        <form
          className="flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <label className="sr-only" htmlFor="buddy-input">
            Ask your helpers something
          </label>
          <input
            id="buddy-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask your helpers…"
            maxLength={600}
            className="min-w-0 flex-1 rounded-lg border-2 border-line bg-paper px-2.5 py-1.5 text-[13px] outline-none focus:border-brick-blue"
          />
          {listening.supported ? (
            <button
              type="button"
              onClick={() =>
                listening.listening ? listening.stop() : listening.start()
              }
              aria-pressed={listening.listening}
              title={listening.listening ? "Stop listening" : "Say it out loud"}
              className={cn(
                "rounded-lg p-2",
                listening.listening
                  ? "bg-brick-red text-white"
                  : "text-slate hover:bg-paper-sunken hover:text-slate"
              )}
            >
              {listening.listening ? (
                <Mic className="size-4" />
              ) : (
                <MicOff className="size-4" />
              )}
              <span className="sr-only">
                {listening.listening ? "Listening" : "Use the microphone"}
              </span>
            </button>
          ) : null}
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className="brick bg-brick-blue px-2.5 py-2 disabled:opacity-50"
          >
            <Send className="size-4" />
            <span className="sr-only">Send</span>
          </button>
        </form>

        <button
          type="button"
          onClick={() => setShowRaw((was) => !was)}
          className="mt-1.5 w-full text-center text-[11px] text-slate hover:text-slate"
        >
          {showRaw ? "back to the story" : "show me the raw tool calls"}
        </button>
      </div>
    </aside>
  )
}

function Bubble({ item }: { item: FeedItem }) {
  if (item.who === "kid") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-xl rounded-br-sm border-2 border-line bg-paper px-3 py-1.5 text-[13px] text-ink">
          {item.text}
        </p>
      </div>
    )
  }

  const who: BuddyId = isBuddy(item.who) ? item.who : "codey"
  const look = BUDDY_LOOK[who]

  return (
    <div className="snap-in flex items-start gap-2">
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-lg text-sm",
          BUDDY_BRICK[who]
        )}
        aria-hidden
      >
        {look.emoji}
      </span>
      <div
        className={cn(
          "min-w-0 flex-1 rounded-xl rounded-tl-sm border-2 bg-surface px-3 py-1.5",
          MOOD_TINT[item.mood ?? "encouraging"] ?? "border-line"
        )}
      >
        <p className="text-[11px] font-semibold text-slate">{look.name}</p>
        <p className="text-[13px] leading-snug break-words whitespace-pre-wrap text-ink">
          {item.text}
        </p>
      </div>
    </div>
  )
}
