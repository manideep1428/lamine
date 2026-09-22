"use client"

/**
 * The mark in the top-left.
 *
 * A placeholder until a real logo lands: three stacked bricks, which is the
 * product in one glyph. Drop a `public/logo.svg` in and swap the body of this
 * component for an `<img src="/logo.svg" />` — everything else refers to `<Logo />`
 * so nothing else has to change.
 *
 * Deliberately not the word "lamine": the wordmark competed with the project name
 * right beside it, and two pieces of bold display type next to each other read as
 * one confusing title.
 */
export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="lamine"
      fill="none"
    >
      {/* Three bricks, stacked and offset, in the palette's own colours. */}
      <rect
        x="4"
        y="5"
        width="24"
        height="7"
        rx="2"
        fill="var(--color-brick-blue)"
      />
      <rect
        x="7"
        y="13.5"
        width="21"
        height="7"
        rx="2"
        fill="var(--color-brick-green)"
      />
      <rect
        x="4"
        y="22"
        width="17"
        height="7"
        rx="2"
        fill="var(--color-brick-red)"
      />
    </svg>
  )
}
