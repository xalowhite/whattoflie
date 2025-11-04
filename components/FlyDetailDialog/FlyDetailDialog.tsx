'use client'
import React from 'react'

export type FlyDetailData = {
  id: string
  name: string
  category?: string | null
}

type Props = {
  open?: boolean
  onOpenChange?: (v: boolean) => void
  data?: FlyDetailData | null
}

/**
 * Minimal placeholder to unblock the build.
 * It safely renders nothing until you wire your real UI back in.
 */
export default function FlyDetailDialog(_props: Props) {
  return null
}
