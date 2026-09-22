"use client"

/**
 * The `lego` Blockly renderer.
 *
 * Built on Zelos rather than Blockly's default (geras) for one specific reason:
 * Zelos's notch is already a wide rounded bump rather than a jigsaw tab, which is
 * what a brick stud looks like. This file re-proportions it into a moulded brick.
 *
 * THE ORDERING TRAP, which cost a round of broken layout: `init()` does two jobs.
 * It sets the numeric constants, and then it *generates SVG path objects from
 * them* (`this.NOTCH = this.makeNotch()`, and the same for corners and the hat).
 * Changing a number after `super.init()` therefore leaves the drawn outline at
 * the old size while the layout maths uses the new one — bricks whose text and
 * fields sit outside their own edges. So every number is set first, and anything
 * derived from a number is explicitly rebuilt afterwards.
 *
 * Nothing here touches connection logic. Types, checks and serialization are
 * untouched, which is why the block tests keep passing — they run on a headless
 * workspace that has no renderer at all.
 */

import * as Blockly from "blockly/core"

export const LEGO_RENDERER = "lego"

/**
 * These two must match `--color-ink` and the brick text colour in
 * `app/globals.css`. Blockly's generated stylesheet cannot read CSS custom
 * properties reliably (it is built as a string before the variables resolve), so
 * the values are duplicated here rather than referenced.
 */
const TILE_INK = "#16202e"
const LABEL_INK = "#ffffff"

class LegoConstantProvider extends Blockly.zelos.ConstantProvider {
  override init(): void {
    // Zelos derives its geometry from GRID_UNIT, so this goes first.
    this.GRID_UNIT = 5

    super.init()

    /* ── numbers ── */

    // Bricks are moulded, not pill-shaped. Zelos rounds corners to half the
    // block height; pulling that back is most of what makes it read as plastic.
    this.CORNER_RADIUS = 8

    // A wide, shallow stud: closer to a 1x4 plate than to a jigsaw tab.
    this.NOTCH_WIDTH = 9 * this.GRID_UNIT
    this.NOTCH_HEIGHT = 2 * this.GRID_UNIT
    this.NOTCH_OFFSET_LEFT = 4 * this.GRID_UNIT

    // Tall enough to breathe, short enough that a stack of six fits on screen.
    this.MIN_BLOCK_HEIGHT = 9 * this.GRID_UNIT
    this.MEDIUM_PADDING = 2.4 * this.GRID_UNIT
    this.SMALL_PADDING = 1.6 * this.GRID_UNIT

    // The C-clamp that holds Proof bricks. Deeper than Zelos's default so the
    // nesting is obvious at a glance.
    this.STATEMENT_INPUT_PADDING_LEFT = 5 * this.GRID_UNIT
    this.EMPTY_STATEMENT_INPUT_HEIGHT = 7 * this.GRID_UNIT

    // The Goal brick wears a cap, set per-style in definitions.ts. Switching hats
    // on globally here would cap every brick and lose the signal.
    this.START_HAT_HEIGHT = 3 * this.GRID_UNIT
    this.START_HAT_WIDTH = 18 * this.GRID_UNIT

    /* ── printed text, not painted text ──
       Zelos draws editable fields directly on the block colour. That is
       unreadable on a light brick and looks like a mistake on a dark one. A white
       rounded rect with dark text reads like text printed on a tile, and it makes
       it obvious which parts a child can actually type into. */
    this.FULL_BLOCK_FIELDS = false
    this.FIELD_BORDER_RECT_RADIUS = 6
    this.FIELD_BORDER_RECT_COLOUR = "#ffffff"
    this.FIELD_TEXT_FONTSIZE = 11.5
    this.FIELD_TEXT_FONTWEIGHT = "600"
    this.FIELD_DROPDOWN_NO_BORDER_RECT_SHADOW = true
    this.FIELD_DROPDOWN_COLOURED_DIV = false
    // Zelos draws the dropdown arrow as a baked-in white SVG image, designed for
    // fields painted on the block colour. On a white tile it is invisible and CSS
    // cannot recolour an image. The text arrow inherits the field's dark fill.
    this.FIELD_DROPDOWN_SVG_ARROW = false

    // Selection reads as a hard outline on the brick rather than a soft halo.
    this.SELECTED_GLOW_COLOUR = "#16202e"
    this.SELECTED_GLOW_SIZE = 0.75

    /* ── rebuild everything generated from the numbers above ── */
    this.NOTCH = this.makeNotch()
    this.INSIDE_CORNERS = this.makeInsideCorners()
    this.OUTSIDE_CORNERS = this.makeOutsideCorners()
    this.PUZZLE_TAB = this.makePuzzleTab()
    this.START_HAT = this.makeStartHat()
    this.JAGGED_TEETH = this.makeJaggedTeeth()
  }

  /**
   * Correct the stylesheet Blockly generates for itself.
   *
   * This is not a preference — it is the only place these two rules can be fixed.
   * The renderer emits its CSS into the document at `inject()` time, i.e. after
   * the app's stylesheet, and among the rules are:
   *
   *     .blocklyDropdownText                        { fill: #fff !important }
   *     .blocklyDropDownDiv .blocklyMenuItemContent { color: #fff }
   *
   * The first outranks anything written in `globals.css` on `!important` plus
   * specificity. The second sets the colour on the *child* of `.blocklyMenuItem`,
   * so a rule on the parent never reaches it. Both assume Zelos's fields are
   * painted on the block colour; ours sit on white tiles, so white text is
   * invisible — an empty-looking dropdown and an unreadable options list.
   *
   * Appending here puts the corrections last in Blockly's own sheet, at matching
   * specificity, which is a fight that can actually be won.
   */
  // Public, not protected: Zelos widens this from the base class, and narrowing it
  // back is a type error.
  override getCSS_(selector: string): string[] {
    return [
      ...super.getCSS_(selector),

      // What a child can change: dark text on its white tile.
      `${selector} .blocklyDropdownText,`,
      `${selector} .blocklyEditableField>text,`,
      `${selector} .blocklyEditableField>g>text {`,
      `fill: ${TILE_INK} !important;`,
      `}`,

      // The options list, which lives outside the injection div.
      `${selector}.blocklyDropDownDiv .blocklyMenuItemContent,`,
      `${selector}.blocklyWidgetDiv .blocklyMenuItemContent {`,
      `color: ${TILE_INK} !important;`,
      `}`,

      // Printed labels stay white, because they sit on the brick itself.
      `${selector} .blocklyNonEditableField>text,`,
      `${selector} .blocklyNonEditableField>g>text {`,
      `fill: ${LABEL_INK} !important;`,
      `}`,

      // The input that appears over the tile while typing.
      `${selector} .blocklyHtmlInput {`,
      `color: ${TILE_INK};`,
      `}`,
    ]
  }
}

class LegoRenderer extends Blockly.zelos.Renderer {
  protected override makeConstants_(): Blockly.zelos.ConstantProvider {
    return new LegoConstantProvider()
  }
}
let registered = false

/** Register the renderer once, even across fast-refresh reloads. */
export function registerLegoRenderer(): void {
  if (registered) return
  try {
    Blockly.blockRendering.register(LEGO_RENDERER, LegoRenderer)
  } catch {
    // Already registered by a previous module instance. Harmless.
  }
  registered = true
}
