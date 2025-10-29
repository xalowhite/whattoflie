'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Copy, RefreshCw, Share2, ArrowLeft, Check } from 'lucide-react'



type TieRow = {
  user_fly_id: string
  name: string
  required_missing: number
  missing_names: string | null
  missing_ids: string[] | null
  tieable: boolean
}

type PickItem = {
  material_id: string | null
  label: string
  flies: { id: string; name: string }[]
}

export default function PicklistPage() {
  const [rows, setRows] = useState<TieRow[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  // On load: if URL has #payload, render that; else query live data
  useEffect(() => {
    const hash = globalThis?.location?.hash?.slice(1)
    if (hash) {
      try {
        const json = JSON.parse(decodeURIComponent(atob(hash)))
        if (Array.isArray(json)) {
          setRows(json)
          setLoading(false)
          return
        }
      } catch { /* fall through */ }
    }
    void loadLive()
  }, [])

  async function loadLive() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('v_tieability_user_flies')
        .select('user_fly_id, name, required_missing, missing_names, missing_ids, tieable')
        .order('required_missing', { ascending: false })
      if (error) throw error
      const needs = (data ?? []).filter(r => !r.tieable && (r.required_missing ?? 0) > 0)
      setRows(needs as TieRow[])
    } catch (e: any) {
      alert(e?.message ?? 'Failed to load picklist')
    } finally {
      setLoading(false)
    }
  }

  const items = useMemo<PickItem[]>(() => {
    // Build a label list from missing_ids + missing_names
    // If we have material_id, we’ll group by that; else group by label text.
    const mapById = new Map<string, PickItem>()
    const mapByLabel = new Map<string, PickItem>()

    for (const r of rows) {
      const ids = (r.missing_ids ?? []) as (string | null)[]
      const labels = (r.missing_names ?? '').split(/\s*,\s*/).filter(Boolean)

      // Try to align IDs with labels by index (best effort)
      for (let i = 0; i < Math.max(ids.length, labels.length); i++) {
        const id = (ids[i] ?? null)
        const label = (labels[i] ?? labels[labels.length - 1] ?? 'Unknown').trim()

        if (id) {
          const k = id
          const ex = mapById.get(k)
          if (ex) ex.flies.push({ id: r.user_fly_id, name: r.name })
          else mapById.set(k, { material_id: id, label, flies: [{ id: r.user_fly_id, name: r.name }] })
        } else {
          const k = label.toLowerCase()
          const ex = mapByLabel.get(k)
          if (ex) ex.flies.push({ id: r.user_fly_id, name: r.name })
          else mapByLabel.set(k, { material_id: null, label, flies: [{ id: r.user_fly_id, name: r.name }] })
        }
      }
    }

    return [...mapById.values(), ...mapByLabel.values()].sort((a, b) =>
      a.label.localeCompare(b.label)
    )
  }, [rows])

  async function copyShareLink() {
    // Embed current rows in URL hash as base64
    const payload = btoa(encodeURIComponent(JSON.stringify(rows)))
    const url = `${location.origin}/discover/picklist#${payload}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(()=>setCopied(false), 1500)
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/discover">
            <Button variant="outline"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
          </Link>
          <h1 className="text-3xl font-bold ml-2">🧾 Shop Picklist</h1>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" onClick={loadLive}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
            <Button onClick={copyShareLink}><Share2 className="w-4 h-4 mr-1" /> {copied ? 'Copied!' : 'Copy share link'}</Button>
          </div>
        </div>

        {loading && <div className="p-4 border rounded bg-gray-50">Loading…</div>}

        {!loading && (
          <>
            <div className="text-sm text-gray-600 mb-3">
              Missing groups: <b>{items.length}</b> • Flies affected: <b>{rows.length}</b>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {items.map((it, idx) => (
                <Card key={idx} className="hover:shadow transition">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">
                      {it.label}
                      {it.material_id ? (
                        <Badge className="ml-2">Catalog</Badge>
                      ) : (
                        <Badge variant="secondary" className="ml-2">Alias/Unknown</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-gray-600 mb-2">
                      Needed for {it.flies.length} {it.flies.length === 1 ? 'fly' : 'flies'}:
                    </div>
                    <ul className="text-sm list-disc pl-5 space-y-1">
                      {it.flies.slice(0, 6).map(f => <li key={f.id}>{f.name}</li>)}
                      {it.flies.length > 6 && <li>…and {it.flies.length - 6} more</li>}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>

            {items.length === 0 && (
              <div className="p-4 border rounded bg-emerald-50 text-emerald-700 mt-4 flex items-center gap-2">
                <Check className="w-4 h-4" /> You’re not missing anything. Go tie!
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
