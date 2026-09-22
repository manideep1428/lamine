/**
 * Starter nuggets for the picker.
 *
 * Each one is a serialized Blockly workspace, so choosing an example drops a
 * real, connected block stack onto the canvas that the kid can immediately
 * edit.
 */

import { BLOCK, type BlockState, type WorkspaceState } from "./core/blocks"

export interface ExampleNugget {
  id: string
  name: string
  category: "game" | "web" | "device"
  description: string
  workspace: WorkspaceState
}

/* ── tiny builders, so the nesting stays readable ───────────────────────── */

function b(
  type: string,
  fields?: Record<string, unknown>,
  inputs?: BlockState["inputs"]
): BlockState {
  return { type, ...(fields ? { fields } : {}), ...(inputs ? { inputs } : {}) }
}

/** Link blocks into a `next` chain and return the head. */
function stack(blocks: BlockState[]): BlockState | undefined {
  if (blocks.length === 0) return undefined
  for (let i = 0; i < blocks.length - 1; i++) {
    blocks[i].next = { block: blocks[i + 1] }
  }
  return blocks[0]
}

/** Proof blocks to nest inside a Feature / When-Then. */
function proofs(...checks: string[]): BlockState["inputs"] {
  const head = stack(checks.map((c) => b(BLOCK.proof, { CHECK: c })))
  return head ? { PROOFS: { block: head } } : undefined
}

function feature(what: string, ...checks: string[]): BlockState {
  return b(BLOCK.feature, { WHAT: what }, proofs(...checks))
}

function whenThen(when: string, then: string, ...checks: string[]): BlockState {
  return b(BLOCK.whenThen, { WHEN: when, THEN: then }, proofs(...checks))
}

function part(what: string, pin: string): BlockState {
  return b(BLOCK.part, { PART: what, PIN: pin })
}

function workspace(
  goalFields: Record<string, unknown>,
  body: BlockState[]
): WorkspaceState {
  const goal: BlockState = {
    type: BLOCK.goal,
    x: 48,
    y: 40,
    fields: goalFields,
  }
  const head = stack(body)
  if (head) goal.next = { block: head }
  return { blocks: { languageVersion: 0, blocks: [goal] } }
}

/* ── the examples ───────────────────────────────────────────────────────── */

export const EXAMPLES: ExampleNugget[] = [
  {
    id: "space-dodge",
    name: "Space Dodge",
    category: "game",
    description:
      "Steer a ship through falling rocks. Score, lives, and a game over screen.",
    workspace: workspace(
      {
        KIND: "game",
        GOAL: "dodging falling rocks in space",
        FRAMEWORK: "canvas",
      },
      [
        feature(
          "move left and right with the arrow keys",
          "the player moves when I press a key",
          "the player cannot leave the screen"
        ),
        feature(
          "drop rocks from the top that fall down",
          "new rocks appear over time"
        ),
        feature(
          "show a score that goes up",
          "the score is bigger after dodging a rock"
        ),
        whenThen(
          "a rock hits the player",
          "lose a life and flash red",
          "lives go down by one"
        ),
        whenThen("lives reach zero", "show a game over screen with my score"),
        b(BLOCK.remembers, { WHAT: "my best score" }),
        b(BLOCK.style, { VISUAL: "retro", PERSONALITY: "exciting" }),
        b(BLOCK.show),
      ]
    ),
  },
  {
    id: "pong",
    name: "Pong",
    category: "game",
    description:
      "The classic two-paddle bounce game, against a simple computer player.",
    workspace: workspace(
      {
        KIND: "game",
        GOAL: "a bouncing ball paddle game",
        FRAMEWORK: "canvas",
      },
      [
        feature(
          "move my paddle up and down with the arrow keys",
          "the paddle moves when I press a key"
        ),
        feature(
          "bounce the ball off the paddles and the walls",
          "the ball changes direction on a hit"
        ),
        feature("give the computer a paddle that follows the ball"),
        whenThen(
          "the ball goes past a paddle",
          "the other player scores a point",
          "the score goes up"
        ),
        b(BLOCK.style, { VISUAL: "neon", PERSONALITY: "sharp" }),
        b(BLOCK.show),
      ]
    ),
  },
  {
    id: "click-counter",
    name: "Click Counter",
    category: "web",
    description:
      "A big friendly button that counts your taps and throws confetti.",
    workspace: workspace(
      {
        KIND: "website",
        GOAL: "a fun button that counts my clicks",
        FRAMEWORK: "canvas",
      },
      [
        feature(
          "show one big button in the middle",
          "the button is on the page"
        ),
        whenThen(
          "I click the button",
          "the number goes up by one",
          "the number changes after a click"
        ),
        whenThen("the number hits ten", "throw confetti everywhere"),
        b(BLOCK.remembers, { WHAT: "how many times I clicked" }),
        b(BLOCK.style, { VISUAL: "pastel", PERSONALITY: "bouncy" }),
        b(BLOCK.show),
      ]
    ),
  },
  {
    id: "my-page",
    name: "My Page",
    category: "web",
    description:
      "A page about you: a big hello, cards for your projects, and a way to say hi.",
    workspace: workspace(
      {
        KIND: "website",
        GOAL: "a page about me and the things I make",
        FRAMEWORK: "canvas",
      },
      [
        feature(
          "show a big hello with my name and what I like",
          "the hello text is on the page"
        ),
        feature("show cards for three things I made", "there are three cards"),
        feature("have a button that sends a message to my grown-up"),
        whenThen("someone clicks a card", "it gently grows"),
        b(BLOCK.style, { VISUAL: "clean", PERSONALITY: "friendly" }),
        b(BLOCK.show),
      ]
    ),
  },
  {
    id: "night-light",
    name: "Night Light",
    category: "device",
    description:
      "A light on your ESP32 that turns itself on in the dark, with a button to force it on.",
    workspace: workspace(
      {
        KIND: "device",
        GOAL: "a night light that knows when the room is dark",
        FRAMEWORK: "canvas",
      },
      [
        part("LED", "13"),
        part("light sensor", "34"),
        part("button", "12"),
        feature(
          "turn the light on when the room gets dark",
          "the light pin is set high when the sensor reads dark"
        ),
        whenThen(
          "I press the button",
          "turn the light on even if it is bright",
          "the button pin is read with a pull-up"
        ),
        feature(
          "print what it is doing to the Serial Monitor so I can watch it",
          "every change prints one line"
        ),
        b(BLOCK.remembers, { WHAT: "whether I forced the light on" }),
        b(BLOCK.show),
      ]
    ),
  },
]

/** A single Goal block, for kids who want to start from nothing. */
export const BLANK_WORKSPACE: WorkspaceState = workspace(
  { KIND: "game", GOAL: "", FRAMEWORK: "canvas" },
  [b(BLOCK.show)]
)

export function findExample(id: string): ExampleNugget | undefined {
  return EXAMPLES.find((e) => e.id === id)
}
