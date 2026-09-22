"use client"

import { useMutation, useQuery } from "convex/react"
import { Loader2, Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useMemo, useState } from "react"

import { isConvexConfigured } from "@/components/convex-client-provider"
import { NuggetPicker } from "@/components/explorer/NuggetPicker"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { bump, useLocalProjects, useOwnerId } from "@/hooks/use-local"
import { BLANK_WORKSPACE } from "@/lib/examples"
import type { ExampleNugget } from "@/lib/examples"
import { getOwnerId } from "@/lib/identity"
import { forgetLocalProject, newSecret, saveLocalProject } from "@/lib/storage"

/** Project cards cycle through the brick colours, so a shelf of them reads as a set. */
const CARD_BRICKS = [
  "bg-brick-blue",
  "bg-brick-green",
  "bg-brick-amber",
  "bg-brick-purple",
  "bg-brick-teal",
  "bg-brick-red",
]

export default function HomePage() {
  const router = useRouter()
  const ownerId = useOwnerId()
  const mine = useLocalProjects()
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const create = useMutation(api.projects.create)
  const removeRemote = useMutation(api.projects.remove)

  // The server's list fills in names and times for projects opened elsewhere
  // (a share link, or a browser whose localStorage was cleared).
  const remote = useQuery(
    api.projects.listMine,
    isConvexConfigured && ownerId ? { ownerId } : "skip"
  )

  const projects = useMemo(() => {
    const byId = new Map<
      string,
      { id: string; name: string; updatedAt: number; local: boolean }
    >()
    for (const local of mine) {
      byId.set(local.id, {
        id: local.id,
        name: local.name,
        updatedAt: local.updatedAt,
        local: true,
      })
    }
    for (const row of remote ?? []) {
      const existing = byId.get(row._id)
      if (!existing || row.updatedAt > existing.updatedAt) {
        byId.set(row._id, {
          id: row._id,
          name: row.name,
          updatedAt: row.updatedAt,
          local: existing?.local ?? false,
        })
      }
    }
    return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  }, [mine, remote])

  const startProject = useCallback(
    async (example: ExampleNugget | null) => {
      if (!isConvexConfigured) {
        setProblem(
          "The workshop isn't connected yet — a grown-up needs to finish setting it up."
        )
        return
      }
      setBusy(true)
      setProblem(null)
      try {
        const owner = ownerId ?? getOwnerId() ?? "anonymous"
        const secret = newSecret()
        const kind: "game" | "website" =
          example === null
            ? "game"
            : example.category === "game"
              ? "game"
              : "website"
        const workspace = JSON.stringify(example?.workspace ?? BLANK_WORKSPACE)
        const name = example?.name ?? "My project"

        const projectId = await create({
          name,
          kind,
          ownerId: owner,
          secret,
          workspace,
        })

        // Store the capability key before navigating: without it the studio cannot
        // open the project it just made.
        saveLocalProject({ id: projectId, secret, name, kind, workspace })
        bump()
        router.push(`/studio/${projectId}`)
      } catch {
        setProblem("I couldn't start that. Check the connection and try again.")
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
        await removeRemote({
          projectId: id as Id<"projects">,
          secret: local.secret,
        }).catch(() => undefined)
      }
    },
    [mine, removeRemote]
  )

  return (
    <main className="baseplate min-h-svh">
      <div className="mx-auto max-w-4xl px-6 py-14">
        <header className="mb-10">
          <h1 className="font-display text-6xl font-bold tracking-tight">
            <span className="brick-wordmark">lamine</span>
          </h1>
          <p className="mt-3 max-w-xl text-lg leading-snug text-ink-soft">
            Snap bricks together to say what you want. Press GO. Real helpers
            write real code, and you play it right here.
          </p>
          <p className="mt-2 text-[12px] text-ink-faint">
            No sign-up. Your projects are saved in this browser.
          </p>
        </header>

        <button
          type="button"
          onClick={() => setPicking(true)}
          disabled={busy}
          className="brick brick-studs go-brick mb-10 inline-flex items-center gap-2 px-6 py-3 text-lg"
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Plus className="size-5" />
          )}
          Make something
        </button>

        {problem ? (
          <p className="mb-8 rounded-xl border-2 border-brick-red/40 bg-plate-raised px-4 py-3 text-sm text-ink-soft">
            {problem}
          </p>
        ) : null}

        <section>
          <h2 className="mb-3 font-display text-xs font-bold tracking-widest text-ink-faint uppercase">
            Your projects
          </h2>

          {projects.length === 0 ? (
            <p className="rounded-xl border-2 border-dashed border-plate-edge px-4 py-10 text-center text-sm text-ink-faint">
              Nothing yet. Press <strong>Make something</strong> and pick a
              starter set.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {projects.map((project, index) => (
                <li key={project.id} className="group relative">
                  <Link
                    href={`/studio/${project.id}`}
                    className={`brick brick-studs block px-4 py-3 pr-11 ${CARD_BRICKS[index % CARD_BRICKS.length]}`}
                  >
                    <span className="block truncate font-display text-[15px] font-bold">
                      {project.name}
                    </span>
                    <span className="block text-[11px] opacity-85">
                      {project.local
                        ? whenever(project.updatedAt)
                        : "opened on another device"}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => void forget(project.id)}
                    aria-label={`Delete ${project.name}`}
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-2 text-white/70 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/20 hover:text-white focus:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-12 max-w-xl text-[12px] leading-relaxed text-ink-faint">
          Projects are private until a grown-up publishes them. Anything you
          type goes to the helpers as a description of what to build, so
          don&apos;t put your full name, school or address in a brick.
        </footer>
      </div>

      {picking ? (
        <NuggetPicker
          busy={busy}
          onClose={() => setPicking(false)}
          onPick={(example) => void startProject(example)}
        />
      ) : null}
    </main>
  )
}

function whenever(at: number): string {
  const seconds = Math.floor((Date.now() - at) / 1000)
  if (seconds < 90) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minutes ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}
