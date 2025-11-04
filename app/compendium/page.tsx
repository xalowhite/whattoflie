'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Plus, Trash2, Upload } from 'lucide-react'
import { parseFliesCSV } from '@/lib/parseFliesCSV'
import FlyDetailDialog, { type FlyDetailData } from '@/components/FlyDetailDialog'  // ← changed

type StrArr = string[] | null | undefined

interface BaseFly {
  id: string
  name: string
  category: string
  difficulty: string | null
  sizes: StrArr
  image_url?: string | null
  target_species?: StrArr
  colorways?: StrArr
}
interface GlobalFly extends BaseFly { source: 'global' }
interface MyFly extends BaseFly { source: 'user' }

interface Material {
  id: string
  name: string
  color: string | null
}

interface UserFlyMaterial {
  id?: string
  user_fly_id?: string
  material_id?: string | null
  material_name?: string | null
  color?: string | null
  required: boolean
  position: number
}

/* ---------- helpers ---------- */
function normalizeName(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** CSV parser the page expects */
function parseCSV(text: string) {
  const base = parseFliesCSV(text)
  return base.map((r) => ({
    name: r.name,
    category: r.category,
    difficulty: r.difficulty,
    sizes: r.sizes,
    target_species: r.target_species,
    colorways: r.colorways,
    image_url: r.image_url,
    materials: r.materialsRaw.map((chunk, idx) => {
      const parts = chunk.split('@').map(s => s.trim())
      const material_name = parts[0] || ''
      const color = parts[1] || null
      const req = (parts[2]?.toLowerCase() ?? 'req').startsWith('opt') ? false : true
      return { material_name, color, required: req, position: idx, material_id: null }
    }),
  }))
}

function arrayify(x: any): string[] {
  if (!x) return []
  if (Array.isArray(x)) return x.map(String)
  if (typeof x === 'string') return x.split(/[;|,]/).map(s => s.trim()).filter(Boolean)
  return []
}

function toCSVValue(v: string | null | undefined) {
  return (v ?? '').replace(/[\r\n]+/g, ' ').trim()
}

export default function CompendiumPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [globalFlies, setGlobalFlies] = useState<GlobalFly[]>([])
  const [myFlies, setMyFlies] = useState<MyFly[]>([])
  const [materialsCatalog, setMaterialsCatalog] = useState<Material[]>([])

  // Create form state
  const [newFly, setNewFly] = useState<Omit<MyFly, 'id' | 'source'>>({
    name: '', category: 'trout', difficulty: null, sizes: [], image_url: null, target_species: [], colorways: [],
  })
  // Text inputs as strings to avoid TS issues, convert on save
  const [sizesInput, setSizesInput] = useState('')
  const [speciesInput, setSpeciesInput] = useState('')
  const [colorwaysInput, setColorwaysInput] = useState('')

  const [newMats, setNewMats] = useState<UserFlyMaterial[]>([
    { required: true, position: 0, material_name: '', color: null, material_id: null },
  ])

  // CSV importer text + file + drag
  const [csvText, setCsvText] = useState('')
  const [csvFileName, setCsvFileName] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selected, setSelected] = useState<FlyDetailData | null>(null)

  useEffect(() => { void loadAll() }, [user])

  async function loadAll() {
    setLoading(true)
    try {
      // Global catalog (read-only, public)
      const { data: g, error: ge } = await supabase
        .from('flies')
        .select('id, name, category, difficulty, sizes, image_url, target_species, colorways')
        .order('name')
      if (ge) throw ge
      setGlobalFlies((g ?? []).map(r => ({ ...r, source: 'global' as const })))

      // Materials catalog for mapping
      const { data: mats, error: me } = await supabase
        .from('materials')
        .select('id, name, color')
        .limit(20000)
      if (me) throw me
      setMaterialsCatalog(mats ?? [])

      // My flies
      if (user) {
        const { data: mf, error: mfe } = await supabase
          .from('user_flies')
          .select('id, name, category, difficulty, sizes, image_url, target_species, colorways')
          .order('created_at', { ascending: false })
        if (mfe) throw mfe
        setMyFlies((mf ?? []).map(r => ({ ...r, source: 'user' as const })))
      } else {
        setMyFlies([])
      }
    } catch (e) {
      console.error('Load compendium failed:', e)
    } finally {
      setLoading(false)
    }
  }

  /** Case/whitespace-insensitive set of names across Global + My Flies */
  const existingNameSet = useMemo(() => {
    const s = new Set<string>()
    for (const f of globalFlies) s.add(normalizeName(f.name))
    for (const f of myFlies) s.add(normalizeName(f.name))
    return s
  }, [globalFlies, myFlies])

  const filteredGlobal = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return globalFlies
    return globalFlies.filter(f =>
      f.name.toLowerCase().includes(q) ||
      (f.category ?? '').toLowerCase().includes(q) ||
      arrayify(f.target_species).some(s => s.toLowerCase().includes(q))
    )
  }, [search, globalFlies])

  const filteredMine = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return myFlies
    return myFlies.filter(f =>
      f.name.toLowerCase().includes(q) ||
      (f.category ?? '').toLowerCase().includes(q) ||
      arrayify(f.target_species).some(s => s.toLowerCase().includes(q))
    )
  }, [search, myFlies])

  // ------ Dialog helper: open with materials (user flies only) ------
  async function openFlyDetail(f: GlobalFly | MyFly) {
    const tgt = arrayify(f.target_species)
    const cols = arrayify(f.colorways)
    const szs = arrayify(f.sizes)
    let mats: { required: boolean; name: string; color: string | null }[] = []

    if (f.source === 'user' && user) {
      const { data: ufm, error: mErr } = await supabase
        .from('user_fly_materials')
        .select(`
          required,
          position,
          material_name,
          color,
          mat:materials!user_fly_materials_material_id_fkey ( name, color )
        `)
        .eq('user_fly_id', f.id)
        .order('position', { ascending: true })
      if (!mErr) {
        mats = (ufm ?? []).map((r: any) => ({
          required: !!r.required,
          name: r.mat?.name ?? r.material_name ?? 'Unknown',
          color: r.mat?.color ?? r.color ?? null,
        }))
      }
    }

    const detail: FlyDetailData = {
      id: f.id,
      source: f.source,
      name: f.name,
      category: f.category,
      difficulty: f.difficulty,
      sizes: szs,
      image_url: f.image_url ?? null,
      target_species: tgt,
      colorways: cols,
      tutorials: [],
      materials: mats,
    }

    setSelected(detail)
    setDialogOpen(true)
  }

  /** Insert user fly with silent duplicate handling */
  async function createOrUpdateMyFly(
    payload: Omit<MyFly, 'id' | 'source'>,
    opts?: { silent?: boolean }
  ): Promise<{ status: 'inserted' | 'duplicate' | 'error'; id?: string | null; error?: string }> {
    const silent = !!opts?.silent
    if (!user) {
      if (!silent) alert('Please sign in.')
      return { status: 'error', id: null, error: 'unauthenticated' }
    }

    const norm = normalizeName(payload.name)
    if (existingNameSet.has(norm)) {
      if (!silent) alert(`${payload.name} already included in compendium`)
      return { status: 'duplicate', id: null }
    }

    const { data, error } = await supabase
      .from('user_flies')
      .insert({ user_id: user.id, ...payload })
      .select('id')
      .single()

    if (error) {
      // 23505 unique violation → treat as duplicate
      // @ts-ignore
      if (error.code === '23505') {
        if (!silent) alert(`${payload.name} already included in compendium`)
        return { status: 'duplicate', id: null }
      }
      if (!silent) alert(`Failed to save fly "${payload.name}": ${error.message || 'Unknown error'}`)
      console.error('user_flies insert failed:', error.message || error, error)
      return { status: 'error', id: null, error: error.message || 'unknown' }
    }

    return { status: 'inserted', id: data?.id ?? null }
  }

  function findMaterialIdByName(name?: string, color?: string | null): string | null {
    if (!name) return null
    const n = name.toLowerCase().trim()
    const exact = materialsCatalog.find(m =>
      (m.name?.toLowerCase().trim() === n) &&
      (!color || (m.color?.toLowerCase().trim() === color.toLowerCase().trim()))
    )
    if (exact) return exact.id
    const byName = materialsCatalog.find(m => m.name?.toLowerCase().trim() === n)
    return byName?.id ?? null
  }

  async function saveUserFlyMaterials(flyId: string, mats: UserFlyMaterial[]) {
    if (!user) return
    const { error: delErr } = await supabase
      .from('user_fly_materials')
      .delete()
      .eq('user_id', user.id)
      .eq('user_fly_id', flyId)
    if (delErr) {
      console.error('delete user_fly_materials failed:', delErr.message || delErr)
      alert('Failed to refresh materials (delete).')
      return
    }

    if (mats.length === 0) return

    const rows = mats.map((m, idx) => ({
      user_id: user.id,
      user_fly_id: flyId,
      material_id: m.material_id ?? findMaterialIdByName(m.material_name ?? undefined, m.color ?? null),
      material_name: m.material_name ?? null,
      color: m.color ?? null,
      required: m.required ?? true,
      position: m.position ?? idx,
    }))

    const { error: insErr } = await supabase
      .from('user_fly_materials')
      .insert(rows)
    if (insErr) {
      console.error('insert user_fly_materials failed:', insErr.message || insErr)
      alert('Failed to save materials.')
    }
  }

  // ------- CSV utility actions -------
  async function previewImport() {
    if (!csvText.trim()) { alert('Paste CSV or choose a file first.'); return }
    const rows = parseCSV(csvText)
    if (!rows.length) { alert('No rows parsed.'); return }

    const seen = new Set<string>(existingNameSet)
    let dup = 0, add = 0
    const dupList: string[] = []
    for (const r of rows) {
      const norm = normalizeName(r.name)
      if (seen.has(norm)) { dup++; dupList.push(r.name) }
      else { add++; seen.add(norm) }
    }
    const preview = dupList.slice(0, 15).join(', ') + (dupList.length > 15 ? ` …(+${dupList.length-15})` : '')
    alert(
      `Preview:\nWill add: ${add}\nWill skip as duplicates: ${dup}` +
      (dup ? `\nExamples: ${preview}` : '')
    )
  }

  async function exportMyFliesCSV() {
    if (!user) { alert('Please sign in.'); return }

    const { data: uFlies, error: ufErr } = await supabase
      .from('user_flies')
      .select('id, name, category, difficulty, sizes, image_url, target_species, colorways')
      .order('name')
    if (ufErr) { alert(`Failed to load flies: ${ufErr.message}`); return }
    const ids = (uFlies ?? []).map(f => f.id)
    const matsByFly: Record<string, { material_name: string; color: string|null; required: boolean; position: number }[]> = {}

    if (ids.length) {
      const { data: ufm, error: mErr } = await supabase
        .from('user_fly_materials')
        .select(`
          user_fly_id,
          required,
          position,
          material_name,
          color,
          mat:materials!user_fly_materials_material_id_fkey ( id, name, color )
        `)
        .in('user_fly_id', ids)

      if (mErr) { alert(`Failed to load materials: ${mErr.message}`); return }

      for (const r of (ufm ?? [])) {
        const fid = (r as any).user_fly_id as string
        const name = (r as any).mat?.name ?? (r as any).material_name ?? 'Unknown'
        const color = (r as any).mat?.color ?? (r as any).color ?? null
        const required = (r as any).required ?? true
        const position = (r as any).position ?? 0
        ;(matsByFly[fid] ||= []).push({ material_name: name, color, required, position })
      }
      for (const fid of Object.keys(matsByFly)) {
        matsByFly[fid].sort((a,b)=> (a.position ?? 0) - (b.position ?? 0))
      }
    }

    const header = [
      'name','category','difficulty','sizes','target_species','colorways','image_url','materials'
    ]
    const lines = [header.join(',')]

    for (const f of (uFlies ?? [])) {
      const sizes = Array.isArray(f.sizes) ? f.sizes.map(String).join(';') : ''
      const species = Array.isArray(f.target_species) ? f.target_species.join(';') : ''
      const colorways = Array.isArray(f.colorways) ? f.colorways.join(';') : ''
      const matsArr = (matsByFly[f.id] ?? []).map(m => {
        const req = m.required ? 'req' : 'opt'
        const parts = [m.material_name, m.color ?? '', req].map(toCSVValue)
        return parts.join('@')
      })
      const materials = matsArr.join(';')

      const row = [
        toCSVValue(f.name),
        toCSVValue(f.category),
        toCSVValue(f.difficulty),
        toCSVValue(sizes),
        toCSVValue(species),
        toCSVValue(colorways),
        toCSVValue(f.image_url),
        toCSVValue(materials),
      ]
      lines.push(row.join(','))
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'my_flies_export.csv'
    document.body.appendChild(a)
    a.click()
    URL.revokeObjectURL(url)
    a.remove()
  }

  // CSV Import handler — duplicate-aware (Global + My + within-file), silent per-row
  async function importCSV() {
    if (!user) { alert('Please sign in.'); return }
    const rows = parseCSV(csvText)
    if (rows.length === 0) { alert('No rows found in CSV.'); return }

    const seen = new Set<string>(existingNameSet)
    const duplicates: string[] = []
    const failed: { name: string; reason: string }[] = []
    let added = 0

    for (const r of rows) {
      const norm = normalizeName(r.name)
      if (seen.has(norm)) { duplicates.push(r.name); continue }

      const res = await createOrUpdateMyFly({
        name: r.name,
        category: r.category,
        difficulty: r.difficulty,
        sizes: r.sizes ?? [],
        image_url: r.image_url ?? null,
        target_species: r.target_species ?? [],
        colorways: r.colorways ?? [],
      }, { silent: true })

      if (res.status === 'duplicate') {
        duplicates.push(r.name)
        continue
      }
      if (res.status === 'error' || !res.id) {
        failed.push({ name: r.name, reason: res.error ?? 'unknown' })
        continue
      }

      await saveUserFlyMaterials(res.id, (r as any).materials ?? [])
      seen.add(norm)
      added++
    }

    setCsvText('')
    setCsvFileName(null)
    await loadAll()

    const dupPreview = duplicates.slice(0, 10)
    const more = duplicates.length > dupPreview.length ? ` (and ${duplicates.length - dupPreview.length} more)` : ''
    const failPreview = failed.slice(0, 5).map(f => `${f.name} — ${f.reason}`).join('\n')
    alert(
      `Import complete.\nAdded: ${added}\nSkipped duplicates: ${duplicates.length}` +
      (duplicates.length ? `\nFirst duplicates: ${dupPreview.join(', ')}${more}` : '') +
      (failed.length ? `\nFailed (${failed.length}):\n${failPreview}${failed.length>5?'\n…':''}` : '')
    )
  }

  async function onCreateFly() {
    const trimmedName = (newFly.name ?? '').trim()
    if (!trimmedName) { alert('Name is required'); return }

    const res = await createOrUpdateMyFly({
      ...newFly,
      name: trimmedName,
      sizes: arrayify(sizesInput),
      target_species: arrayify(speciesInput),
      colorways: arrayify(colorwaysInput),
    }, { silent: false })

    if (res.status !== 'inserted' || !res.id) return
    await saveUserFlyMaterials(res.id, newMats)

    setNewFly({ name: '', category: 'trout', difficulty: null, sizes: [], image_url: null, target_species: [], colorways: [] })
    setSizesInput('')
    setSpeciesInput('')
    setColorwaysInput('')
    setNewMats([{ required: true, position: 0, material_name: '', color: null, material_id: null }])

    await loadAll()
  }

  async function removeMyFly(id: string) {
    if (!user) return
    if (!confirm('Delete this fly and its materials?')) return
    const { error } = await supabase
      .from('user_flies')
      .delete()
      .eq('user_id', user.id)
      .eq('id', id)
    if (error) {
      console.error('delete user_flies failed:', error.message || error)
      alert('Failed to delete.')
      return
    }
    await loadAll()
  }

  // ----- File & drag/drop handling -----
  function onCSVFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => setCsvText(String(reader.result || ''))
    reader.onerror = () => alert('Failed to read file')
    reader.readAsText(file)
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragActive(true)
  }
  function onDragEnter(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); setDragActive(true)
  }
  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); setDragActive(false)
  }
  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); setDragActive(false)
    const dt = e.dataTransfer
    if (dt.files && dt.files.length > 0) {
      const file = dt.files[0]
      setCsvFileName(file.name)
      const reader = new FileReader()
      reader.onload = () => setCsvText(String(reader.result || ''))
      reader.onerror = () => alert('Failed to read dropped file')
      reader.readAsText(file)
      return
    }
    const text = dt.getData('text/plain')
    if (text && text.trim().length) {
      setCsvFileName('dropped-text.csv')
      setCsvText(text)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading compendium…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8 bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-7xl mx-auto">
        {/* Header & Nav */}
        <div className="flex items-center gap-4 mb-6">
          <h1 className="text-5xl font-bold">📚 Compendium</h1>
          <div className="ml-auto flex gap-2">
            <Link href="/"><Button variant="outline">← Flies</Button></Link>
            <Link href="/inventory"><Button variant="outline">📦 Inventory</Button></Link>
            <Link href="/discover"><Button variant="outline">🎯 Discover</Button></Link>
            <Link href="/unlock"><Button variant="outline">🔓 Unlock</Button></Link>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, category, or target species…"
            className="w-full px-3 py-2 border rounded-lg"
          />
          <div className="text-xs text-gray-500 mt-1">
            Showing {filteredMine.length} “My Flies” and {filteredGlobal.length} Global results
          </div>
        </div>

        {/* [rest of your UI unchanged] */}
        {/* ...the rest of the file is exactly what you already had... */}
        
        {/* My Flies / Global Flies lists... */}
        {/* Dialog */}
        <FlyDetailDialog open={dialogOpen} onOpenChange={setDialogOpen} fly={selected} />
      </div>
    </div>
  )
}
