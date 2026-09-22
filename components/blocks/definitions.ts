/**
 * Blockly block definitions, theme and palette.
 *
 * Colours are named brick colours in the theme rather than Blockly hues, so the
 * canvas and the surrounding UI can't drift apart — both read the same seven
 * values. Named colours rather than Blockly hue numbers, so a designer can read
 * them and the canvas cannot drift from the chrome.
 *
 * The important structural lines are `check: "lamine_proof"` on the PROOFS input
 * and the two connection types below: the main stack is `lamine_body` and proofs
 * are `lamine_proof`, so a Proof physically cannot snap onto the stack. Blockly
 * refuses the connection and springs the block back — we get the rules for free
 * instead of hand-rolling drop validation.
 */

import * as Blockly from "blockly/core"

import { BLOCK } from "@/lib/core/blocks"
import { EXAMPLES } from "@/lib/examples"

/**
 * Connection types.
 *
 * Both sides have to be typed. A connection declared as `null` accepts *any*
 * check, so typing only the Proof block would still let a Proof snap onto the
 * main stack — Blockly would see `null` on the Goal's next connection and allow
 * it. Naming the main stack `lamine_body` is what makes the refusal real, and
 * there is a test in `definitions.test.ts` that asks Blockly directly.
 */
const BODY = "lamine_body"
const PROOF = BLOCK.proof

/** Must match the brick tokens in app/globals.css. */
export const BRICK = {
  red: { fill: "#c21f2b", edge: "#8e1620", ink: "#ffffff" },
  amber: { fill: "#9a6000", edge: "#6e4400", ink: "#ffffff" },
  green: { fill: "#0f7a41", edge: "#0a5a2f", ink: "#ffffff" },
  teal: { fill: "#0c7e8b", edge: "#095b64", ink: "#ffffff" },
  blue: { fill: "#1250d8", edge: "#0c3a9e", ink: "#ffffff" },
  purple: { fill: "#6b34c9", edge: "#4d2493", ink: "#ffffff" },
} as const

export type BrickColour = keyof typeof BRICK

/** Which brick colour each block family wears. */
export const BLOCK_COLOUR: Record<string, BrickColour> = {
  [BLOCK.goal]: "blue",
  [BLOCK.like]: "teal",
  [BLOCK.feature]: "green",
  [BLOCK.whenThen]: "green",
  [BLOCK.remembers]: "green",
  [BLOCK.proof]: "amber",
  [BLOCK.part]: "teal",
  [BLOCK.style]: "purple",
  [BLOCK.rule]: "purple",
  [BLOCK.show]: "red",
}

/** Blockly style names, one per brick colour we actually use. */
const STYLE = (colour: BrickColour) => `brick_${colour}`

/**
 * Examples a kid can base their build on.
 *
 * Derived from `lib/examples` rather than typed out again: the dropdown used to
 * list a "Photo Gallery" that no longer existed, and a kid picking it got a hint
 * the planner could make nothing of.
 */
export const EXAMPLE_CHOICES: [string, string][] = EXAMPLES.map((example) => [
  example.name,
  example.name,
])

export const VISUAL_CHOICES: [string, string][] = [
  ["retro 80s", "retro"],
  ["pastel candy", "pastel"],
  ["clean and modern", "clean"],
  ["glowing neon", "neon"],
  ["nature", "nature"],
]

const BLOCK_JSON: object[] = [
  {
    type: BLOCK.goal,
    message0: "🎯 Make a %1",
    args0: [
      {
        type: "field_dropdown",
        name: "KIND",
        options: [
          ["game", "game"],
          ["website", "website"],
          ["thing with a board", "device"],
        ],
      },
    ],
    message1: "about %1",
    args1: [
      { type: "field_input", name: "GOAL", text: "dodging falling rocks" },
    ],
    message2: "drawn with %1",
    args2: [
      {
        type: "field_dropdown",
        name: "FRAMEWORK",
        options: [
          ["plain canvas", "canvas"],
          ["Phaser", "phaser"],
          ["p5.js", "p5"],
        ],
      },
    ],
    nextStatement: BODY,
    style: STYLE("blue"),
    tooltip: "Say what you want to make. Everything else snaps underneath.",
    helpUrl: "",
  },
  {
    type: BLOCK.like,
    message0: "📦 Make it like %1",
    args0: [
      { type: "field_dropdown", name: "EXAMPLE", options: EXAMPLE_CHOICES },
    ],
    previousStatement: BODY,
    nextStatement: BODY,
    style: STYLE("teal"),
    tooltip: "Start from something that already works, then change it.",
    helpUrl: "",
  },
  {
    type: BLOCK.feature,
    message0: "✅ It must %1",
    args0: [
      { type: "field_input", name: "WHAT", text: "move with the arrow keys" },
    ],
    message1: "check it works %1",
    args1: [{ type: "input_statement", name: "PROOFS", check: PROOF }],
    previousStatement: BODY,
    nextStatement: BODY,
    style: STYLE("green"),
    tooltip:
      "Something your project has to do. Add a Check inside to prove it.",
    helpUrl: "",
  },
  {
    type: BLOCK.whenThen,
    message0: "⚡ When %1",
    args0: [
      { type: "field_input", name: "WHEN", text: "a rock hits the player" },
    ],
    message1: "then %1",
    args1: [{ type: "field_input", name: "THEN", text: "lose a life" }],
    message2: "check it works %1",
    args2: [{ type: "input_statement", name: "PROOFS", check: PROOF }],
    previousStatement: BODY,
    nextStatement: BODY,
    style: STYLE("green"),
    tooltip: "A rule: when something happens, something else happens.",
    helpUrl: "",
  },
  {
    type: BLOCK.remembers,
    message0: "💾 It remembers %1",
    args0: [{ type: "field_input", name: "WHAT", text: "my best score" }],
    previousStatement: BODY,
    nextStatement: BODY,
    style: STYLE("green"),
    tooltip: "Something that should still be there next time you visit.",
    helpUrl: "",
  },
  {
    type: BLOCK.proof,
    message0: "🔍 Check that %1",
    args0: [
      {
        type: "field_input",
        name: "CHECK",
        text: "the player moves when I press a key",
      },
    ],
    // Proof-typed connections only: this block fits inside a Feature or a
    // When/Then, and nowhere else.
    previousStatement: PROOF,
    nextStatement: PROOF,
    style: STYLE("amber"),
    tooltip: "How we know it really works. This becomes a real test.",
    helpUrl: "",
  },
  {
    type: BLOCK.style,
    message0: "🎨 Make it look %1",
    args0: [
      { type: "field_dropdown", name: "VISUAL", options: VISUAL_CHOICES },
    ],
    message1: "and feel %1",
    args1: [{ type: "field_input", name: "PERSONALITY", text: "friendly" }],
    previousStatement: BODY,
    nextStatement: BODY,
    style: STYLE("purple"),
    tooltip: "Pick the mood. Same project, totally different feeling.",
    helpUrl: "",
  },
  {
    type: BLOCK.rule,
    message0: "🧠 My rule %1",
    args0: [{ type: "field_input", name: "NAME", text: "Keep it kind" }],
    message1: "always %1",
    args1: [
      {
        type: "field_input",
        name: "PROMPT",
        text: "use friendly words everywhere",
      },
    ],
    previousStatement: BODY,
    nextStatement: BODY,
    style: STYLE("purple"),
    tooltip: "An instruction your helpers follow the whole time.",
    helpUrl: "",
  },
  {
    type: BLOCK.part,
    message0: "🔌 It has a %1",
    args0: [
      {
        type: "field_dropdown",
        name: "PART",
        options: [
          ["light (LED)", "LED"],
          ["button", "button"],
          ["buzzer", "buzzer"],
          ["temperature sensor", "temperature sensor"],
          ["light sensor", "light sensor"],
          ["distance sensor", "distance sensor"],
          ["motion sensor", "motion sensor"],
          ["dial (potentiometer)", "potentiometer"],
          ["servo motor", "servo"],
        ],
      },
    ],
    message1: "on pin %1",
    args1: [{ type: "field_input", name: "PIN", text: "13" }],
    previousStatement: BODY,
    nextStatement: BODY,
    style: STYLE("teal"),
    tooltip:
      "Something wired to your board. Copy the pin number printed next to it.",
    helpUrl: "",
  },
  {
    type: BLOCK.show,
    message0: "🚀 Show it in my browser",
    previousStatement: BODY,
    // No nextStatement: this is the end of the stack.
    style: STYLE("red"),
    tooltip: "Build it and open it so you can try it.",
    helpUrl: "",
  },
]

let registered = false

/**
 * How many characters a field shows on the brick.
 *
 * Blockly grows a block horizontally to fit its text with no wrapping, and
 * children type sentences — "move left and right with the arrow keys" would make
 * a brick wider than the screen. Truncating the *display* keeps bricks brick-
 * shaped; the full value is still stored, still sent to the agents, and still
 * shown in full the moment the field is opened for editing.
 */
const FIELD_DISPLAY_CHARS = 30

/** Register the block set exactly once, even across fast-refresh reloads. */
export function registerBlocks(): void {
  if (registered) return
  Blockly.Field.prototype.maxDisplayLength = FIELD_DISPLAY_CHARS
  Blockly.defineBlocksWithJsonArray(BLOCK_JSON)
  registered = true
}

/**
 * One Blockly block style per brick colour.
 *
 * The cap goes on blue and only blue, which is the Goal brick — the one block
 * with nothing above it. A theme-wide `startHats` would put a cap on every brick
 * and destroy exactly the signal it is there to give.
 */
const blockStyles = Object.fromEntries(
  Object.entries(BRICK).map(([name, brick]) => [
    STYLE(name as BrickColour),
    {
      colourPrimary: brick.fill,
      colourSecondary: brick.fill,
      colourTertiary: brick.edge,
      ...(name === "blue" ? { hat: "cap" } : {}),
    },
  ])
)

const THEME_NAME = "lamine-bricks"

const THEME_CONFIG = {
  name: THEME_NAME,
  base: Blockly.Themes.Classic,
  blockStyles,
  componentStyles: {
    // The studio draws the studded plate-grid behind the canvas, so Blockly's own
    // background stays out of the way.
    workspaceBackgroundColour: "transparent",
    scrollbarColour: "#c3cddc",
    scrollbarOpacity: 1,
    insertionMarkerColour: "#16202e",
    insertionMarkerOpacity: 0.4,
    markerColour: BRICK.blue.fill,
    cursorColour: BRICK.blue.fill,
  },
  fontStyle: {
    family: "var(--font-outfit), system-ui, sans-serif",
    weight: "600",
    size: 12,
  },
}

/**
 * defineTheme registers the theme under its name, and registering the same name
 * twice can throw - which fast refresh causes by re-running this module. A throw
 * here would leave the canvas showing Blockly's default colours with no obvious
 * cause, so the retry registers the identical theme under a fresh name.
 */
function defineLamineTheme(): Blockly.Theme {
  try {
    return Blockly.Theme.defineTheme(THEME_NAME, THEME_CONFIG)
  } catch {
    return Blockly.Theme.defineTheme(
      `${THEME_NAME}-${Date.now()}`,
      THEME_CONFIG
    )
  }
}

export const lamineTheme = defineLamineTheme()

/* ════════════════════════════════════════════════════════════════════════
   Field labels
   ════════════════════════════════════════════════════════════════════════ */

/**
 * What each field is called in the editor panel, in the child's words.
 *
 * The brick itself shows a shortened value so it stays brick-shaped; the panel is
 * where the whole thing is read and written. Without these, the panel would have
 * to show raw field names like `WHAT` and `THEN`.
 */
export const FIELD_LABELS: Record<string, Record<string, string>> = {
  [BLOCK.goal]: {
    KIND: "What kind of thing is it?",
    GOAL: "What is it about?",
    FRAMEWORK: "How should it be drawn?",
  },
  [BLOCK.like]: { EXAMPLE: "Which one is it like?" },
  [BLOCK.feature]: { WHAT: "What must it do?" },
  [BLOCK.whenThen]: { WHEN: "When this happens…", THEN: "…then do this" },
  [BLOCK.remembers]: { WHAT: "What should it remember?" },
  [BLOCK.part]: { PART: "What is wired up?", PIN: "Which pin is it on?" },
  [BLOCK.proof]: { CHECK: "How will we know it works?" },
  [BLOCK.style]: {
    VISUAL: "How should it look?",
    PERSONALITY: "How should it feel?",
  },
  [BLOCK.rule]: {
    NAME: "Name your rule",
    PROMPT: "What should your helpers always do?",
  },
}

/**
 * Fields a child writes sentences into. These get a real textarea in the editor
 * panel rather than a single-line box — a Proof like "the ship stops at the edge
 * of the screen and the score stays the same" does not belong in an input.
 */
export const LONG_FIELDS: Record<string, readonly string[]> = {
  [BLOCK.goal]: ["GOAL"],
  [BLOCK.feature]: ["WHAT"],
  [BLOCK.whenThen]: ["WHEN", "THEN"],
  [BLOCK.remembers]: ["WHAT"],
  [BLOCK.proof]: ["CHECK"],
  [BLOCK.rule]: ["PROMPT"],
}

export function fieldLabel(blockType: string, fieldName: string): string {
  return FIELD_LABELS[blockType]?.[fieldName] ?? fieldName.toLowerCase()
}

export function isLongField(blockType: string, fieldName: string): boolean {
  return (LONG_FIELDS[blockType] ?? []).includes(fieldName)
}

/** The human name of a brick, for the editor panel's heading. */
export function brickLabel(blockType: string): string {
  for (const group of TRAY) {
    const found = group.bricks.find((b) => b.type === blockType)
    if (found) return found.label
  }
  return "Brick"
}

/* ════════════════════════════════════════════════════════════════════════
   The tray
   ════════════════════════════════════════════════════════════════════════ */

export interface TrayBrick {
  type: string
  label: string
  hint: string
  colour: BrickColour
}

export interface TrayGroup {
  name: string
  bricks: TrayBrick[]
}

/**
 * The palette, as data.
 *
 * Blockly's own toolbox is switched off in favour of this: children tap a brick
 * and it snaps onto the end of their stack. Tapping beats dragging out of a
 * flyout on a laptop trackpad, and it makes the whole palette keyboard- and
 * touch-reachable without any extra work.
 */
export const TRAY: TrayGroup[] = [
  {
    name: "Start",
    bricks: [
      {
        type: BLOCK.goal,
        label: "Make a…",
        hint: "What you want to build",
        colour: "blue",
      },
      {
        type: BLOCK.like,
        label: "Make it like…",
        hint: "Start from an example",
        colour: "teal",
      },
    ],
  },
  {
    name: "Must do",
    bricks: [
      {
        type: BLOCK.feature,
        label: "It must…",
        hint: "Something it has to do",
        colour: "green",
      },
      {
        type: BLOCK.whenThen,
        label: "When… then…",
        hint: "A rule that fires",
        colour: "green",
      },
      {
        type: BLOCK.remembers,
        label: "It remembers…",
        hint: "Keep it for next time",
        colour: "green",
      },
    ],
  },
  {
    name: "Proof",
    bricks: [
      {
        type: BLOCK.proof,
        label: "Check that…",
        hint: "Becomes a real test. Goes inside a promise.",
        colour: "amber",
      },
    ],
  },
  {
    name: "Look & rules",
    bricks: [
      {
        type: BLOCK.style,
        label: "Make it look…",
        hint: "Pick the mood",
        colour: "purple",
      },
      {
        type: BLOCK.rule,
        label: "My rule…",
        hint: "Your helpers always follow it",
        colour: "purple",
      },
    ],
  },
  {
    name: "Wired up",
    bricks: [
      {
        type: BLOCK.part,
        label: "It has a…",
        hint: "A light, button or sensor on a pin. For board projects.",
        colour: "teal",
      },
    ],
  },
  {
    name: "Finish",
    bricks: [
      {
        type: BLOCK.show,
        label: "Show it!",
        hint: "Ends the stack",
        colour: "red",
      },
    ],
  },
]
