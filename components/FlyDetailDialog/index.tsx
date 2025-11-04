// components/FlyDetailDialog/index.tsx
'use client'
import React from 'react'

export type FlyDetailData = globalThis.FlyDetailData

type Props = {
  open?: boolean
  onOpenChange?: (v: boolean) => void
  fly?: FlyDetailData | null
}

/** Minimal placeholder to unblock build; replace with real UI later */
export default function FlyDetailDialog(_props: Props) {
  return null
}
