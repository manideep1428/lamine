import type { Metadata } from "next"

import { Studio } from "@/components/studio/Studio"

export const metadata: Metadata = {
  title: "Lamine — studio",
}

/**
 * In this version of Next, a dynamic route's `params` is a Promise and has to be
 * awaited. The studio itself is a client component: it needs localStorage for the
 * project's capability key, which only exists in the browser.
 */
export default async function StudioPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  return <Studio projectId={projectId} />
}
