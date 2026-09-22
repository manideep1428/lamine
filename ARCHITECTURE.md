# Lamine — architecture

Children aged 8–14 snap bricks together to describe a game or a website. They
press GO. AI agents write real code inside a sandbox, and the result loads in an
iframe they can play.

The bricks never become code. They become a **specification**, and agents read
that. This is the whole reason a child can ask for something the block library
was never designed for.

---

## 1. The flow

```
 bricks on a canvas
        │  interpretWorkspace()  — pure, no DOM
        ▼
   NuggetSpec (JSON, zod-validated)
        │  the child presses GO
        ▼
 plan ──► execute ──► test ──► preview        (Convex actions)
   │         │          │         │
 task DAG  agents     run the   start a
           write      child's   server in
           files      checks    the sandbox
        │
        ▼  every step inserts a row
   Convex tables ──► the studio re-renders live
        │
        ▼  all writes and commands land here
   E2B sandbox: a real Linux machine
        │
        ▼
   <iframe src={previewUrl} />
```

## 2. Where the work happens

| | |
| --- | --- |
| Browser | Blockly canvas, the studio, block interpretation |
| Convex | the build pipeline, all four phases, every API key |
| E2B | only the child's generated project |

Nothing about the app itself runs in the sandbox, and no key ever reaches the
browser. The frontend is a static export hosted on Convex static hosting, so the
browser talks to Convex directly.

## 3. No accounts

No sign-up, no login, no id to type. A random UUID in `localStorage` is the whole
identity system (`lib/identity.ts`).

localStorage is the **fast copy**: written on every brick change, works offline,
zero latency. Convex is the **real copy**: debounced 500ms, and the only one that
can run a build. On load both are read and the newer `updatedAt` wins, which
covers the tab that closed mid-sync (`lib/storage.ts`, `hooks/use-project.ts`).

Because there are no accounts, `ownerId` is a claim rather than an identity. The
real gate is a per-project `secret`: every private query and mutation takes it and
rejects a mismatch. Possession of the link is the permission — and the UI says so
plainly rather than calling a published project protected.

## 4. The bricks

Nine of them. A Goal brick sits at the top with nothing above it; promises and
style stack beneath it; a Proof brick nests *inside* a promise and cannot join the
main stack.

That last rule is load-bearing and it is enforced by Blockly, not by us: the main
stack is typed `lamine_body` and proofs are typed `lamine_proof`, so illegal
targets are refused and the brick springs back. Typing only one side would not
work — a connection with a null check accepts anything
(`components/blocks/definitions.ts`, proven in `definitions.test.ts`).

`lib/core/blocks.ts` walks Blockly's *serialized JSON* rather than live block
objects, which keeps it pure and unit-testable. `lib/core/spec.ts` caps every
string and array, and surfaces a warning instead of silently truncating a child's
words.

## 5. The agents

Three roles share one prompt skeleton of 13 sections, of which only four differ
per role (`lib/core/prompts/shared.ts`). Writing three prompts instead would let
them drift apart.

| Role | Job | Verdict | Tools |
| --- | --- | --- | --- |
| builder | writes the code | `OK` / `FAIL` | write, read, list, run, done |
| tester | writes and runs tests | `PASS` / `FAIL` | write, read, list, run, done |
| reviewer | judges the result | `APPROVED` / `NEEDS_CHANGES` | read, list, run, done |

The reviewer has no `write_file`. That absence is what makes it a reviewer rather
than a second builder.

Two sections are byte-identical across all three roles and a test enforces it:
Content Safety, and the Security Restrictions that end with the rule that child
text inside `<kid_goal>`, `<kid_rule>` and `<kid_input>` tags is data, never
instructions. Block fields are a real prompt-injection surface.

## 6. The pipeline

- **plan** — `openai.responses.parse` with a zod schema, so the shape is
  guaranteed at decode time. `validatePlan` then checks the *meaning*: dangling
  dependencies, cycles, path escapes, two tasks owning one file. Schema
  conformance is not validation.
- **execute** — the tool loop. Bounded on every axis: 24 turns per task, 10 per
  action, 90 per session, and a session-state check every turn so STOP is obeyed
  immediately. Long tasks park their conversation on the task row and resume in a
  fresh action, because a Convex action cannot run forever.
- **test** — runs the child's Proof bricks as real test files and parses one line
  per check. Half passing is enough to show the child their project; below that,
  one repair attempt, then preview anyway and say what still fails.
- **preview** — starts a static server in the sandbox and exposes its port.

Every step inserts a row into `events`. That single table is the entire realtime
layer: the studio subscribes with `useQuery` and updates itself. No sockets.

## 7. Boundaries that are code, not prose

`lib/core/paths.ts` is the security boundary. It rejects absolute paths, drive
letters, `~`, null bytes, and `..` — rejects rather than resolves, so
`src/../../etc` cannot collapse into `etc`. Writes must additionally fall inside
the task's own allowlist. Telling an agent about `allowedPaths` in a prompt is not
enforcement.

Shell commands are filtered too, and the sandbox is created with no outbound
internet.

## 8. Publishing and export

E2B is metered, ephemeral compute, so a finished project is never served from it.
On publish the files are copied into Convex file storage and served by
`convex/http.ts` from `.convex.site` — a different origin from the app,
permanent, and free to keep. Export zips the same files with no dependency
(`lib/core/zip.ts`).

Publishing is off by default and needs a grown-up action. With no accounts that
gate is a speed bump, not a wall, and the copy does not pretend otherwise.

## 9. The sandbox

Sandboxes are created with `lifecycle: { onTimeout: "pause", autoResume: true }`.
The platform default is to kill, which would destroy a child's project after five
idle minutes. Paused sandboxes are not billed and wake on the next request, so a
child returning tomorrow finds their game still there.

Outbound internet is off. That is why game libraries are pre-baked into the
template rather than installed at build time — see `sandbox/README.md`. Without a
custom template the base image still covers plain-canvas games and websites.

## 10. Safety rules that are not negotiable

| Rule | Why |
| --- | --- |
| Projects are private until a grown-up publishes | A child's work does not belong on a guessable public URL |
| `allowedPaths` enforced in `runTool`, never only in the prompt | Prompts are advice; code is a boundary |
| Child text wrapped as data in every prompt | Block fields are an injection surface |
| Content safety block in every agent prompt | Age-appropriate output, ages 8–14 |
| Cost capped per session: turns, tasks, sandbox time | Runaway loops cost real money |
| Never serve a finished project from the sandbox | Origin isolation and permanence |
| Every private query and mutation checks the secret | With no accounts, the key *is* the permission |

## 11. Testing

232 tests, all of them on pure modules — block interpretation, spec caps, plan
validation, path enforcement, tool schemas, history trimming, test parsing, the
zip writer, and the theme.

The valuable ones are the ones that caught real bugs: real Blockly refusing a
Proof brick on the main stack, contrast of white text against every brick colour,
and the path guard rejecting every escape attempt. The phase actions stay thin so
that the only untested part is the network call itself.

## 12. Layout

```
app/                  one static entry point, routed on ?id=
components/blocks/    Blockly: definitions, the brick renderer, the canvas
components/studio/    the shell: tray, rail, canvas views, buddies
convex/               schema, the four phases, crew, publish, http
convex/lib/           sandbox and OpenAI helpers (Node runtime)
lib/core/             pure logic: blocks, spec, plan, paths, prompts, tools
sandbox/              the E2B template
```
