# The sandbox

Every build runs inside an E2B microVM: a real Linux machine with a real
filesystem, where the agents write real files and the preview server exposes a
real port. This folder defines the machine.

## Build it

```bash
npm i -g @e2b/cli          # once
e2b auth login             # once
bun run sandbox:template   # e2b template build --name lamine-web --path sandbox
```

Then set the template name in the Convex environment (Dashboard → Settings →
Environment Variables), alongside the keys:

| Variable | Value |
| --- | --- |
| `E2B_API_KEY` | from e2b.dev |
| `E2B_TEMPLATE` | `lamine-web` |
| `OPENAI_API_KEY` | from platform.openai.com |
| `OPENAI_MODEL` | optional, defaults to `gpt-5.1` |
| `E2B_ALLOW_INTERNET` | optional, `true` re-enables outbound internet |

Without `E2B_TEMPLATE` the code falls back to E2B's `base` template. Builds still
work — Phaser and p5 are simply not vendored, so only the `canvas` and website
paths are usable.

## What is baked in, and why

| | |
| --- | --- |
| `lib/phaser.min.js`, `lib/p5.min.js` | Agents reference these with a plain `<script>` tag. Pre-baking them is what lets a build take seconds instead of paying for `npm install`, and it is the only way they can exist at all with the internet switched off. |
| `serve` (global) | A static server that needs no network. |
| `/home/user/project` as the working directory | Every agent tool call is relative to it, and `lib/core/paths.ts` refuses anything outside it — in code, not only in the prompt. |

## Two settings that are not optional

Both come from PLAN.md §9, and both are about the child rather than about our
infrastructure — the microVM already handles that.

1. **Autopause.** `convex/lib/sandbox.ts` creates sandboxes with
   `lifecycle: { onTimeout: "pause", autoResume: true }`. E2B's default is
   `kill`, which would delete a child's project after five idle minutes. Paused
   sandboxes are not billed, keep their filesystem, and wake on the next HTTP hit
   — which is why a kid can come back tomorrow and their game is still there.
2. **No outbound internet.** Sandboxes are created with
   `allowInternetAccess: false`. Agent-written code should not be able to fetch
   from, or send anything to, the open internet.

The preview URL (`https://3000-{sandboxId}.e2b.app`) is public by default. Turn on
E2B's restrict-public-access setting for your team before any real classroom use:
a child's work-in-progress should not sit on a guessable public address.

## Updating a pinned library

Change the `ARG` in `e2b.Dockerfile`, rebuild the template, and check the matching
guidance in `lib/core/prompts/frameworks.ts` still describes that version's API.
The two have to move together — that file is what agents build against.
