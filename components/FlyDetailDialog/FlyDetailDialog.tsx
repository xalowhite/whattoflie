'use client'
import React from 'react'

type Props = {
  open?: boolean
  onOpenChange?: (v: boolean) => void
  // Match your current usage in app/compendium/page.tsx
  fly?: FlyDetailData | null
}

/**
 * Minimal placeholder to unblock the build.
 * Safely renders nothing until your real UI is restored.
 */
export default function FlyDetailDialog(_props: Props) {
  return null
}
