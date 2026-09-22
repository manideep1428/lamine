// @vitest-environment jsdom
import * as Blockly from "blockly/core"
import { beforeAll, describe, expect, it } from "vitest"

import { BLOCK_COLOUR, BRICK, lamineTheme, registerBlocks } from "./definitions"
import { BLOCK } from "@/lib/core/blocks"

beforeAll(() => registerBlocks())

/**
 * The theme is only useful if Blockly can resolve each block's style name. A typo
 * does not throw � Blockly logs a warning and silently falls back to a default
 * colour, which is exactly the "blocks ignoring the theme" failure this catches.
 */
describe("theme", () => {
  it("resolves a brick style for every block, with the right fill and lip", () => {
    for (const [type, colour] of Object.entries(BLOCK_COLOUR)) {
      const style = lamineTheme.blockStyles[`brick_${colour}`]
      expect(style, `no style registered for ${type}`).toBeDefined()
      expect(style.colourPrimary).toBe(BRICK[colour].fill)
      expect(style.colourTertiary).toBe(BRICK[colour].edge)
    }
  })

  it("caps only the Goal brick's colour", () => {
    // The base Classic theme brings its own capped style along; only ours matter.
    const cappedBricks = Object.entries(lamineTheme.blockStyles)
      .filter(([name]) => name.startsWith("brick_"))
      .filter(([, style]) => (style as { hat?: string }).hat === "cap")
      .map(([name]) => name)
    expect(cappedBricks).toEqual([`brick_${BLOCK_COLOUR[BLOCK.goal]}`])
  })

  it("declares a style on every block that the theme actually defines", () => {
    const workspace = new Blockly.Workspace()
    for (const type of Object.values(BLOCK)) {
      const name = workspace.newBlock(type).getStyleName()
      expect(name, `${type} declares no style`).toMatch(/^brick_/)
      expect(
        lamineTheme.blockStyles[name],
        `${type} uses undefined style ${name}`
      ).toBeDefined()
    }
  })

  it("keeps white text legible on every brick", () => {
    // Blockly paints all block text one colour, so each fill has to carry white.
    for (const [name, brick] of Object.entries(BRICK)) {
      expect(
        contrastWithWhite(brick.fill),
        `${name} is too light for white text`
      ).toBeGreaterThan(4.5)
    }
  })
})

/** WCAG relative luminance contrast against #fff. */
function contrastWithWhite(hex: string): number {
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const r = channel(parseInt(hex.slice(1, 3), 16))
  const g = channel(parseInt(hex.slice(3, 5), 16))
  const b = channel(parseInt(hex.slice(5, 7), 16))
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return 1.05 / (luminance + 0.05)
}
