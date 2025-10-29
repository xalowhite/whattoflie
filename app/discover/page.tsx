'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Check, Plus, ShoppingCart, Upload, Image as ImageIcon } from 'lucide-react'

type TieRow = {
  user_fly_id: string
  name: string
  required_total: number
  required_have: number
  required_missing: number
  missing_names: string | null
  missing_ids: string[] | null
  tieable: boolean
}

type FlyMeta = {
  id: string
  image_url: string | null
  category: string | null
  difficulty: string | null
}

export default function DiscoverPage() {
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<TieRow[]>([])
  const [meta, setMeta] = useState<Record<string, FlyMeta>>({})
  const [adding, setAdding] = useState<Record<string, boolean>>({}) // materialId -> busy
  const [bulkAdding, setBulkAdding] = useState<Record<string, boolean>>({}) // flyId -> busy
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!user) {
      setRows([])
      setMeta({})
      setLoading(false)
      return
    }
    void reload()
  }, [user])

  async function reload() {
    try {
      setLoading(true)
      setError(null)

      // 1) Tieability from the view
      const { data: tieData, error: tErr } = await supabase
        .from('v_tieability_user_flies')
        .select('user_fly_id, name, required_total, required_have, required_missing, missing_names, missing_ids, tieable')
        .order('tieable', { ascending: false })
        .order('required_missing', { ascending: true })
      if (tErr) throw tErr
      setRows((tieData ?? []) as TieRow[])

      // 2) Minimal meta (image_url & a few tags)
      const ids = (tieData ?? []).map((r: any) => r.user_fly_id)
      if (ids.length) {
        const { data: uf, error: ufErr } = await supabase
          .from('user_flies')
          .select('id, image_url, category, difficulty')
          .in('id', ids)
        if (ufErr) throw ufErr
        const map: Record<string, FlyMeta> = {}
        for (const r of uf ?? []) {
          map[r.id] = {
            id: r.id,
            image_url: r.image_url ?? null,
            category: r.category ?? null,
            difficulty: r.difficulty ?? null,
          }
        }
        setMeta(map)
      } else {
        setMeta({})
      }
    } catch (e: any) {
      console.error('Discover reload failed:', e)
      setError(e?.message ?? 'Failed to load data.')
    } finally {
      setLoading(false)
    }
  }

  async function addMaterial(materialId: string) {
    if (!user || !materialId) return
    setAdding(a => ({ ...a, [materialId]: true }))
    try {
      const { error } = await supabase
        .from('user_inventory')
        .upsert(
          { user_id: user.id, material_id: materialId, quantity: 1, unit: 'pieces' },
          { onConflict: 'user_id,material_id', ignoreDuplicates: true }
        )
      if (error) throw error
      await reload()
    } catch (e: any) {
      alert(e?.message ?? 'Failed to add material')
    } finally {
      setAdding(a => ({ ...a, [materialId]: false }))
    }
  }

  async function addAllMissingForFly(flyId: string, materialIds: (string | null | undefined)[]) {
    if (!user) return
    const ids = (materialIds ?? []).filter(Boolean) as string[]
    if (!ids.length) return

    setBulkAdding(s => ({ ...s, [flyId]: true }))
    try {
      const rows = ids.map(id => ({
        user_id: user.id,
        material_id: id,
        quantity: 1,
        unit: 'pieces'
      }))
      const { error } = await supabase
        .from('user_inventory')
        .upsert(rows, { onConflict: 'user_id,material_id', ignoreDuplicates: true })
      if (error) throw error
      await reload()
    } catch (e: any) {
      alert(e?.message ?? 'Failed to add materials')
    } finally {
      setBulkAdding(s => ({ ...s, [flyId]: false }))
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return rows
    return rows.filter(r =>
      r.name.toLowerCase().includes(q) ||
      (meta[r.user_fly_id]?.category ?? '').toLowerCase().includes(q) ||
      (meta[r.user_fly_id]?.difficulty ?? '').toLowerCase().includes(q)
    )
  }, [rows, search, meta])

  if (!user) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-4">🎯 What Can I Tie?</h1>
          <div className="p-4 border rounded bg-yellow-50">
            Please sign in to see your personalized results.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-3xl font-bold">🎯 What Can I Tie?</h1>
          <div className="ml-auto flex gap-2">
            <Link href="/inventory"><Button variant="outline">📦 Inventory</Button></Link>
            <Link href="/compendium"><Button variant="outline">📚 Compendium</Button></Link>
            <Link href="/discover/picklist"><Button><ShoppingCart className="w-4 h-4 mr-1" /> Shop mode</Button></Link>
          </div>
        </div>

        {/* Controls */}
        <div className="mb-4 flex items-center gap-3">
          <input
            value={search}
            onChange={(e)=>setSearch(e.target.value)}
            placeholder="Search by fly name, category, or difficulty…"
            className="w-full px-3 py-2 border rounded-lg"
          />
          <Button variant="secondary" onClick={reload}>Refresh</Button>
        </div>

        {/* States */}
        {loading && <div className="p-4 border rounded bg-gray-50">Loading…</div>}
        {error && (
          <div className="p-4 border rounded bg-red-50 text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="text-sm text-gray-600 mb-3">
              Showing <b>{filtered.length}</b> of {rows.length} flies
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((r) => {
                const m = meta[r.user_fly_id]
                const missingIds = (r.missing_ids ?? []).filter(Boolean) as string[]
                const hasImage = !!m?.image_url
                return (
                  <Card key={r.user_fly_id} className="hover:shadow-lg transition-all">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-xl leading-tight">{r.name}</CardTitle>
                        <Badge variant={r.tieable ? 'default' : 'secondary'}>
                          {r.tieable ? 'Tieable now' : `Missing ${r.required_missing}`}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-500 space-x-2">
                        {m?.category && <span className="capitalize">{m.category}</span>}
                        {m?.difficulty && <span>• {m.difficulty}</span>}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {/* Image + Upload */}
                      <div className="w-full h-40 rounded border flex items-center justify-center mb-3 overflow-hidden bg-white">
                        {hasImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m!.image_url!}
                            alt={r.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="text-gray-400 text-sm flex flex-col items-center">
                            <ImageIcon className="w-6 h-6 mb-1" />
                            No image
                          </div>
                        )}
                      </div>
                      <UploadFlyImage
                        flyId={r.user_fly_id}
                        onUploaded={async () => { await reload() }}
                      />

                      {!r.tieable && (
                        <div className="mt-4">
                          <div className="text-sm font-medium mb-1">Missing materials</div>
                          <div className="flex flex-wrap gap-2">
                            {missingIds.length === 0 && (
                              <span className="text-xs text-gray-500">
                                {r.missing_names || 'Unknown/Uncatalogued items'}
                              </span>
                            )}
                            {missingIds.map((id) => (
                              <Button
                                key={id}
                                size="sm"
                                variant="outline"
                                disabled={!!adding[id]}
                                onClick={() => addMaterial(id)}
                              >
                                {adding[id] ? 'Adding…' : (<><Plus className="w-4 h-4 mr-1" /> Add</>)}
                              </Button>
                            ))}
                          </div>

                          {missingIds.length > 1 && (
                            <div className="mt-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={!!bulkAdding[r.user_fly_id]}
                                onClick={() => addAllMissingForFly(r.user_fly_id, r.missing_ids ?? [])}
                              >
                                {bulkAdding[r.user_fly_id] ? 'Adding…' : 'Add all missing'}
                              </Button>
                            </div>
                          )}

                          {/* Names (nice to show even when we have IDs) */}
                          {r.missing_names && (
                            <div className="mt-3 text-xs text-gray-600">
                              {r.missing_names}
                            </div>
                          )}
                        </div>
                      )}

                      {r.tieable && (
                        <div className="mt-3 text-emerald-700 text-sm flex items-center gap-2">
                          <Check className="w-4 h-4" /> You have everything required.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ---------- Inline Upload Component ---------- */
function UploadFlyImage({ flyId, onUploaded }: { flyId: string, onUploaded?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function pickFile() {
    inputRef.current?.click()
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      // Ensure bucket "fly-images" exists and is public
      const path = `${flyId}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`
      const { error: upErr } = await supabase.storage.from('fly-images').upload(path, file, {
        upsert: true,
        cacheControl: '3600',
      })
      if (upErr) throw upErr

      const { data: urlData } = supabase.storage.from('fly-images').getPublicUrl(path)
      const publicUrl = urlData?.publicUrl
      if (!publicUrl) throw new Error('Could not resolve public URL')

      const { error: updErr } = await supabase
        .from('user_flies')
        .update({ image_url: publicUrl })
        .eq('id', flyId)
      if (updErr) throw updErr

      onUploaded?.()
    } catch (e: any) {
      alert(e?.message ?? 'Upload failed')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFile}
      />
      <Button variant="outline" size="sm" onClick={pickFile} disabled={busy}>
        <Upload className="w-4 h-4 mr-1" /> {busy ? 'Uploading…' : 'Upload image'}
      </Button>
      <span className="text-xs text-gray-500">JPEG/PNG/WebP, ~2–5MB ok.</span>
    </div>
  )
}
