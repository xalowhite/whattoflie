'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

type StrArr = string[] | null | undefined
type FlySource = 'global' | 'user'

interface Fly {
  id: string
  source: FlySource
  name: string
  category: string
  difficulty: string | null
  sizes: StrArr
  image_url?: string | null
}

interface InventoryItem {
  material_id: string | null
  name: string | null
  color: string | null
}

interface MatRow {
  fly_id: string
  name: string
  color: string | null
  required: boolean
  material_id: string | null
  position: number
}

const FK_USER_FLY_MATS = 'user_fly_materials_material_id_fkey'
const FK_USER_INV      = 'user_inventory_material_id_fkey'
const FK_FLY_MATS      = 'fly_materials_material_id_fkey'

export default function WhatCanITiePage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)

  const [globalFlies, setGlobalFlies] = useState<Fly[]>([])
  const [userFlies, setUserFlies] = useState<Fly[]>([])
  const [inv, setInv] = useState<InventoryItem[]>([])
  const [userMatRows, setUserMatRows] = useState<MatRow[]>([])
  const [globalMatRows, setGlobalMatRows] = useState<MatRow[]>([])
  const [q, setQ] = useState('')

  const signedIn = !!user

  useEffect(() => { void loadAll() }, [user])

  async function loadAll() {
    setLoading(true)
    try {
      // 1) Global flies (public)
      {
        const { data, error } = await supabase
          .from('flies')
          .select('id, name, category, difficulty, sizes, image_url')
          .order('name')
        if (error) throw error
        setGlobalFlies((data ?? []).map(r => ({ ...r, source: 'global' as const })))
      }

      // 2) Global mapping (fly_materials) with explicit FK embed
      {
        const { data, error } = await supabase
          .from('fly_materials')
          .select(`
            fly_id,
            required,
            position,
            material_name,
            color,
            material_id,
            mat:materials!${FK_FLY_MATS} ( name, color )
          `)
        if (error) {
          console.warn('fly_materials not available:', error.message || error)
          setGlobalMatRows([])
        } else {
          const rows: MatRow[] = (data ?? []).map((r: any) => ({
            fly_id: r.fly_id,
            required: !!r.required,
            position: r.position ?? 0,
            material_id: r.material_id ?? null,
            name: r.mat?.name ?? r.material_name ?? 'Unknown',
            color: r.mat?.color ?? r.color ?? null,
          }))
          setGlobalMatRows(rows)
        }
      }

      // 3) User inventory (correct table + FK)
      if (signedIn) {
        const { data, error } = await supabase
          .from('user_inventory')
          .select(`
            material_id,
            mat:materials!${FK_USER_INV} ( name, color )
          `)
          .eq('user_id', user!.id)
          .limit(50000)
        if (error) throw error
        setInv((data ?? []).map((r: any) => ({
          material_id: r.material_id ?? null,
          name: r.mat?.name ?? null,
          color: r.mat?.color ?? null,
        })))
      } else {
        setInv([])
      }

      // 4) My flies
      if (signedIn) {
        const { data, error } = await supabase
          .from('user_flies')
          .select('id, name, category, difficulty, sizes, image_url')
          .order('created_at', { ascending: false })
        if (error) throw error
        setUserFlies((data ?? []).map(r => ({ ...r, source: 'user' as const })))
      } else {
        setUserFlies([])
      }

      // 5) Materials for my flies (explicit FK)
      if (signedIn) {
        const { data, error } = await supabase
          .from('user_fly_materials')
          .select(`
            user_fly_id,
            required,
            position,
            material_name,
            color,
            material_id,
            mat:materials!${FK_USER_FLY_MATS} ( name, color )
          `)
          .eq('user_id', user!.id)
          .limit(50000)
        if (error) throw error
        const rows: MatRow[] = (data ?? []).map((r: any) => ({
          fly_id: r.user_fly_id,
          required: !!r.required,
          position: r.position ?? 0,
          material_id: r.material_id ?? null,
          name: r.mat?.name ?? r.material_name ?? 'Unknown',
          color: r.mat?.color ?? r.color ?? null,
        }))
        setUserMatRows(rows)
      } else {
        setUserMatRows([])
      }
    } catch (e: any) {
      console.error('WhatCanITie load failed:', e?.message || e)
      setGlobalFlies([])
      setUserFlies([])
      setInv([])
      setUserMatRows([])
      setGlobalMatRows([])
    } finally {
      setLoading(false)
    }
  }

  // Normalize inventory to handy lookups
  const invIds = useMemo(() => new Set(inv.map(i => i.material_id).filter(Boolean) as string[]), [inv])
  const invNames = useMemo(() => new Set(inv.map(i => (i.name ?? '').toLowerCase().trim()).filter(Boolean)), [inv])

  function haveMaterial(row: MatRow) {
    if (row.material_id && invIds.has(row.material_id)) return true
    const n = (row.name ?? '').toLowerCase().trim()
    if (!n) return false
    return invNames.has(n)
  }

  // Build material maps per fly
  const userReqByFly = useMemo(() => {
    const m = new Map<string, MatRow[]>()
    for (const r of userMatRows) {
      if (!r.required) continue
      ;(m.get(r.fly_id) ?? m.set(r.fly_id, []).get(r.fly_id)!).push(r)
    }
    for (const [k, arr] of m) arr.sort((a,b) => (a.position ?? 0) - (b.position ?? 0))
    return m
  }, [userMatRows])

  const globalReqByFly = useMemo(() => {
    const m = new Map<string, MatRow[]>()
    for (const r of globalMatRows) {
      if (!r.required) continue
      ;(m.get(r.fly_id) ?? m.set(r.fly_id, []).get(r.fly_id)!).push(r)
    }
    for (const [k, arr] of m) arr.sort((a,b) => (a.position ?? 0) - (b.position ?? 0))
    return m
  }, [globalMatRows])

  // Compute tie-eligible lists
  const myEligible = useMemo(() => {
    if (!signedIn) return []
    return userFlies.filter(f => {
      const req = userReqByFly.get(f.id) ?? []
      return req.length > 0 && req.every(haveMaterial)
    })
  }, [signedIn, userFlies, userReqByFly, invIds, invNames])

  const globalEligible = useMemo(() => {
    return globalFlies.filter(f => {
      const req = globalReqByFly.get(f.id) ?? []
      return req.length > 0 && req.every(haveMaterial)
    })
  }, [globalFlies, globalReqByFly, invIds, invNames])

  // Search filter
  const qLower = q.trim().toLowerCase()
  const showMy = useMemo(() => !qLower ? myEligible : myEligible.filter(f =>
    [f.name, f.category, f.difficulty ?? ''].some(s => s?.toLowerCase().includes(qLower))
  ), [myEligible, qLower])

  const showGlobal = useMemo(() => !qLower ? globalEligible : globalEligible.filter(f =>
    [f.name, f.category, f.difficulty ?? ''].some(s => s?.toLowerCase().includes(qLower))
  ), [globalEligible, qLower])

  // Status counts
  const fliesCount = globalFlies.length + userFlies.length
  const matRowsCount = globalMatRows.length + userMatRows.length

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading “What Can I Tie?”…</div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">🎯 What Can I Tie?</h1>
        <div className="text-sm text-muted-foreground">
          Loaded flies: {fliesCount} • Loaded materials rows: {matRowsCount}
        </div>
      </div>

      {!signedIn ? (
        <div className="mb-4 flex items-start gap-2 rounded-md border p-3 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 text-yellow-600" />
          <div>
            You’re browsing the default catalog. <Link href="/unlock" className="underline">Sign in</Link> to use your inventory and see exact “can tie” matches.
          </div>
        </div>
      ) : null}

      {globalMatRows.length === 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-md border p-3 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 text-blue-600" />
          <div>
            Global flies don’t have materials mapped yet. You’ll still see matches for <strong>My Flies</strong>.
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-6">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search eligible flies…"
          className="w-full px-3 py-2 border rounded-lg"
        />
      </div>

      {/* My Flies eligible */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">My Flies — Eligible ({showMy.length})</h2>
        {showMy.length === 0 ? (
          <div className="text-sm text-muted-foreground">No matches yet. Add materials to your inventory, or add materials to your flies.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {showMy.map(f => (
              <Card key={`my-${f.id}`} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="truncate">{f.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-2">
                  <Badge variant="outline">My Fly</Badge>
                  <Badge variant="secondary" className="capitalize">{f.category}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Global eligible */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-2">Global — Eligible ({showGlobal.length})</h2>
        {showGlobal.length === 0 ? (
          <div className="text-sm text-muted-foreground">No global matches yet.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {showGlobal.map(f => (
              <Card key={`g-${f.id}`} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="truncate">{f.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-2">
                  <Badge>Global</Badge>
                  <Badge variant="secondary" className="capitalize">{f.category}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="text-sm text-muted-foreground">
        Tip: add materials to your <Link href="/inventory" className="underline">Inventory</Link>, and add materials to your flies in the <Link href="/compendium" className="underline">Compendium</Link>.
      </div>
    </div>
  )
}
