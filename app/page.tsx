'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from './contexts/AuthContext'
import { Button } from '@/components/ui/button'

type FlySource = 'global' | 'user'

interface Fly {
  id: string
  source: FlySource
  name: string
  category: string
  difficulty: string | null
  sizes: (number | string)[] | null
  image_url?: string | null
}

interface FlyDetail extends Fly {
  tutorials: { url: string; title: string; tutorial_type: string }[]
  materials: { required: boolean; name: string; color: string | null }[]
  target_species?: string[] | null
  colorways?: string[] | null
}

export default function Home() {
  const [allFlies, setAllFlies] = useState<Fly[]>([])
  const [filtered, setFiltered] = useState<Fly[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<FlyDetail | null>(null)
  const { user, signOut } = useAuth()

  useEffect(() => { void loadFlies() }, [])
  useEffect(() => {
    const prev = document.body.style.overflow
    if (selected) document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [selected])
  useEffect(() => {
    const needle = q.toLowerCase().trim()
    if (!needle) setFiltered(allFlies)
    else setFiltered(allFlies.filter(f =>
      f.name.toLowerCase().includes(needle) ||
      (f.category ?? '').toLowerCase().includes(needle)
    ))
  }, [q, allFlies])

  async function loadFlies() {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()

      const { data: g } = await supabase
        .from('flies')
        .select('id, name, category, difficulty, sizes, image_url')
        .order('name')
        .limit(1000)

      const globals: Fly[] = (g ?? []).map((r: any) => ({
        id: r.id, source: 'global', name: r.name,
        category: r.category, difficulty: r.difficulty,
        sizes: r.sizes ?? [], image_url: r.image_url ?? null
      }))

      let mine: Fly[] = []
      if (user) {
        const { data: u } = await supabase
          .from('user_flies')
          .select('id, name, category, difficulty, sizes, image_url')
          .order('name')
        mine = (u ?? []).map((r: any) => ({
          id: r.id, source: 'user' as const, name: r.name,
          category: r.category, difficulty: r.difficulty ?? null,
          sizes: Array.isArray(r.sizes) ? r.sizes : (r.sizes ?? []),
          image_url: r.image_url ?? null
        }))
      }

      const merged = [...globals, ...mine]
      setAllFlies(merged)
      setFiltered(merged)
    } finally {
      setLoading(false)
    }
  }

  async function openDetail(fly: Fly) {
    try {
      if (fly.source === 'global') {
        const { data: base } = await supabase
          .from('flies')
          .select('id, name, category, difficulty, sizes, image_url, target_species, colorways')
          .eq('id', fly.id).single()

        const { data: fms } = await supabase
          .from('fly_materials')
          .select('required, materials ( name, color )')
          .eq('fly_id', fly.id)

        const { data: tuts } = await supabase
          .from('tutorials')
          .select('url, title, tutorial_type')
          .eq('fly_id', fly.id)

        const detail: FlyDetail = {
          ...fly,
          target_species: base?.target_species ?? [],
          colorways: base?.colorways ?? [],
          materials: (fms ?? []).map((r: any) => ({
            required: r.required ?? true,
            name: r.materials?.name ?? 'Unknown',
            color: r.materials?.color ?? null,
          })),
          tutorials: (tuts ?? []) as any,
        }
        setSelected(detail)
      } else {
        const { data: base } = await supabase
          .from('user_flies')
          .select('id, name, category, difficulty, sizes, image_url, target_species, colorways')
          .eq('id', fly.id).single()

        const { data: fms } = await supabase
          .from('user_fly_materials')
          .select('required, material_name, color, materials ( name, color )')
          .eq('fly_id', fly.id)

        const { data: tuts } = await supabase
          .from('user_fly_tutorials')
          .select('url, title, tutorial_type')
          .eq('fly_id', fly.id)

        const mats = (fms ?? []).map((r: any) => ({
          required: r.required ?? true,
          name: r.materials?.name ?? r.material_name ?? 'Unknown',
          color: r.materials?.color ?? r.color ?? null
        }))

        const detail: FlyDetail = {
          ...fly,
          target_species: base?.target_species ?? [],
          colorways: base?.colorways ?? [],
          materials: mats,
          tutorials: (tuts ?? []) as any,
        }
        setSelected(detail)
      }
    } catch (e) {
      console.error('Open detail failed:', e)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-xl">Loading flies...</div></div>
  }

  return (
    <div className="min-h-screen p-8 bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-2">
          <h1 className="text-5xl font-bold">WhatToFlie 🎣</h1>
          <div className="ml-auto flex gap-4 items-center">
            <input
              value={q}
              onChange={e=>setQ(e.target.value)}
              placeholder="Search flies…"
              className="px-3 py-2 border rounded-lg"
            />
            {user ? (
              <>
                <span className="text-sm text-gray-600">{user.email}</span>
                <button onClick={() => signOut()} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">
                  Sign Out
                </button>
              </>
            ) : (
              <Link href="/login">
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Sign In</button>
              </Link>
            )}
          </div>
        </div>

        {/* Nav */}
        <div className="mt-2 mb-8 flex gap-2">
          <Link href="/inventory"><button className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50">📦 Inventory</button></Link>
          <Link href="/discover"><button className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50">🎯 What Can I Tie?</button></Link>
          <Link href="/unlock"><button className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50">🔓 Unlock</button></Link>
          <Link href="/compendium"><button className="px-3 py-2 text-sm rounded-lg border hover:bg-gray-50">📚 Compendium</button></Link>
        </div>

        {/* Fly Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((fly) => (
            <button
              key={`${fly.source}:${fly.id}`}
              onClick={() => openDetail(fly)}
              className="text-left bg-white border border-gray-200 rounded-lg p-6 hover:shadow-xl transition-all hover:scale-[1.01] cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <h2 className="text-2xl font-bold mb-2">{fly.name}</h2>
                <span className={`text-xs px-2 py-1 rounded ${fly.source === 'global' ? 'bg-gray-100' : 'bg-blue-100'}`}>
                  {fly.source === 'global' ? 'Global' : 'Yours'}
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-gray-600 capitalize">📂 {fly.category.replace('_', ' ')}</p>
                <p className="text-sm text-gray-500">🎯 Difficulty: {fly.difficulty ?? '—'}</p>
                {Array.isArray(fly.sizes) && fly.sizes.length > 0 && (
                  <p className="text-sm text-gray-500">📏 Sizes: {fly.sizes.join(', ')}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Modal */}
      {selected && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelected(null)} />
          <div className="absolute inset-0 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <h3 className="text-2xl font-bold">{selected.name}</h3>
                    <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
                  </div>
                  <div className="mt-2 text-sm text-gray-600 capitalize">
                    Category: {selected.category.replace('_', ' ')}
                  </div>
                  {selected.difficulty && (
                    <div className="mt-1">
                      <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium capitalize">
                        {selected.difficulty}
                      </span>
                    </div>
                  )}
                  <div className="mt-4">
                    {selected.image_url ? (
                      <img src={selected.image_url} alt={selected.name} className="w-full h-64 object-cover rounded-lg border" />
                    ) : (
                      <div className="w-full h-64 rounded-lg border flex items-center justify-center text-gray-400">No image yet</div>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {Array.isArray(selected.sizes) && selected.sizes.length > 0 && (
                      <span className="inline-flex items-center rounded-md border px-2 py-1 text-xs">Sizes: {selected.sizes.join(', ')}</span>
                    )}
                    {Array.isArray(selected.target_species) && selected.target_species.length > 0 && (
                      <span className="inline-flex items-center rounded-md border px-2 py-1 text-xs">Targets: {selected.target_species.join(', ')}</span>
                    )}
                    {Array.isArray(selected.colorways) && selected.colorways.length > 0 && (
                      <span className="inline-flex items-center rounded-md border px-2 py-1 text-xs">Colorways: {selected.colorways.join(', ')}</span>
                    )}
                  </div>
                  <div className="mt-6">
                    <h4 className="font-semibold mb-2">Materials</h4>
                    <div className="space-y-1">
                      {selected.materials.map((m, i) => (
                        <div key={i} className="text-sm">
                          {m.required ? '•' : '○'} {m.name}{m.color ? ` (${m.color})` : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                  {selected.tutorials.length > 0 && (
                    <div className="mt-6">
                      <h4 className="font-semibold mb-2">Tutorials</h4>
                      <ul className="list-disc pl-6 space-y-1">
                        {selected.tutorials.map((t, i) => (
                          <li key={i} className="text-sm">
                            <a href={t.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                              {t.title || t.url}
                            </a>
                            {t.tutorial_type ? <span className="text-gray-500"> — {t.tutorial_type}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
