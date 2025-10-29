'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Check, X, AlertCircle, ExternalLink, RotateCw, Plus } from 'lucide-react'

/* ---- scoring helpers (same as before) ---- */
type ColorFamily =
  | 'black' | 'white' | 'cream' | 'tan' | 'brown' | 'olive' | 'dun' | 'gray'
  | 'silver' | 'gold' | 'copper' | 'pearl' | 'chartreuse'
  | 'yellow' | 'orange' | 'red' | 'pink' | 'purple' | 'blue' | 'green'
  | 'unknown'
const COLOR_SYNONYMS: Record<ColorFamily, RegExp[]> = {
  black:[/black\b/i,/\bblk\b/i,/\bgunmetal\b/i,/\bjet\b/i],
  white:[/white\b/i,/\bwht\b/i,/\bsnow\b/i],
  cream:[/\bcream\b/i,/\bivory\b/i,/\beggshell\b/i,/\bone\s?white\b/i],
  tan:[/\btan\b/i,/\bkhaki\b/i,/\bcamel\b/i,/\bsand\b/i,/\bbeige\b/i],
  brown:[/\bbrown\b/i,/\bcocoa\b/i,/\bcoffee\b/i,/\bchocolate\b/i,/\bmahogany\b/i],
  olive:[/\bolive\b/i,/\bdrab\b/i,/\bod\b/i],
  dun:[/\bdun\b/i,/\bmedium dun\b/i,/\bdark dun\b/i,/\bblue dun\b/i],
  gray:[/\bgr[ae]y\b/i,/\bslate\b/i,/\bsmoke\b/i,/\bgunmetal\b/i],
  silver:[/\bsilver\b/i,/\bni(c|ck)kel\b/i,/\bchrome\b/i],
  gold:[/\bgold(en)?\b/i,/\bbrass\b/i],
  copper:[/\bcopper\b/i,/\bbronze\b/i],
  pearl:[/\bpearl\b/i,/\bop(al|alescent)\b/i,/\buv pearl\b/i],
  chartreuse:[/\bchartreuse\b/i,/\blime\b/i,/\bfluoro? green\b/i],
  yellow:[/\byellow\b/i,/\bfluoro? yellow\b/i],
  orange:[/\borange\b/i],
  red:[/\bred\b/i,/\bscarlet\b/i,/\bcrimson\b/i],
  pink:[/\bpink\b/i,/\bshrimp\b/i,/\bsalmon\b/i],
  purple:[/\bpurple\b/i,/\bviolet\b/i],
  blue:[/\bblue\b/i,/\broyal\b/i,/\bnavy\b/i],
  green:[/\bgreen\b/i,/\bforest\b/i],
  unknown:[/^$/],
}
const COLOR_NEARNESS: Record<ColorFamily, ColorFamily[]> = {
  black:['gray','silver'], white:['cream','pearl','silver'], cream:['white','tan'],
  tan:['cream','brown','olive'], brown:['tan','olive','dun','gray'],
  olive:['tan','brown','green'], dun:['gray','brown','tan'], gray:['dun','black','silver'],
  silver:['gray','pearl','white'], gold:['copper','tan','brown'], copper:['gold','brown'],
  pearl:['white','silver'], chartreuse:['olive','green','yellow'], yellow:['chartreuse','orange','tan'],
  orange:['yellow','red','brown'], red:['orange','pink','brown'], pink:['red','pearl'],
  purple:['blue'], blue:['purple','gray'], green:['olive','chartreuse'], unknown:[]
}
function normalize(s?: string){ if(!s) return ''; return s.toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim() }
function colorFamily(s?: string): ColorFamily { const t=s??''; for (const fam of Object.keys(COLOR_SYNONYMS) as ColorFamily[]) if (COLOR_SYNONYMS[fam].some(rx=>rx.test(t))) return fam; return 'unknown' }
function extractBeadMM(name?: string){ if(!name) return null; const txt=name.toLowerCase(); const mm=txt.match(/(\d+(?:\.\d+)?)\s*mm/); if(mm) return parseFloat(mm[1]); const inch=txt.match(/(\d+)\/(\d+)\s*(?:in|")?/); if(inch){ const v=parseFloat(inch[1])/parseFloat(inch[2]); return Math.round(v*25.4*10)/10 } return null }
function isBead(name?: string){ return /\bbead\b/i.test(name??'') }
function isThread(name?: string){ return /\bthread\b/i.test(name??'') }
function isHook(name?: string){ return /\bhook\b/i.test(name??'') }
function isWire(name?: string){ return /\bwire\b/i.test(name??'') }
function materialMatchScore(reqName?: string, invName?: string){
  const r=reqName??'', i=invName??''; if(!r||!i) return 0; if(normalize(r)===normalize(i)) return 1
  const rB=isBead(r),iB=isBead(i),rT=isThread(r),iT=isThread(i),rH=isHook(r),iH=isHook(i),rW=isWire(r),iW=isWire(i)
  if(rB&&iB){let s=0.85; const rm=extractBeadMM(r),im=extractBeadMM(i); if(rm&&im){const d=Math.abs(rm-im); if(d<=0.2)s+=0.10; else if(d<=0.5)s+=0.05; else if(d<=1.0)s+=0.02; else s-=0.15}
    const rc=colorFamily(r),ic=colorFamily(i); if(rc===ic)s+=0.05; else if(COLOR_NEARNESS[rc]?.includes(ic)) s+=0.02
    if(/tungsten/i.test(r)!==/tungsten/i.test(i)) s-=0.10; return Math.max(0,Math.min(1,s))}
  if(rT&&iT){let s=0.85; const rc=colorFamily(r),ic=colorFamily(i); if(rc===ic)s+=0.10; else if(COLOR_NEARNESS[rc]?.includes(ic)) s+=0.05; if(/\b70d\b|\b8\/0\b/i.test(r)&&/\b70d\b|\b8\/0\b/i.test(i)) s+=0.02; return Math.max(0,Math.min(1,s))}
  if(rW&&iW){let s=0.85; const rc=colorFamily(r),ic=colorFamily(i); if(rc===ic)s+=0.05; else if(COLOR_NEARNESS[rc]?.includes(ic)) s+=0.02; return Math.max(0,Math.min(1,s))}
  if(rH&&iH) return 0.85
  const rt=new Set(normalize(r).split(' ')), it=new Set(normalize(i).split(' ')), common=[...rt].filter(t=>it.has(t)).length
  return Math.min(0.8, 0.4 + common*0.1)
}

/* ---- types ---- */
interface Material { id?: string | null; name: string; color: string | null }
interface FlyMaterial { required: boolean | null; materials?: Material | null; material_name?: string | null; color?: string | null }
interface Tutorial { url: string; title: string; tutorial_type: string }
interface Fly { id: string; source: 'global'|'user'; name: string; category: string; difficulty?: string | null; sizes?: (number | string)[]; fly_materials?: FlyMaterial[]; tutorials?: Tutorial[] }
interface MatchResult { fly: Fly; canTie: boolean; missingCount: number; missingMaterials: FlyMaterial[] }

export default function DiscoverPage() {
  const [matchResults, setMatchResults] = useState<MatchResult[]>([])
  const [loading, setLoading] = useState(true)
  const [inventorySize, setInventorySize] = useState(0)
  const { user } = useAuth()

  // local caches
  const [userMaterialIds, setUserMaterialIds] = useState<Set<string>>(new Set())
  const [userMaterialNames, setUserMaterialNames] = useState<string[]>([])

  useEffect(() => { if (user) void loadData(); else setLoading(false) }, [user])

  async function loadData() {
    setLoading(true)
    try {
      const { data: auth } = await supabase.auth.getUser()
      const currentUser = auth?.user
      if (!currentUser) { setMatchResults([]); setInventorySize(0); return }

      // INVENTORY
      const { data: inv, error: invErr } = await supabase
        .from('user_inventory')
        .select('material_id, materials ( id, name, color )')
        .eq('user_id', currentUser.id)
      if (invErr) throw invErr

      const { data: aliasRows, error: aliasErr } = await supabase
        .from('user_material_aliases')
        .select('alias_text, material_id')
        .eq('user_id', currentUser.id)
      if (aliasErr) throw aliasErr

      const ids = new Set<string>((inv ?? []).map((r:any)=>r.material_id).filter(Boolean))
      for (const a of aliasRows ?? []) if (a.material_id) ids.add(a.material_id!)
      setUserMaterialIds(ids)

      const names: string[] = [
        ...((inv ?? []).map((r:any)=>r.materials?.name).filter(Boolean) as string[]),
        ...((aliasRows ?? []).map((a:any)=>a.alias_text).filter(Boolean) as string[])
      ]
      setUserMaterialNames(names)
      setInventorySize(ids.size)

      // GLOBAL FLIES
      const { data: gFlies, error: gfErr } = await supabase
        .from('flies')
        .select('id, name, category, difficulty, sizes')
        .order('name')
      if (gfErr) throw gfErr

      const gIds = (gFlies ?? []).map((f:any)=>f.id)
      const { data: gFM, error: gfmErr } = gIds.length ? await supabase
        .from('fly_materials')
        .select('fly_id, required, materials ( id, name, color )')
        .in('fly_id', gIds) : { data: [], error: null as any }
      if (gfmErr) throw gfmErr

      const { data: gTuts, error: gtErr } = gIds.length ? await supabase
        .from('tutorials')
        .select('fly_id, url, title, tutorial_type')
        .in('fly_id', gIds) : { data: [], error: null as any }
      if (gtErr) throw gtErr

      const gFMByFly: Record<string, FlyMaterial[]> = {}
      for (const r of gFM ?? []) {
        const k=(r as any).fly_id
        ;(gFMByFly[k] ||= []).push({
          required: (r as any).required ?? true,
          materials: (r as any).materials ? {
            id: (r as any).materials.id, name: (r as any).materials.name, color: (r as any).materials.color ?? null
          } : undefined
        })
      }
      const gTutByFly: Record<string, Tutorial[]> = {}
      for (const t of gTuts ?? []) {
        const k=(t as any).fly_id
        ;(gTutByFly[k] ||= []).push({ url:(t as any).url, title:(t as any).title, tutorial_type:(t as any).tutorial_type })
      }
      const globals: Fly[] = (gFlies ?? []).map((row:any) => ({
        id: row.id, source: 'global',
        name: row.name, category: row.category, difficulty: row.difficulty, sizes: row.sizes ?? [],
        fly_materials: gFMByFly[row.id] ?? [], tutorials: gTutByFly[row.id] ?? []
      }))

      // USER FLIES
      const { data: uFlies, error: ufErr } = await supabase
        .from('user_flies')
        .select('id, name, category, difficulty, sizes')
        .order('name')
      if (ufErr) throw ufErr

      const uIds = (uFlies ?? []).map((f:any)=>f.id)
      const { data: uFM, error: ufmErr } = uIds.length ? await supabase
        .from('user_fly_materials')
        .select('user_fly_id:fly_id, required, material_id, material_name, color, materials ( id, name, color )')
        .in('user_fly_id', uIds)
        : { data: [] as any[], error: null as any }
      if (ufmErr) throw ufmErr

      const { data: uTuts, error: utErr } = uIds.length ? await supabase
        .from('user_fly_tutorials')
        .select('fly_id, url, title, tutorial_type')
        .in('fly_id', uIds) : { data: [], error: null as any }
      if (utErr) throw utErr

      const uFMByFly: Record<string, FlyMaterial[]> = {}
      for (const r of uFM ?? []) {
        const k=(r as any).fly_id
        const linked=(r as any).materials
        const name = linked?.name ?? (r as any).material_name ?? 'Unknown'
        const color = linked?.color ?? (r as any).color ?? null
        ;(uFMByFly[k] ||= []).push({
          required: (r as any).required ?? true,
          materials: { id: linked?.id ?? null, name, color }
        })
      }
      const uTutByFly: Record<string, Tutorial[]> = {}
      for (const t of uTuts ?? []) {
        const k=(t as any).fly_id
        ;(uTutByFly[k] ||= []).push({ url:(t as any).url, title:(t as any).title, tutorial_type:(t as any).tutorial_type })
      }

      const mine: Fly[] = (uFlies ?? []).map((row:any) => ({
        id: row.id, source: 'user' as const,
        name: row.name, category: row.category, difficulty: row.difficulty,
        sizes: Array.isArray(row.sizes) ? row.sizes : (row.sizes ?? []),
        fly_materials: uFMByFly[row.id] ?? [], tutorials: uTutByFly[row.id] ?? []
      }))

      // Compute matches across GLOBAL + USER
      const flies: Fly[] = [...globals, ...mine]
      const SCORE_OK = 0.80
      const results: MatchResult[] = flies.map((fly) => {
        const req = (fly.fly_materials ?? []).filter((fm) => (fm.required ?? true) === true)
        const missing: FlyMaterial[] = []
        for (const fm of req) {
          const id = fm.materials?.id ?? null
          if (id && ids.has(id)) continue
          const reqName = fm.materials?.name ?? ''
          let best = 0
          for (const invName of names) {
            best = Math.max(best, materialMatchScore(reqName, invName))
            if (best >= 1) break
          }
          if (best < SCORE_OK) missing.push(fm)
        }
        return { fly, canTie: missing.length === 0, missingCount: missing.length, missingMaterials: missing }
      })

      setMatchResults(results)
    } catch (e) {
      console.error('Error loading data:', e)
      alert('Failed to load data.')
    } finally {
      setLoading(false)
    }
  }

  // ----- inventory helpers -----
  async function upsertInventoryById(materialId: string) {
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth?.user?.id
    if (!uid) { alert('Please sign in.'); return }
    const { error } = await supabase
      .from('user_inventory')
      .upsert(
        { user_id: uid, material_id: materialId, quantity: 1, unit: 'pieces' },
        { onConflict: 'user_id,material_id', ignoreDuplicates: true }
      )
    if (error) { console.error(error); alert('Failed to add to inventory.'); return }
  }

  async function addAlias(alias_text: string, material_id?: string | null) {
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth?.user?.id
    if (!uid) { alert('Please sign in.'); return }
    const { error } = await supabase
      .from('user_material_aliases')
      .upsert(
        { user_id: uid, alias_text, material_id: material_id ?? null },
        { onConflict: 'user_id,alias_text', ignoreDuplicates: false }
      )
    if (error) { console.error(error); alert('Failed to save alias.'); return }
  }

  async function addMissingToInventory(fm: FlyMaterial) {
    try {
      const id = fm.materials?.id ?? null
      const label = fm.materials?.name ?? fm.material_name ?? 'Unknown'
      const color = fm.materials?.color ?? fm.color ?? null

      if (id) {
        await upsertInventoryById(id)
        alert(`Added "${label}" to your inventory.`)
      } else {
        // try to resolve to catalog id; fallback to alias text
        const { data, error } = await supabase
          .from('materials')
          .select('id, name')
          .ilike('name', label)
          .limit(1)
        if (error) throw error
        const matchId = data?.[0]?.id ?? null
        if (matchId) {
          await upsertInventoryById(matchId)
          alert(`Added "${label}" to your inventory.`)
        } else {
          await addAlias(color ? `${label} (${color})` : label, null)
          alert(`Saved alias "${label}${color ? ` (${color})` : ''}" to treat as on-hand.`)
        }
      }
      await loadData()
    } catch (e) {
      console.error(e)
      alert('Could not add material.')
    }
  }

  async function addAllMissingForFly(miss: FlyMaterial[]) {
    for (const m of miss) { // serial is fine; keeps alerts readable
      // eslint-disable-next-line no-await-in-loop
      await addMissingToInventory(m)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <Card className="max-w-md">
          <CardHeader><CardTitle>Sign In Required</CardTitle></CardHeader>
          <CardContent><p className="mb-4">You need to sign in to use this feature.</p><Link href="/login"><Button>Sign In</Button></Link></CardContent>
        </Card>
      </div>
    )
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-xl">Analyzing your inventory…</div></div>

  const canTie = matchResults.filter((r) => r.canTie)
  const oneAway = matchResults.filter((r) => r.missingCount === 1)
  const twoAway = matchResults.filter((r) => r.missingCount === 2)
  const threeAway = matchResults.filter((r) => r.missingCount === 3)

  return (
    <div className="min-h-screen p-8 bg-gradient-to-b from-purple-50 to-white">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-5xl font-bold mb-2">What Can I Tie? 🎯</h1>
          <p className="text-gray-600">Based on your inventory of {inventorySize} materials</p>
        </div>

        <div className="flex gap-4 mb-8">
          <Link href="/"><Button variant="outline">← Back to Flies</Button></Link>
          <Link href="/inventory"><Button variant="outline">📦 Manage Inventory</Button></Link>
          <Link href="/unlock"><Button variant="outline">🔓 Unlock</Button></Link>
          <Link href="/compendium"><Button variant="outline">📚 Compendium</Button></Link>
          <Button variant="ghost" onClick={loadData}><RotateCw className="w-4 h-4 mr-1" /> Refresh</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Can Tie Now" value={canTie.length} className="text-green-600" />
          <StatCard label="1 Material Away" value={oneAway.length} className="text-blue-600" />
          <StatCard label="2 Materials Away" value={twoAway.length} className="text-yellow-600" />
          <StatCard label="3 Materials Away" value={threeAway.length} className="text-orange-600" />
        </div>

        <Tabs defaultValue="can-tie">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="can-tie">Can Tie Now ({canTie.length})</TabsTrigger>
            <TabsTrigger value="one-away">1 Away ({oneAway.length})</TabsTrigger>
            <TabsTrigger value="two-away">2 Away ({twoAway.length})</TabsTrigger>
            <TabsTrigger value="three-away">3 Away ({threeAway.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="can-tie" className="mt-6">
            {canTie.length === 0 ? <EmptyState message="No flies yet. Add more materials to your inventory." /> : <FlyGrid results={canTie} showMissing={false} onAddMissing={addMissingToInventory} onAddAll={addAllMissingForFly} />}
          </TabsContent>
          <TabsContent value="one-away" className="mt-6">
            {oneAway.length === 0 ? <EmptyState message="No flies are just one material away." /> : <FlyGrid results={oneAway} showMissing onAddMissing={addMissingToInventory} onAddAll={addAllMissingForFly} />}
          </TabsContent>
          <TabsContent value="two-away" className="mt-6">
            {twoAway.length === 0 ? <EmptyState message="No flies are two materials away." /> : <FlyGrid results={twoAway} showMissing onAddMissing={addMissingToInventory} onAddAll={addAllMissingForFly} />}
          </TabsContent>
          <TabsContent value="three-away" className="mt-6">
            {threeAway.length === 0 ? <EmptyState message="No flies are three materials away." /> : <FlyGrid results={threeAway} showMissing onAddMissing={addMissingToInventory} onAddAll={addAllMissingForFly} />}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

function StatCard({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <Card><CardContent className="pt-6">
      <div className={`text-3xl font-bold ${className ?? ''}`}>{value}</div>
      <div className="text-sm text-gray-600">{label}</div>
    </CardContent></Card>
  )
}

function FlyGrid({
  results, showMissing, onAddMissing, onAddAll
}: {
  results: MatchResult[]
  showMissing: boolean
  onAddMissing: (fm: FlyMaterial) => Promise<void>
  onAddAll: (miss: FlyMaterial[]) => Promise<void>
}) {
  return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{results.map((r) => (
    <FlyCard key={`${r.fly.source}:${r.fly.id}`} result={r} showMissing={showMissing} onAddMissing={onAddMissing} onAddAll={onAddAll} />
  ))}</div>
}

function FlyCard({
  result, showMissing, onAddMissing, onAddAll
}: {
  result: MatchResult
  showMissing: boolean
  onAddMissing: (fm: FlyMaterial) => Promise<void>
  onAddAll: (miss: FlyMaterial[]) => Promise<void>
}) {
  const { fly, canTie, missingMaterials } = result
  const difficulty = (fly.difficulty ?? 'beginner') as string
  const sizes = (Array.isArray(fly.sizes) ? fly.sizes : []).map(String)
  const categoryLabel = (fly.category ?? '').toString().replace(/_/g, ' ')
  const firstTutorial = (fly.tutorials ?? []).find((t) => Boolean(t?.url))
  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex justify-between items-start mb-2">
          <CardTitle className="text-xl">{fly.name}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize">{fly.source}</Badge>
            {canTie && <Badge className="bg-green-500"><Check className="w-3 h-3 mr-1" />Ready!</Badge>}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex gap-2">
            <Badge variant={difficulty === 'beginner' ? 'default' : difficulty === 'intermediate' ? 'secondary' : 'destructive'} className="capitalize">{difficulty}</Badge>
            <Badge variant="outline" className="capitalize">{categoryLabel}</Badge>
          </div>
          {sizes.length > 0 && <div className="text-sm text-gray-600">Sizes: {sizes.join(', ')}</div>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showMissing && (missingMaterials?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <div className="flex items-center text-sm text-red-600"><X className="w-4 h-4 mr-1" /><span className="font-medium">Missing {missingMaterials.length}:</span></div>
            <div className="space-y-1">
              {missingMaterials.map((fm, idx) => {
                const label = fm?.materials?.name ?? fm?.material_name ?? 'Unknown material'
                const color = fm?.materials?.color ?? fm?.color ?? null
                const mid = fm?.materials?.id ?? null
                return (
                  <div key={idx} className="flex items-center justify-between pl-5">
                    <div className="text-sm text-gray-700">• {label}{color ? ` (${color})` : ''}</div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={()=>onAddMissing(fm)}><Plus className="w-4 h-4 mr-1" />{mid ? 'Add to inventory' : 'Save alias'}</Button>
                      <a
                        href={`https://www.madriveroutfitters.com/search?query=${encodeURIComponent(label + (color ? ` ${color}` : ''))}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-sm text-blue-600 underline flex items-center"
                      >
                        <ExternalLink className="w-4 h-4 mr-1" /> Shop
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
            {missingMaterials.length > 1 && (
              <div className="pt-2">
                <Button size="sm" variant="outline" onClick={()=>onAddAll(missingMaterials)}>
                  <Plus className="w-4 h-4 mr-1" /> Add all as you go
                </Button>
              </div>
            )}
          </div>
        )}
        {firstTutorial?.url && (
          <div className="pt-2 border-t">
            <a href={firstTutorial.url} target="_blank" rel="noopener noreferrer" className="flex items-center text-sm text-blue-600 hover:underline">
              <ExternalLink className="w-4 h-4 mr-1" /> Watch Tutorial
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function EmptyState({ message }: { message: string }) {
  return <div className="text-center py-12"><AlertCircle className="w-16 h-16 mx-auto text-gray-400 mb-4" /><p className="text-gray-600 text-lg">{message}</p></div>
}
