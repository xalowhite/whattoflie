'use client'
import React from 'react'

export type FlyDetailData = globalThis.FlyDetailData

type Props = {
  open?: boolean
  onOpenChange?: (v: boolean) => void
  fly?: FlyDetailData | null
}

/** Minimal placeholder to unblock build; replace with real UI later */
export default function FlyDetailsDialog(_props: Props) {
  return null
}
