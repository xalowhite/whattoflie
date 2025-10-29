'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../contexts/AuthContext'

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
  materials?: { id: string; name: string; color: string | null } | null
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

        // 2) Load my materials → handle schema variants + long URL
        setMatsS(s => ({ ...s, loading: true, error: null }))
        const ids = myFlies.map(f => f.id)
        const rows = await fetchUserFlyMaterials(ids)
        setMatsS({ loading: false, error: null, data: rows })
      } catch (e: any) {
        console.error('Error loading data:', e)
        setFliesS(s => ({ ...s, loading: false }))
        setMatsS({ loading: false, error: e?.message ?? 'Failed to load data.', data: null })
        alert('Failed to load data.')
      }
    })()
  }, [user])

  // Simple example “What can I tie?” calculation
  // For now we just group materials by fly
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
        <h1 className="text-3xl font-bold mb-4">🎯 What Can I Tie?</h1>

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
                            {(m.materials?.name ?? m.material_name ?? 'Unknown')}
                            {m.color ? ` (${m.color})` : ''}
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
 * Tries schema variants: first `user_fly_id`, then `fly_id`.
 */
async function fetchUserFlyMaterials(userFlyIds: string[]): Promise<UserMat[]> {
  if (userFlyIds.length === 0) return []

  const tryCol = async (col: 'user_fly_id' | 'fly_id') => {
    const batches = chunk(userFlyIds, CHUNK)
    const out: UserMat[] = []
    for (const ids of batches) {
      const sel = `link:${col},required,material_id,material_name,color,materials(id,name,color)`
      const q = supabase.from('user_fly_materials').select(sel).in(col, ids)
      const { data, error } = await q
      if (error) {
        // Bubble up for fallback to kick in
        throw error
      }
      out.push(...((data ?? []) as any[]))
    }
    return out
  }

  try {
    return await tryCol('user_fly_id')
  } catch {
    // Fallback if your schema uses fly_id (older/newer variant)
    return await tryCol('fly_id')
  }
}
