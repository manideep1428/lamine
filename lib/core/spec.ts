/**
 * NuggetSpec — the contract between the kid's blocks and the build agents.
 *
 * Every string and array is capped, because this data is
 * written by a child and then interpolated into agent prompts.
 *
 * Pure module. No Convex, no Blockly, no DOM — importable from anywhere.
 */

import { z } from "zod"

/* ── Caps ────────────────────────────────────────────────────────────────
   Over-cap input is clamped and reported as a warning rather than rejected.
   A kid should never see a validation error because they typed too much. */
export const CAPS = {
  goal: 500,
  description: 2000,
  requirement: 500,
  behavior: 300,
  dataNote: 200,
  skillName: 100,
  skillPrompt: 5000,
  styleValue: 60,
  partName: 40,
  pin: 12,
  requirements: 30,
  behaviors: 30,
  data: 10,
  skills: 10,
  parts: 10,
} as const

export const PROJECT_KINDS = ["game", "website", "device"] as const
export const FRAMEWORKS = ["canvas", "phaser", "p5", "arduino", "none"] as const
export const VISUAL_STYLES = [
  "retro",
  "pastel",
  "clean",
  "neon",
  "nature",
] as const

export type ProjectKind = (typeof PROJECT_KINDS)[number]
export type Framework = (typeof FRAMEWORKS)[number]

/**
 * Something physically wired to the board.
 *
 * Only meaningful when `nugget.kind` is `device`. The pin stays a string because
 * boards label them `13`, `A0`, `GPIO4` and `D2`, and a child copies whatever is
 * printed next to the socket rather than a number we can validate.
 */
export const PartSchema = z.strictObject({
  part: z.string().min(1).max(CAPS.partName),
  pin: z.string().max(CAPS.pin),
})

export const BehavioralTestSchema = z.strictObject({
  id: z.string().max(64),
  when: z.string().min(1).max(CAPS.behavior),
  then: z.string().min(1).max(CAPS.behavior),
  /** Which requirement this proves, when the kid nested it inside one. */
  requirementId: z.string().max(64).optional(),
})

export const RequirementSchema = z.strictObject({
  id: z.string().max(64),
  description: z.string().min(1).max(CAPS.requirement),
})

export const SkillSchema = z.strictObject({
  name: z.string().min(1).max(CAPS.skillName),
  prompt: z.string().min(1).max(CAPS.skillPrompt),
})

export const NuggetSpecSchema = z.strictObject({
  nugget: z.strictObject({
    goal: z.string().min(1).max(CAPS.goal),
    kind: z.enum(PROJECT_KINDS),
    description: z.string().max(CAPS.description).optional(),
  }),
  framework: z.enum(FRAMEWORKS),
  /** "Make it like Space Dodge" — a scaffolding hint for the planner. */
  basedOn: z.string().max(CAPS.skillName).optional(),
  style: z
    .strictObject({
      visual: z.string().max(CAPS.styleValue),
      personality: z.string().max(CAPS.styleValue).optional(),
    })
    .optional(),
  requirements: z.array(RequirementSchema).max(CAPS.requirements),
  behavioralTests: z.array(BehavioralTestSchema).max(CAPS.behaviors),
  /** Things the project should remember between visits (high score, name). */
  data: z.array(z.string().max(CAPS.dataNote)).max(CAPS.data),
  /**
   * What is wired to the board, for a `device` project. Defaults to empty so a
   * project saved before devices existed still validates.
   */
  parts: z.array(PartSchema).max(CAPS.parts).default([]),
  skills: z.array(SkillSchema).max(CAPS.skills),
  deploy: z.strictObject({ target: z.literal("web") }),
})

export type NuggetSpec = z.infer<typeof NuggetSpecSchema>
export type BehavioralTest = z.infer<typeof BehavioralTestSchema>
export type Requirement = z.infer<typeof RequirementSchema>
export type Part = z.infer<typeof PartSchema>

/** A warning is a nudge shown in the UI, never a blocker. */
export interface SpecWarning {
  field: string
  message: string
}

/** The loose shape the block interpreter produces, before clamping. */
export interface SpecDraft {
  nugget: { goal: string; kind: ProjectKind; description?: string }
  framework: Framework
  basedOn?: string
  style?: { visual: string; personality?: string }
  requirements: Requirement[]
  behavioralTests: BehavioralTest[]
  data: string[]
  /** Optional so every existing caller keeps compiling; a device project sets it. */
  parts?: Part[]
  skills: { name: string; prompt: string }[]
}

function clampText(
  value: string,
  max: number,
  field: string,
  warnings: SpecWarning[]
): string {
  const trimmed = value.trim()
  if (trimmed.length <= max) return trimmed
  warnings.push({
    field,
    message: `That's a long one — I used the first ${max} characters.`,
  })
  return trimmed.slice(0, max)
}

function clampList<T>(
  items: T[],
  max: number,
  field: string,
  label: string,
  warnings: SpecWarning[]
): T[] {
  if (items.length <= max) return items
  warnings.push({
    field,
    message: `You added ${items.length} ${label}. I'll build the first ${max}.`,
  })
  return items.slice(0, max)
}

/**
 * Clamp a draft to the caps, then validate. Returns the spec plus any warnings.
 *
 * Throws only if the draft is structurally impossible (e.g. no goal at all),
 * which the interpreter prevents by construction — the Goal block is required.
 */
export function finalizeSpec(draft: SpecDraft): {
  spec: NuggetSpec
  warnings: SpecWarning[]
} {
  const warnings: SpecWarning[] = []

  const requirements = clampList(
    draft.requirements,
    CAPS.requirements,
    "requirements",
    "things it must do",
    warnings
  ).map((r) => ({
    id: r.id,
    description: clampText(
      r.description,
      CAPS.requirement,
      "requirement",
      warnings
    ),
  }))

  const requirementIds = new Set(requirements.map((r) => r.id))

  const behavioralTests = clampList(
    draft.behavioralTests,
    CAPS.behaviors,
    "behavioralTests",
    "checks",
    warnings
  ).map((b) => ({
    id: b.id,
    when: clampText(b.when, CAPS.behavior, "check.when", warnings),
    then: clampText(b.then, CAPS.behavior, "check.then", warnings),
    // Drop a dangling parent reference rather than shipping a broken link.
    ...(b.requirementId && requirementIds.has(b.requirementId)
      ? { requirementId: b.requirementId }
      : {}),
  }))

  const candidate = {
    nugget: {
      goal: clampText(draft.nugget.goal, CAPS.goal, "goal", warnings),
      kind: draft.nugget.kind,
      ...(draft.nugget.description
        ? {
            description: clampText(
              draft.nugget.description,
              CAPS.description,
              "description",
              warnings
            ),
          }
        : {}),
    },
    framework: draft.framework,
    ...(draft.basedOn
      ? {
          basedOn: clampText(
            draft.basedOn,
            CAPS.skillName,
            "basedOn",
            warnings
          ),
        }
      : {}),
    ...(draft.style
      ? {
          style: {
            visual: clampText(
              draft.style.visual,
              CAPS.styleValue,
              "style.visual",
              warnings
            ),
            ...(draft.style.personality
              ? {
                  personality: clampText(
                    draft.style.personality,
                    CAPS.styleValue,
                    "style.personality",
                    warnings
                  ),
                }
              : {}),
          },
        }
      : {}),
    requirements,
    behavioralTests,
    data: clampList(
      draft.data,
      CAPS.data,
      "data",
      "things to remember",
      warnings
    ).map((d) => clampText(d, CAPS.dataNote, "data", warnings)),
    parts: clampList(
      draft.parts ?? [],
      CAPS.parts,
      "parts",
      "parts",
      warnings
    ).map((p) => ({
      part: clampText(p.part, CAPS.partName, "part", warnings),
      pin: clampText(p.pin, CAPS.pin, "part.pin", warnings),
    })),
    skills: clampList(
      draft.skills,
      CAPS.skills,
      "skills",
      "instructions",
      warnings
    ).map((s) => ({
      name: clampText(s.name, CAPS.skillName, "skill.name", warnings),
      prompt: clampText(s.prompt, CAPS.skillPrompt, "skill.prompt", warnings),
    })),
    deploy: { target: "web" as const },
  }

  return { spec: NuggetSpecSchema.parse(candidate), warnings }
}

/**
 * Is this spec complete enough to build? Used to enable the GO button and to
 * tell the kid what's missing, in their words.
 */
export function readiness(spec: NuggetSpec | null): {
  ready: boolean
  reasons: string[]
} {
  if (!spec) return { ready: false, reasons: ["Add a Goal block to start."] }

  const reasons: string[] = []
  if (!spec.nugget.goal)
    reasons.push("Tell me what you want to make in the Goal block.")
  if (spec.requirements.length === 0 && spec.behavioralTests.length === 0) {
    reasons.push("Add at least one 'It must…' block so I know what to build.")
  }
  // A board with nothing wired to it has no way to do anything.
  if (spec.nugget.kind === "device" && spec.parts.length === 0) {
    reasons.push(
      "Add a 🔌 part block so I know what's plugged into your board."
    )
  }
  return { ready: reasons.length === 0, reasons }
}
