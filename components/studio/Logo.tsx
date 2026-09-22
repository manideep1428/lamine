import Image from "next/image"

/**
 * The mark.
 *
 * The supplied artwork is a JPEG, so it carries a white box rather than
 * transparency. `mix-blend-mode: multiply` makes that white read as the page
 * underneath, which keeps the mark clean on both the paper and the sunken
 * surfaces without needing the background cut out.
 */
export function Logo({
  className = "size-9",
  priority = false,
}: {
  className?: string
  priority?: boolean
}) {
  return (
    <Image
      src="/logo.png"
      alt=""
      width={512}
      height={512}
      priority={priority}
      className={`${className} mix-blend-multiply`}
    />
  )
}
