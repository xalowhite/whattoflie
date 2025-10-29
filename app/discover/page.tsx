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

type UserMat = {
  link: string   // normalized fly link id (user_fly_id or fly_id)
  required: boolean
  material_id: string | null
  material_name: string | null
  color: string | null
}

type Material = {
  id: string
  name: string
  color: string | null
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
  const [materials, setMaterials] = useState<Material[]>([])

  useEffect(() => {
    if (!user) {
      setFliesS({ loading: false, error: null, data: [] })
      setMatsS({ loading: false, error: null, data: [] })
      setMaterials([])
      return
    }
    ;(async () => {
      try {
        // 0) Load catalog of materials (no embed ambiguity)
        const { data: matsCat, error: matsErr } = await supabase
          .from('materials')
          .select('id, name, color')
          .limit(20000)
        if (matsErr) throw matsErr
        setMaterials(matsCat ?? [])

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

        // 2) Load materials for my flies — **no nested embed**
        setMatsS(s => ({ ...s, loading: true, error: null }))
        const ids = myFlies.map(f => f.id)
        const rows = await fetchUserFlyMaterials(ids) // flat rows, no ambiguous join
        setMatsS({ loading: false, error: null, data: rows })
      } catch (e: any) {
        console.error('Error loading data:', e)
        setFliesS(s => ({ ...s, loading: false }))
        setMatsS({ loading: false, error: e?.message ?? 'Failed to load data.', data: [] })
        alert('Failed to load data.')
      }
    })()
  }, [user])

  // Map material_id -> catalog entry
  const matById = useMemo(() => {
    const m = new Map<string, Material>()
    for (const row of materials) m.set(row.id, row)
    return m
  }, [materials])

  // Group materials by fly id
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

  // Display helper: prefer catalog name/color when we have material_id
  function matLabel(m: UserMat) {
    if (m.material_id && matById.has(m.material_id)) {
      const row = matById.get(m.material_id)!
      const n = row.name || m.material_name || 'Unknown'
      const c = row.color || m.color
      return n + (c ? ` (${c})` : '')
    }
    const n = m.material_name || 'Unknown'
    return n + (m.color ? ` (${m.color})` : '')
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-3xl font-bold">🎯 What Can I Tie?</h1>
          <Link href="/discover/picklist"><Button variant="outline">🧾 Shop Picklist</Button></Link>
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
                  <Card key={f.id} className="hover:shadow transition">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">{f.name}</CardTitle>
                          <div className="text-xs text-gray-500 capitalize">{f.category}</div>
                        </div>
                        <Badge variant="secondary">{mats.length} materials</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {mats.length > 0 ? (
                        <ul className="mt-2 text-sm list-disc pl-5 space-y-1">
                          {mats.slice(0, 8).map((m, i) => (
                            <li key={i}>
                              {matLabel(m)}
                              {!m.required ? <span className="text-gray-500"> — optional</span> : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-sm text-gray-500">No materials saved yet.</div>
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

/**
 * Fetch user_fly_materials in chunks and normalize the join key to `link`.
 * IMPORTANT: no nested `materials(...)` embed here to avoid ambiguous FK.
 */
async function fetchUserFlyMaterials(userFlyIds: string[]): Promise<UserMat[]> {
  if (userFlyIds.length === 0) return []
  const out: UserMat[] = []

  // Try modern schema first: user_fly_id
  try {
    const batches = chunk(userFlyIds)
    for (const ids of batches) {
      const sel = 'link:user_fly_id,required,material_id,material_name,color'
      const { data, error } = await supabase
        .from('user_fly_materials')
        .select(sel)
        .in('user_fly_id', ids)

      if (error) throw error
      out.push(...((data ?? []) as any[]))
    }
    return out
  } catch {
    // Fallback to older/newer variant: fly_id
    const batches = chunk(userFlyIds)
    for (const ids of batches) {
      const sel = 'link:fly_id,required,material_id,material_name,color'
      const { data, error } = await supabase
        .from('user_fly_materials')
        .select(sel)
        .in('fly_id', ids)

      if (error) throw error
      out.push(...((data ?? []) as any[]))
    }
    return out
  }
}
