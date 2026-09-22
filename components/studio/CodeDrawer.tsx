"use client"

import { FileCode } from "lucide-react"
import { useState } from "react"

import { cn } from "@/lib/utils"

export interface MirroredFile {
  path: string
  content: string
  byTask: string
}

/**
 * What the agents actually wrote.
 *
 * Read from the Convex mirror rather than the sandbox, so the code is there even
 * when the sandbox has been reclaimed — and so a child can read the code that
 * built their game without anything having to be running.
 */
export function CodeDrawer({ files }: { files: MirroredFile[] }) {
  const [selected, setSelected] = useState<string | null>(null)

  if (files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="text-sm text-slate">
          Once your helpers write code, every file shows up here so you can read
          it.
        </p>
      </div>
    )
  }

  // Derived, not stored: a selection that no longer exists falls back to the
  // entry page, which is where a child wants to start reading anyway.
  const current =
    files.find((f) => f.path === selected) ??
    files.find((f) => f.path === "index.html") ??
    files[0]

  return (
    <div className="flex h-full">
      <ul className="w-56 shrink-0 overflow-y-auto border-r-2 border-line p-2">
        {files.map((file) => (
          <li key={file.path}>
            <button
              type="button"
              onClick={() => setSelected(file.path)}
              className={cn(
                "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs",
                file.path === current.path
                  ? "bg-brick-blue text-white"
                  : "text-slate hover:bg-paper-sunken"
              )}
            >
              <FileCode className="size-3 shrink-0" />
              <span className="truncate font-mono">{file.path}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b-2 border-line px-3 py-1.5">
          <span className="font-mono text-[11px] text-slate">
            {current.path}
          </span>
          <span className="text-[11px] text-slate">
            written in step {current.byTask}
          </span>
        </div>
        <pre className="code-panel flex-1 overflow-auto p-4 font-mono text-[12px] leading-relaxed">
          <code>{current.content}</code>
        </pre>
      </div>
    </div>
  )
}
