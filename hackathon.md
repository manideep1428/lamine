# Hackathon log

- **Project:** lamine
- **Event:** Convex All Gas Hackathon
- **What it does:** Children aged 8-14 snap bricks that describe a game or website, then AI agents write the real code in a sandbox and hand it back playable in the browser.
- **Live app:** https://glad-curlew-471.convex.site
- **Repo:** none
- **Frontend:** Convex static hosting
- **Convex deployment:** https://glad-curlew-471.convex.cloud
- **Components:** @convex-dev/static-hosting
- **Convex features:** schema, tables, indexes, queries, mutations, actions, HTTP actions, scheduled functions, file storage, realtime queries
- **Auth:** none
- **AI models:** gpt-5.6-luna
- **Started:** 2026-09-22T05:05:26Z
- **Last updated:** 2026-09-22T16:33:12Z

## Log

### 2026-09-22 - 1b5d5f8
Scaffolded the Next.js 16 app with Tailwind 4, shadcn and a theme provider. No
Convex yet (`app/layout.tsx`, `app/globals.css`, `components.json`).

### 2026-09-22 - 2be5b06
Built the whole pipeline from bricks to a playable result. A child's connected
blocks are interpreted into a JSON spec; pressing GO starts a build session that
plans the work, writes real files in an E2B sandbox, runs the child's own checks,
and exposes a preview URL.

Convex carries all of it. `convex/schema.ts` holds projects, sessions, tasks,
events, files, messages and published files with indexes on every access path.
The four phases are internal actions that hand off through the scheduler, so a
long build survives the action time limit: `convex/phases/plan.ts` uses OpenAI
Structured Outputs to produce a validated task DAG, `execute.ts` runs the agent
tool loop, `test.ts` parses PASS/FAIL from the sandbox and gates on pass rate
with one bounded repair attempt, and `preview.ts` publishes the sandbox URL.

Every step inserts a row into `events`, and the studio subscribes with
`useQuery`, which is what makes the narrator feed live without any socket code.
`convex/http.ts` serves published projects and a zip export from `.convex.site`
using file storage, so a finished project outlives its sandbox.

Access control without accounts: each project carries a capability secret that
every private query and mutation checks (`convex/projects.ts`,
`convex/sessions.ts`). Agent file writes are bounded in code, not only in the
prompt (`lib/core/paths.ts`).

Frontend is a Blockly canvas with a custom brick renderer, a tap-or-drag tray, a
build rail, a live task DAG and the three buddies (`components/blocks/`,
`components/studio/`). 222 unit tests cover the pure core: block interpretation,
spec caps, plan validation, path enforcement, tool schemas, history trimming and
the zip writer.

### 2026-09-22 - working tree
Reworked the interface after review. Removed the faked 3D (moulded studs, inset
lips, offset shadows) for a flat palette, rebuilt the home page around a brick
stack that explains the product by being read top to bottom, and added
drag-and-drop from the tray plus a brick editor panel with real textareas for the
sentences children write (`app/globals.css`, `app/page.tsx`,
`components/studio/BrickEditor.tsx`, `components/studio/BrickTray.tsx`).

Three bugs found by testing rather than by looking: a null Blockly connection
check accepts anything, so Proof bricks could join the main stack until both
sides were typed; renderer constants set after `super.init()` left the drawn
outline and the measured layout disagreeing; and Blockly's generated stylesheet
forces dropdown text white with `!important`, which is invisible on a white field
tile, so the correction had to move into the renderer's own `getCSS_`.

Made the app deployable on Convex static hosting. Set `output: "export"` and
moved the studio off a dynamic path segment onto `/studio/?id=…`, because a
dynamic segment cannot be exported without knowing every project id at build
time and ids are created at runtime (`next.config.ts`, `app/studio/page.tsx`).
The build now reports every route as static and writes 49 files to `out/`.

Registered `@convex-dev/static-hosting` in `convex/convex.config.ts` and wired it
in app-owned root mode, so the existing `/p/{projectId}/…` published-site routes
and `/export` download keep their URLs while the component serves everything else
(`convex/http.ts`). Verified the exported bundle inlines the public Convex URL
and contains no API keys.

Deployed to production and the site is live. Two problems surfaced only by
checking the deployed result rather than the command output.

The static host serves files by exact key and does no directory-index
resolution, so `/studio/` fell through the SPA fallback to `/index.html` and a
child opening a project got the home page. Collapsed the app to one entry point
that routes on `?id=`, which the fallback serves correctly at any path
(`app/page.tsx`, the `app/studio/` route removed). The prerendered shell carries
the wordmark and headline so the first paint is the product rather than a spinner.

The hosting CLI sets `VITE_CONVEX_URL` for the build, which Next ignores — a
plain deploy would have shipped a production site still talking to the
development backend. `scripts/build-static.mjs` translates it to
`NEXT_PUBLIC_CONVEX_URL` and derives the `.convex.site` origin, cross-platform
because the documented one-liner uses POSIX expansion. Verified on the live site:
the production deployment id appears in the served chunks, the development one
does not, and no API key is present.

Made the codebase stand on its own. An earlier desktop prototype had been used as
a reference while building, and 58 comments and doc passages still named it. Those
comments now explain the reasoning directly — why paths are enforced in code
rather than in a prompt, why one structured call returns three voices, why the
events table is the whole realtime layer — which is more useful to a reader than
the provenance was. Replaced the porting plan with `ARCHITECTURE.md`, written from
the code as it actually stands: the palette section described colours the UI no
longer uses, so the old document was both derivative and stale. Updated the eight
source files that cited it. 232 tests still pass, which is the check that the pass
touched only comments.
