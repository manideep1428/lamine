"use client"

import { ConvexProvider, ConvexReactClient } from "convex/react"
import type { ReactNode } from "react"

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL

/**
 * Created once at module scope. If the URL is missing we render children
 * without a provider rather than crashing the whole app — the studio surfaces
 * a clear "backend not configured" state instead of a blank screen.
 */
const client = convexUrl ? new ConvexReactClient(convexUrl) : null

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!client) return <>{children}</>
  return <ConvexProvider client={client}>{children}</ConvexProvider>
}

export const isConvexConfigured = Boolean(convexUrl)
