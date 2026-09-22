# Hackathon log

- **Project:** lamine
- **Event:** Convex All Gas Hackathon
- **Challenge:** Build a new full-stack app: Convex runs it, Firecrawl feeds it data, AgentMail gives it an inbox. Use Codex or any agent with the Convex plugin. Three weeks to ship something people can use.
- **What it does:** Children aged 8-14 snap bricks that describe a game, a website or something wired to an ESP32, then AI agents write the real code in a sandbox and hand it back playable in the browser or ready to upload.
- **Live app:** https://glad-curlew-471.convex.site
- **Repo:** https://github.com/manideep1428/lamine
- **Frontend:** Convex static hosting
- **Convex deployment:** https://glad-curlew-471.convex.cloud
- **Components:** @convex-dev/static-hosting
- **Convex features:** schema, tables, indexes, queries, mutations, actions, HTTP actions, scheduled functions, file storage, realtime queries
- **Auth:** none
- **AI models:** gpt-5.6-luna
- **Started:** 2026-09-22T05:05:26Z
- **Last updated:** 2026-09-22T18:15:57Z

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

### 2026-09-22 - 165b2d1
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
### 2026-09-22 - 7956dbb
Added a device target, so a child can describe something physical and get an ESP32
sketch they can upload. A new brick says what is wired to which pin, the Goal brick
gained a "thing with a board" kind, and a board project is routed to Arduino
guidance rather than a drawing library (`lib/core/spec.ts`, `lib/core/blocks.ts`,
`components/blocks/definitions.ts`, `lib/core/prompts/frameworks.ts`). The existing
zip export is the delivery path, so no new plumbing was needed. A Night Light
starter set ships with it.

The honest limit is written into the prompts: firmware cannot run in the sandbox,
so the tester is told it can check structure and never claim a behaviour was
observed, and both the planner and the builder are told never to touch a pin the
child did not list. Compiling the sketch and flashing over Web Serial are the next
steps, not part of this. 244 tests.
### 2026-09-22 - f4cd5b8
Tightened the brick rules and made the home page tell the truth about what can be
built. "Make it like" and "Make it look" are now one-per-project like Goal and
Show it: a second copy could only overwrite the first, so the tray refuses it and
the interpreter reports a duplicate that arrived another way. Two parts on one pin
is reported by name. The top brick wins rather than the bottom one, so the result
does not depend on stack order (`lib/core/blocks.ts`, `components/blocks/`).

The helpers panel collapses to a rail with a toggle or Ctrl+B, remembered across
visits, keeping the three helpers visible with a dot when they have said something
new. The home page hero now switches between a game, a website and a board
project, because it described only games after the device target landed
(`app/page.tsx`, `components/studio/BuddyDock.tsx`). 262 tests.

Also covered the drop placement itself, which had none: it is the only code that
disconnects and reconnects live Blockly connections, and getting it wrong silently
rearranges a child's project (`components/blocks/placement.test.ts`).

### 2026-09-22 - 2cecb58
Fixed the bug that made the brick editor unusable and finished the studio's shell.

Typing into the editor panel was impossible. Its inputs live outside the Blockly
canvas, so focusing one makes Blockly let go of its selection and fire a selection
event with a null id, which the listener turned into "nothing is selected" and
unmounted the panel on the first click. The panel now tracks its own brick and
closes only when that brick is binned (`components/blocks/BlockCanvas.tsx`).

The plan, code and checks views showed "press GO" even while a build was running.
Each now picks between data, a loader naming the phase that is actually running,
and the invitation once the session settles; a view waiting on an earlier phase
says what it is waiting for rather than spinning (`components/studio/Working.tsx`).

The plan graph laid tasks left to right, so a six-step chain was 1556px wide and
the last step was clipped. Layers run down the page now with parallel work side by
side, which fits any pane and matches how the bricks read
(`components/studio/TaskGraph.tsx`).

Tray bricks carry icons, "What you're building" moved off the canvas into the
right panel where it no longer covers the board, and the studio wordmark became a
logo slot. 269 tests.

### 2026-09-22 - 1b94849
Added a brick that reads the web, and wired in the logo.

"Look up ___" lets a child ask their helpers to read about something while the
project is built. The lookup runs at build time inside the Convex action, never in
the child's project and never in the sandbox: a published project is public static
files, so a runtime lookup would mean shipping an API key in readable source or
standing up a public endpoint with its own rate-limiting and abuse story. The page
also still works with no network. Both prompts carry the rule, and a test asserts it
(`convex/lib/firecrawl.ts`, `lib/core/lookup.test.ts`).

The tool is only offered when the child asked for a lookup and a key is configured,
so the model is never told about a tool that cannot work; reviewers never get it.
Capped at five lookups, three results each, 4000 characters. A timeout or malformed
payload tells the agent nothing came back and not to invent facts, and the build
carries on.

Not verified against the live Firecrawl API: no key is set, so the brick is inert in
production and the response parsing is written defensively against a shape inferred
from their documented v1 search endpoint rather than one observed. 280 tests.

AgentMail was considered and not built. Sending mail needs a recipient, and a child
choosing recipients is a different class of risk from reading a public page: it wants
a grown-up's address captured once and locked, which is a consent flow rather than a
brick.
