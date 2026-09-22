/**
 * Anonymous identity. No sign-up, no login, no ID for the kid to type.
 *
 * A random UUID in localStorage is the whole system. It is a *convenience*,
 * not a security boundary — see `lib/storage.ts` for the per-project secret
 * that actually gates access.
 */

const OWNER_KEY = "lamine:ownerId"

function hasStorage(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage
  } catch {
    // Safari in private mode throws on access rather than returning null.
    return false
  }
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID()
  // Older browsers: good enough for an anonymous local handle.
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * The stable anonymous id for this browser. Returns null on the server so
 * callers are forced to handle SSR rather than getting a bogus value.
 */
export function getOwnerId(): string | null {
  if (!hasStorage()) return null
  let id = window.localStorage.getItem(OWNER_KEY)
  if (!id) {
    id = randomId()
    window.localStorage.setItem(OWNER_KEY, id)
  }
  return id
}

export { randomId }
