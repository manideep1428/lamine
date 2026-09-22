"use client"

import { useMutation, useQuery } from "convex/react"
import { Loader2, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useMemo, useState } from "react"

import { isConvexConfigured } from "@/components/convex-client-provider"
import { Studio } from "@/components/studio/Studio"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { bump, useLocalProjects, useOwnerId } from "@/hooks/use-local"
import { BLANK_WORKSPACE, EXAMPLES, type ExampleNugget } from "@/lib/examples"
import { getOwnerId } from "@/lib/identity"
import { forgetLocalProject, newSecret, saveLocalProject } from "@/lib/storage"
import { cn } from "@/lib/utils"

/**
 * One entry point for the whole app.
 *
 * Convex static hosting serves files by exact key and falls back to
 * `/index.html` for anything it does not have — it does no directory-index
 * resolution, so a real `/studio/` route was served the home page. Routing on a
 * query parameter from the single prerendered page sidesteps that entirely.
 */
export default function Page() {
  return (
    <Suspense fallback={<Splash />}>
      <Router />
    </Suspense>
  )
}

function Router() {
  const projectId = useSearchParams().get("id")
  return projectId ? <Studio projectId={projectId} /> : <Landing />
}

/* ════════════════════════════════════════════════════════════════════════
   The hero
   ════════════════════════════════════════════════════════════════════════ */

type Kind = "game" | "website" | "device"

interface HeroBrick {
  text: string
  detail?: string
  tone: string
  nested?: boolean
}

/**
 * The pitch, as bricks — one stack per kind of thing you can make.
 *
 * Reading a stack top to bottom explains the product better than a paragraph
 * about it, and switching between them shows the part that is easy to miss: the
 * same nine bricks describe a game, a website or something wired to a board. The
 * switch is the demonstration, so it is the only interactive thing up here.
 *
 * Each stack mirrors bricks that really exist, in the colours they really wear.
 */
const HERO: Record<Kind, { label: string; stack: HeroBrick[] }> = {
  game: {
    label: "a game",
    stack: [
      { text: "Make a game", detail: "about dodging falling rocks", tone: "bg-brick-blue" },
      { text: "It must move with the arrow keys", tone: "bg-brick-green" },
      { text: "Check that the ship moves", tone: "bg-brick-amber", nested: true },
      { text: "When a rock hits me", detail: "then lose a life", tone: "bg-brick-green" },
      { text: "Show it!", tone: "bg-brick-red" },
    ],
  },
  website: {
    label: "a website",
    stack: [
      { text: "Make a website", detail: "about me and the things I make", tone: "bg-brick-blue" },
      { text: "It must show a card for each thing I made", tone: "bg-brick-green" },
      { text: "Check that there are three cards", tone: "bg-brick-amber", nested: true },
      { text: "When someone taps a card", detail: "then it gently grows", tone: "bg-brick-green" },
      { text: "Show it!", tone: "bg-brick-red" },
    ],
  },
  device: {
    label: "something with a board",
    stack: [
      { text: "Make a thing with a board", detail: "that lights up when it gets dark", tone: "bg-brick-blue" },
      { text: "It has a light on pin 13", tone: "bg-brick-teal" },
      { text: "It has a light sensor on pin 34", tone: "bg-brick-teal" },
      { text: "It must turn the light on in the dark", tone: "bg-brick-green" },
      { text: "Check that the light comes on", tone: "bg-brick-amber", nested: true },
      { text: "Show it!", tone: "bg-brick-red" },
    ],
  },
}

const KIND_ORDER: Kind[] = ["game", "website", "device"]

/** What each kind produces, said plainly. */
const OUTCOME: Record<Kind, string> = {
  game: "You play it in the browser, straight away.",
  website: "You get a real page, and a link you can share.",
  device: "You get a sketch to upload to an ESP32.",
}

/** Starter sets carry the same marker as the kind they belong to. */
const CATEGORY_KIND: Record<ExampleNugget["category"], Kind> = {
  game: "game",
  web: "website",
  device: "device",
}

function Landing() {
  const router = useRouter()
  const ownerId = useOwnerId()
  const mine = useLocalProjects()
  const [kind, setKind] = useState<Kind>("game")
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const create = useMutation(api.projects.create)
  const removeRemote = useMutation(api.projects.remove)

  const remote = useQuery(
    api.projects.listMine,
    isConvexConfigured && ownerId ? { ownerId } : "skip"
  )

  const projects = useMemo(() => {
    const byId = new Map<
      string,
      { id: string; name: string; updatedAt: number; here: boolean }
    >()
    for (const local of mine) {
      byId.set(local.id, {
        id: local.id,
        name: local.name,
        updatedAt: local.updatedAt,
        here: true,
      })
    }
    for (const row of remote ?? []) {
      const existing = byId.get(row._id)
      if (!existing || row.updatedAt > existing.updatedAt) {
        byId.set(row._id, {
          id: row._id,
          name: row.name,
          updatedAt: row.updatedAt,
          here: existing?.here ?? false,
        })
      }
    }
    return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  }, [mine, remote])

  const start = useCallback(
    async (example: ExampleNugget | null) => {
      if (!isConvexConfigured) {
        setProblem(
          "The workshop isn't connected. A grown-up needs to finish setting it up before you can build."
        )
        return
      }
      setBusy(true)
      setProblem(null)
      try {
        const owner = ownerId ?? getOwnerId() ?? "anonymous"
        const secret = newSecret()
        const projectKind =
          example === null ? "game" : CATEGORY_KIND[example.category]
        const workspace = JSON.stringify(example?.workspace ?? BLANK_WORKSPACE)
        const name = example?.name ?? "My project"

        const projectId = await create({
          name,
          kind: projectKind,
          ownerId: owner,
          secret,
          workspace,
        })

        // Store the capability key before navigating: without it the studio cannot
        // open the project it just made.
        saveLocalProject({ id: projectId, secret, name, kind: projectKind, workspace })
        bump()
        router.push(`/?id=${projectId}`)
      } catch {
        setProblem("That didn't start. Check your connection and try again.")
        setBusy(false)
      }
    },
    [create, ownerId, router]
  )

  const forget = useCallback(
    async (id: string) => {
      const local = mine.find((p) => p.id === id)
      forgetLocalProject(id)
      bump()
      if (local && isConvexConfigured) {
        await removeRemote({ projectId: id as Id<"projects">, secret: local.secret }).catch(
          () => undefined
        )
      }
    },
    [mine, removeRemote]
  )

  return (
    <main className="min-h-svh">
      <div className="mx-auto max-w-5xl px-6 py-10 sm:py-16">
        <header className="mb-12 flex items-baseline justify-between gap-4">
          <p className="font-display text-2xl font-bold tracking-tight text-ink">lamine</p>
          <Link
            href="#grown-ups"
            className="text-sm text-slate underline-offset-4 hover:text-ink hover:underline"
          >
            for grown-ups
          </Link>
        </header>

        <h1 className="max-w-[30ch] font-display text-4xl leading-[1.08] font-bold text-ink sm:text-[3.25rem]">
          Snap bricks together. Get the real thing.
        </h1>
        <p className="mt-5 max-w-[56ch] text-[17px] leading-relaxed text-slate">
          You say what you want and how you&apos;ll know it works. Your three helpers write the
          actual code, run your checks, and hand it back working. No typing code, no installing
          anything, no sign-up.
        </p>

        <div className="mt-10 grid gap-10 sm:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] sm:gap-14">
          <section aria-label="What a project looks like">
            {/* The switch is the demonstration: same bricks, three kinds of thing. */}
            <div
              className="mb-4 flex flex-wrap gap-1.5"
              role="tablist"
              aria-label="Kind of thing to make"
            >
              {KIND_ORDER.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={kind === option}
                  onClick={() => setKind(option)}
                  className={cn(
                    "rounded-xl border px-3 py-1.5 text-[13px] font-medium transition-colors",
                    kind === option
                      ? "border-brick-blue bg-brick-blue text-white"
                      : "border-line bg-surface text-slate hover:border-brick-blue hover:text-brick-blue"
                  )}
                >
                  {HERO[option].label}
                </button>
              ))}
            </div>

            <ol className="space-y-1.5">
              {HERO[kind].stack.map((brick, index) => (
                <li
                  // Keyed by kind so the stack re-assembles when a child switches,
                  // which answers their action rather than animating on its own.
                  key={`${kind}-${brick.text}`}
                  className={cn("snap-in", brick.nested && "ml-6")}
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  <div className={cn("brick px-4 py-3", brick.tone)}>
                    <p className="text-[15px] leading-snug">{brick.text}</p>
                    {brick.detail ? (
                      <p className="font-sans text-[13px] leading-snug font-normal text-white/85">
                        {brick.detail}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>

            <p className="mt-4 text-[13px] text-slate">{OUTCOME[kind]}</p>
          </section>

          <section className="sm:pt-2">
            <button
              type="button"
              onClick={() => void start(null)}
              disabled={busy}
              className="brick bg-brick-green px-7 py-3.5 text-lg"
            >
              {busy ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-5 animate-spin" />
                  Opening
                </span>
              ) : (
                "Start building"
              )}
            </button>

            <div className="mt-10">
              <p className="mb-3 text-sm text-slate">Or open one that already works:</p>
              <ul className="space-y-2">
                {EXAMPLES.map((example) => (
                  <li key={example.id}>
                    <button
                      type="button"
                      onClick={() => void start(example)}
                      disabled={busy}
                      className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-brick-blue disabled:opacity-50"
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="font-display text-[15px] font-semibold text-ink">
                          {example.name}
                        </span>
                        <span className="text-[12px] text-slate">
                          {HERO[CATEGORY_KIND[example.category]].label}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-slate">
                        {example.description}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {problem ? (
              <p className="mt-8 max-w-[52ch] rounded-xl border border-brick-red/30 bg-surface px-4 py-3 text-sm text-ink">
                {problem}
              </p>
            ) : null}
          </section>
        </div>

        {projects.length > 0 ? (
          <section className="mt-20" aria-label="Your projects">
            <h2 className="mb-4 font-display text-xl font-bold text-ink">Your projects</h2>
            <ul className="divide-y divide-line border-y border-line">
              {projects.map((project) => (
                <li key={project.id} className="group flex items-center gap-3 py-1">
                  <Link
                    href={`/?id=${project.id}`}
                    className="min-w-0 flex-1 py-2.5 text-[15px] font-medium text-ink hover:text-brick-blue"
                  >
                    <span className="truncate">{project.name}</span>
                    <span className="ml-3 text-[13px] font-normal text-slate">
                      {project.here ? edited(project.updatedAt) : "on another device"}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => void forget(project.id)}
                    aria-label={`Delete ${project.name}`}
                    className="rounded-lg p-2 text-slate opacity-0 transition-opacity group-hover:opacity-100 hover:bg-paper-sunken hover:text-brick-red focus-visible:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section id="grown-ups" className="mt-20 max-w-[62ch] scroll-mt-8">
          <h2 className="mb-3 font-display text-xl font-bold text-ink">For grown-ups</h2>
          <div className="space-y-3 text-[15px] leading-relaxed text-slate">
            <p>
              Projects are saved in this browser and are private until you publish one. Clearing
              browser data loses access to them, so use a project&apos;s share link if you want it
              on another device.
            </p>
            <p>
              Whatever a child types in a brick is sent to an AI model as a description of what to
              build, so it should not include a full name, a school or an address. Code runs in a
              throwaway Linux sandbox with no internet access, not on this computer.
            </p>
            <p>
              A board project produces a sketch to upload yourself. Nothing is flashed to hardware
              from here, and the checks on a board project confirm the code&apos;s shape rather than
              watching it run.
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}

/**
 * What the static host serves before JavaScript runs.
 *
 * Reading the query parameter makes this page client-rendered, so this is the
 * only markup in the prerendered `index.html`. It gets the wordmark and the
 * opening line rather than a spinner, so the first paint is the product.
 */
function Splash() {
  return (
    <div className="min-h-svh bg-paper">
      <div className="mx-auto max-w-5xl px-6 py-10 sm:py-16">
        <p className="font-display text-2xl font-bold tracking-tight text-ink">lamine</p>
        <p className="mt-12 max-w-[30ch] font-display text-4xl leading-[1.08] font-bold text-ink sm:text-[3.25rem]">
          Snap bricks together. Get the real thing.
        </p>
      </div>
    </div>
  )
}

function edited(at: number): string {
  const minutes = Math.floor((Date.now() - at) / 60000)
  if (minutes < 2) return "just now"
  if (minutes < 60) return `${minutes} minutes ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? "yesterday" : `${days} days ago`
}
