'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ShoppingCart, TrendingUp, Plus } from 'lucide-react'

/* ================= Helpers ================= */
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isUUID = (s?: string | null) => !!s && UUID_RX.test(String(s))

function sanitizeLabel(s?: string | null) {
  if (!s) return ''
  let t = String(s)
    .replace(/[\r\n]+/g, ' ')
    .replace(/^[“”"']+|[“”"']+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  t = t.replace(/["'”]\s*$/, '').trim()
  if (t.length > 140) t = t.slice(0, 140).trim() + '…'
  return t
}

function shopUrl(label: string) {
  const q = encodeURIComponent(`fly tying ${label}`)
  return `https://www.google.com/search?q=${q}`
}

/* ================ Types ================ */
type RpcRow = {
  kind: 'material_leader' | 'fly'
  fly_id: string | null
  fly_name: string | null
  missing_count: number | null
  missing_group: string // uuid (either material_groups.id OR materials.id)
  missing_group_name: string | null
  unlocks: number | null // only for kind='material_leader'
}

type UnlockCard = {
  key: string
  label: string
  flies: string[]
  unlocks: number
  materialId?: string | null // set if missing_group is actually a materials.id (enables quick add)
}

export default function UnlocksPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<UnlockCard[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (user) void load()
    else setLoading(false)
  }, [user])

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth?.user?.id
      if (!uid) { setRows([]); return }

      // 1) Get unlock analysis from the DB
      const { data, error } = await supabase.rpc('rpc_unlocks', { max_missing: 3 })
      if (error) throw error
      const rowsRaw = (data ?? []) as RpcRow[]

      // Split leaders and fly rows
      const leaders = rowsRaw.filter(r => r.kind === 'material_leader')
      const flyRows = rowsRaw.filter(r => r.kind === 'fly')

      // 2) Build mapping: missing_group -> [fly names]
      const byGroup: Record<string, string[]> = {}
      for (const r of flyRows) {
        if (!r.missing_group) continue
        const name = r.fly_name ? sanitizeLabel(r.fly_name) : 'Unknown'
        if (!byGroup[r.missing_group]) byGroup[r.missing_group] = []
        if (!byGroup[r.missing_group].includes(name)) byGroup[r.missing_group].push(name)
      }

      // 3) Detect which leader ids are actual MATERIAL ids (vs group ids) to allow quick add
      const leaderIds = leaders.map(l => l.missing_group).filter(isUUID)
      const { data: matHit } = leaderIds.length
        ? await supabase.from('materials').select('id').in('id', leaderIds)
        : { data: [] as { id: string }[] }
      const materialIdSet = new Set((matHit ?? []).map(m => m.id))

      // 4) Build UI cards
      const cards: UnlockCard[] = leaders.map(l => {
        const label = sanitizeLabel(l.missing_group_name || 'Unknown')
        const flies = (byGroup[l.missing_group] || []).sort()
        const materialId = materialIdSet.has(l.missing_group) ? l.missing_group : null
        return {
          key: l.missing_group,
          label,
          flies,
          unlocks: l.unlocks ?? flies.length,
          materialId
        }
      })

      // 5) Sort + limit
      cards.sort((a, b) => b.unlocks - a.unlocks || a.label.localeCompare(b.label))
      setRows(cards.slice(0, 30))
    } catch (e: any) {
      console.error('Unlocks load failed:', e?.message || e)
      setErr('Failed to calculate unlocks.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  async function addToInventory(card: UnlockCard) {
    if (!card.materialId || !isUUID(card.materialId)) return
    try {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth?.user?.id
      if (!uid) return
      const { error } = await supabase
        .from('user_inventory')
        .upsert(
          { user_id: uid, material_id: card.materialId, quantity: 1, unit: 'pieces' },
          { onConflict: 'user_id,material_id' }
        )
      if (error) throw error
      await load()
    } catch (e) {
      console.error('addToInventory failed', e)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <Card className="max-w-md">
          <CardHeader><CardTitle>Sign In Required</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-4">You need to sign in to use this feature.</p>
            <Link href="/login"><Button>Sign In</Button></Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">Calculating unlocks…</div>

  const totalUnlocks = rows.reduce((s, r) => s + r.unlocks, 0)

  return (
    <div className="min-h-screen p-8 bg-gradient-to-b from-orange-50 to-white">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-5xl font-bold mb-2">Material Unlock Analysis 🔓</h1>
          <p className="text-gray-600">Buy the one item that unlocks the most “1-away” flies.</p>
        </div>

        <div className="flex flex-wrap gap-4 mb-8">
          <Link href="/"><Button variant="outline">← Back to Flies</Button></Link>
          <Link href="/discover"><Button variant="outline">🎯 What Can I Tie?</Button></Link>
          <Link href="/inventory"><Button variant="outline">📦 Manage Inventory</Button></Link>
          <Link href="/compendium"><Button variant="outline">📚 Compendium</Button></Link>
          <Button onClick={load} variant="outline">Refresh</Button>
        </div>

        {err && (
          <Card className="mb-6 border-red-300">
            <CardContent className="pt-6 text-red-700">
              {err} Try adding some items to your inventory first.
            </CardContent>
          </Card>
        )}

        {rows.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center py-12">
              <ShoppingCart className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <h3 className="text-xl font-bold mb-2">All Stocked Up!</h3>
              <p className="text-gray-600 mb-4">No 1-away flies right now. Add a few more materials.</p>
              <Link href="/inventory"><Button>Add Materials</Button></Link>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold text-orange-600">{rows[0]?.unlocks ?? 0}</div>
                  <div className="text-sm text-gray-600">Most Flies from 1 Material</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold text-blue-600">{totalUnlocks}</div>
                  <div className="text-sm text-gray-600">Total Unlock Potential</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold text-green-600">{rows.length}</div>
                  <div className="text-sm text-gray-600">Materials to Consider</div>
                </CardContent>
              </Card>
            </div>

            {/* List */}
            <div className="space-y-4">
              <h2 className="text-2xl font-bold mb-4">Top Materials to Buy (Ranked by Impact)</h2>
              {rows.map((r, i) => (
                <MaterialCard key={r.key} item={r} rank={i + 1} onAdd={() => addToInventory(r)} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MaterialCard({ item, rank, onAdd }: { item: UnlockCard; rank: number; onAdd: () => void }) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`
  const canQuickAdd = !!item.materialId && /^[0-9a-f-]{36}$/i.test(item.materialId)

  return (
    <Card className="hover:shadow-lg transition-all">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Badge className="text-lg px-3 py-1">{medal}</Badge>
            <div>
              <CardTitle className="text-xl">{item.label}</CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                Unlocks <span className="font-bold text-orange-600">{item.unlocks}</span> {item.unlocks === 1 ? 'fly' : 'flies'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canQuickAdd && (
              <Button onClick={onAdd} size="sm" title="Add this specific catalog item to your inventory">
                <Plus className="w-4 h-4 mr-1" /> Add to inventory
              </Button>
            )}
            <a href={shopUrl(item.label)} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">Shop</Button>
            </a>
            <TrendingUp className="w-6 h-6 text-green-600" />
            <div className="text-right">
              <div className="text-2xl font-bold text-green-600">{item.unlocks}</div>
              <div className="text-xs text-gray-500">flies</div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <details className="rounded border p-3">
          <summary className="cursor-pointer text-sm text-gray-700">Show flies</summary>
          <ul className="mt-2 text-sm text-gray-700 list-disc pl-5">
            {item.flies.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </details>
      </CardContent>
    </Card>
  )
}
