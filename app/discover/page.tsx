// app/discover/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type StrArr = string[] | null | undefined

type UIFetchState<T> = {
  loading: boolean
  error: string | null
  data: T | null
}

type UserFly = {
  id: string
  name: string
  category: string
  difficulty: string | null
  sizes: (number | string)[] | null
}

type CatalogMat = { id: string; name: string; color: string | null }

type UserMat = {
  link: string   // normalized fly link id (user_fly_id or fly_id)
  required: boolean
  material_id: string | null
  material_name: string | null
  color: string | null
  materials?: CatalogMat | null
}

const CHUNK = 80 // keep the URL short to avoid 400s on long IN lists

function chunk<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export default function DiscoverPage() {
  const { user } = useAuth()
  const [fliesS, setFliesS] = useState<UIFetchState<UserFly[]>>({ loading: true, error: null, data: null })
  const [matsS, setMatsS] = useState<UIFetchState<UserMat[]>>({ loading: true, error: null, data: null })

  useEffect(() => {
    if (!user) {
      setFliesS({ loading: false, error: null, data: [] })
      setMatsS({ loading: false, error: null, data: [] })
      return
    }
    ;(async () => {
      try {
        // 1) Load my flies
        setFliesS(s => ({ ...s, loading: true, error: null }))
        const { data: ufData, error: ufErr } = await supabase
          .from('user_flies')
          .select('id, name, category, difficulty, sizes')
          .order('name', { ascending: true })
        if (ufErr) throw ufErr
        const myFlies: UserFly[] = (ufData ?? []).map((r: any) => ({
          id: r.id,
          name: r.name,
          category: r.category,
          difficulty: r.difficulty ?? null,
          sizes: Array.isArray(r.sizes) ? r.sizes : (r.sizes ?? []),
        }))
        setFliesS({ loading: false, error: null, data: myFlies })

        // 2) Load my materials (no nested join to avoid ambiguous embed), then hydrate names
        setMatsS(s => ({ ...s, loading: true, error: null }))
        const ids = myFlies.map(f => f.id)
        const rows = await fetchUserFlyMaterials(ids, user.id)
        setMatsS({ loading: false, error: null, data: rows })
      } catch (e: any) {
        console.error('Error loading data:', e)
        setFliesS(s => ({ ...s, loading: false }))
        setMatsS({ loading: false, error: e?.message ?? 'Failed to load data.', data: null })
        alert('Failed to load data.')
      }
    })()
  }, [user])

  // Group materials by fly
  const matsByFly = useMemo(() => {
    const map = new Map<string, UserMat[]>()
    ;(matsS.data ?? []).forEach(m => {
      const arr = map.get(m.link) ?? []
      arr.push(m)
      map.set(m.link, arr)
    })
    return map
  }, [matsS.data])

  const myFlies = fliesS.data ?? []

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-3xl font-bold">🎯 What Can I Tie?</h1>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/discover/picklist">
              <Button variant="outline">🧾 Shop Picklist</Button>
            </Link>
          </div>
        </div>

        {!user && (
          <div className="p-4 border rounded bg-yellow-50">
            Please sign in to see your personalized results.
          </div>
        )}

        {user && (
          <>
            <div className="mb-4 text-sm text-gray-600">
              Loaded flies: <b>{myFlies.length}</b> • Loaded materials rows:{' '}
              <b>{matsS.data?.length ?? 0}</b>
              {matsS.error ? (
                <span className="text-red-600 ml-2">Error: {matsS.error}</span>
              ) : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myFlies.map(f => {
                const mats = matsByFly.get(f.id) ?? []
                return (
                  <div key={f.id} className="border rounded p-4 bg-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-lg font-semibold">{f.name}</div>
                        <div className="text-xs text-gray-500 capitalize">{f.category}</div>
                      </div>
                      <div className="text-xs px-2 py-1 rounded bg-gray-100">
                        {mats.length} materials
                      </div>
                    </div>

                    {mats.length > 0 && (
                      <ul className="mt-3 text-sm list-disc pl-5 space-y-1">
                        {mats.slice(0, 8).map((m, i) => (
                          <li key={i}>
                            {(m.materials?.name ??
                              m.material_name ??
                              'Unknown')}
                            {(() => {
                              // Prefer explicit color on the user row; else fallback to catalog color
                              const c = m.color ?? m.materials?.color ?? null
                              return c ? ` (${c})` : ''
                            })()}
                            {!m.required ? <span className="text-gray-500"> — optional</span> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Fetch user_fly_materials in chunks and normalize the join key to `link`.
 * Avoids nested materials() to prevent ambiguous-embed errors, then hydrates names
 * via a separate materials query.
 */
async function fetchUserFlyMaterials(userFlyIds: string[], userId?: string): Promise<UserMat[]> {
  if (!userId || userFlyIds.length === 0) return []

  const out: UserMat[] = []
  const batches = chunk(userFlyIds, CHUNK)

  // Try newer schema first (user_fly_id), fall back to fly_id if needed
  for (const ids of batches) {
    let got = false
    for (const col of ['user_fly_id', 'fly_id'] as const) {
      const { data, error } = await supabase
        .from('user_fly_materials')
        .select(
          // NOTE: no nested materials(...) to avoid ambiguous embed
          `link:${col}, required, material_id, material_name, color`
        )
        .eq('user_id', userId)
        .in(col, ids)

      if (!error && data) {
        out.push(...(data as any[]))
        got = true
        break
      }
      if (error && col === 'fly_id') {
        console.error('fetchUserFlyMaterials failed:', error)
      }
    }
    if (!got) {
      // no rows for this batch (ok)
    }
  }

  // Hydrate catalog names/colors separately (avoids ambiguous embed)
  const idsToHydrate = Array.from(
    new Set(
      out
        .map(r => r.material_id)
        .filter((x): x is string => !!x)
    )
  )
  const matMap = new Map<string, CatalogMat>()
  if (idsToHydrate.length) {
    for (const ids of chunk(idsToHydrate, 100)) {
      const { data, error } = await supabase
        .from('materials')
        .select('id, name, color')
        .in('id', ids)
      if (!error && data) {
        for (const m of data as CatalogMat[]) matMap.set(m.id, m)
      }
    }
  }

  // Attach hydrated materials if available
  return out.map(r => ({
    ...r,
    materials: r.material_id ? (matMap.get(r.material_id) ?? null) : null,
  }))
}
