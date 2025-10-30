'use client'

import { useMemo } from 'react'
import { X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type FlySource = 'global' | 'user'

interface MaterialRow {
  required: boolean
  name: string
  color: string | null
}

interface TutorialRow {
  url: string
  title: string
  tutorial_type: string
}

export interface FlyDetailData {
  id: string
  source: FlySource
  name: string
  category: string
  difficulty: string | null
  sizes: (number | string)[] | null
  image_url?: string | null
  target_species?: string[] | null
  colorways?: string[] | null
  materials: MaterialRow[]
  tutorials: TutorialRow[]
}

export default function FlyDetailDialog({
  open,
  onOpenChange,
  fly,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  fly: FlyDetailData | null
}) {
  const title = fly?.name ?? 'Fly details'
  const sizesText = useMemo(
    () => (fly?.sizes?.length ? fly.sizes.join(', ') : '—'),
    [fly?.sizes]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b bg-background">
          <DialogHeader className="px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="truncate">{title}</DialogTitle>
              <Button size="icon" variant="ghost" onClick={() => onOpenChange(false)} aria-label="Close">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">{fly?.category ?? '—'}</Badge>
              {fly?.difficulty ? <Badge variant="outline">{fly.difficulty}</Badge> : null}
              <span>Sizes: {sizesText}</span>
            </div>
          </DialogHeader>
        </div>

        {/* Body */}
        <div className="max-h-[85vh] overflow-y-auto px-5 py-4" tabIndex={0} style={{ overscrollBehavior: 'contain' }}>
          <Tabs defaultValue="materials" className="w-full">
            <TabsList className="mb-3">
              <TabsTrigger value="materials">Materials</TabsTrigger>
              <TabsTrigger value="tutorials">Tutorials</TabsTrigger>
              <TabsTrigger value="info">Info</TabsTrigger>
            </TabsList>

            <TabsContent value="materials">
              <div className="space-y-2">
                {fly?.materials?.length ? (
                  fly.materials.map((m, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{m.name}</div>
                        <div className="text-sm text-muted-foreground">{m.color ?? '—'}</div>
                      </div>
                      {m.required ? (
                        <Badge className="shrink-0">Required</Badge>
                      ) : (
                        <Badge variant="outline" className="shrink-0">Optional</Badge>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No materials listed.</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="tutorials">
              <div className="space-y-2">
                {fly?.tutorials?.length ? (
                  fly.tutorials.map((t, idx) => (
                    <a
                      key={idx}
                      href={t.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-md border px-3 py-2 hover:bg-accent"
                    >
                      <div className="font-medium">{t.title}</div>
                      <div className="text-sm text-muted-foreground">{t.tutorial_type}</div>
                    </a>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No tutorials listed.</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="info">
              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-sm font-medium">Target species</div>
                  <div className="text-sm text-muted-foreground">
                    {fly?.target_species?.length ? fly.target_species.join(', ') : '—'}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-sm font-medium">Colorways</div>
                  <div className="text-sm text-muted-foreground">
                    {fly?.colorways?.length ? fly.colorways.join(', ') : '—'}
                  </div>
                </div>
                {fly?.image_url ? (
                  <div className="rounded-lg border p-2">
                    <img
                      src={fly.image_url}
                      alt={fly.name}
                      className="mx-auto max-h-[360px] w-auto rounded-md object-contain"
                      draggable={false}
                    />
                  </div>
                ) : null}
              </div>
            </TabsContent>
          </Tabs>
          <div className="h-2" />
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-10 border-t bg-background px-5 py-3">
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
