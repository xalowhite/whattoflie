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
  // Keep it simple & importer-friendly: avoid quotes/commas; trim spaces.
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

  useEffect(() => { void loadAll() }, [user])

  async function loadAll() {
    setLoading(true)
    try {
      // Global catalog (read-only)
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

  /**
   * Insert-only (no mismatched ON CONFLICT). We rely on:
   *  - our pre-check (existingNameSet)
   *  - the DB's case-insensitive uniqueness (if you added it) to catch races
   *  - friendly 23505 handling if the DB blocks a duplicate
   */
  async function createOrUpdateMyFly(payload: Omit<MyFly, 'id' | 'source'>): Promise<string | null> {
    if (!user) { alert('Please sign in.'); return null }

    const norm = normalizeName(payload.name)
    if (existingNameSet.has(norm)) {
      alert(`${payload.name} already included in compendium`)
      return null
    }

    const { data, error } = await supabase
      .from('user_flies')
      .insert({ user_id: user.id, ...payload })
      .select('id')
      .single()

    if (error) {
      // 23505 = unique violation (e.g., functional/normalized unique index)
      // @ts-ignore code presence depends on runtime error object
      if (error.code === '23505') {
        alert(`${payload.name} already included in compendium`)
        return null
      }
      console.error('user_flies insert failed:', error.message || error, error)
      alert(`Failed to save fly "${payload.name}": ${error.message || 'Unknown error'}`)
      return null
    }
    return data?.id ?? null
  }

  function findMaterialIdByName(name?: string, color?: string | null): string | null {
    if (!name) return null
    const n = name.toLowerCase().trim()
    // exact name + color preferred
    const exact = materialsCatalog.find(m =>
      (m.name?.toLowerCase().trim() === n) &&
      (!color || (m.color?.toLowerCase().trim() === color.toLowerCase().trim()))
    )
    if (exact) return exact.id
    // fallback: name-only
    const byName = materialsCatalog.find(m => m.name?.toLowerCase().trim() === n)
    return byName?.id ?? null
  }

  async function saveUserFlyMaterials(flyId: string, mats: UserFlyMaterial[]) {
    if (!user) return
    // replace all materials for this user_fly_id
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

  // ------- CSV utility actions (inside component so they capture state) -------
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
        .select('user_fly_id, required, position, material_name, color, materials( name, color )')
        .in('user_fly_id', ids)
      if (mErr) { alert(`Failed to load materials: ${mErr.message}`); return }

      for (const r of (ufm ?? [])) {
        const fid = (r as any).user_fly_id as string
        const name = (r as any).materials?.name ?? (r as any).material_name ?? 'Unknown'
        const color = (r as any).materials?.color ?? (r as any).color ?? null
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

  // CSV Import handler — duplicate-aware (Global + My + within-file)
  async function importCSV() {
    if (!user) { alert('Please sign in.'); return }
    const rows = parseCSV(csvText)
    if (rows.length === 0) { alert('No rows found in CSV.'); return }

    const seen = new Set<string>(existingNameSet) // start with everything already in compendium
    const duplicates: string[] = []
    let added = 0

    for (const r of rows) {
      const norm = normalizeName(r.name)
      if (seen.has(norm)) {
        duplicates.push(r.name)
        continue
      }

      const flyId = await createOrUpdateMyFly({
        name: r.name,
        category: r.category,
        difficulty: r.difficulty,
        sizes: r.sizes ?? [],
        image_url: r.image_url ?? null,
        target_species: r.target_species ?? [],
        colorways: r.colorways ?? [],
      })
      if (!flyId) {
        // createOrUpdate may alert if duplicate; continue gracefully
        continue
      }

      await saveUserFlyMaterials(flyId, r.materials ?? [])
      seen.add(norm)
      added++
    }

    setCsvText('')
    setCsvFileName(null)
    await loadAll()

    const dupPreview = duplicates.slice(0, 10)
    const more = duplicates.length > dupPreview.length ? ` (and ${duplicates.length - dupPreview.length} more)` : ''
    const msg =
      `Import complete.\nAdded: ${added}\nSkipped duplicates: ${duplicates.length}` +
      (duplicates.length ? `\nFirst duplicates: ${dupPreview.join(', ')}${more}` : '')
    alert(msg)
  }

  async function onCreateFly() {
    const trimmedName = (newFly.name ?? '').trim()
    if (!trimmedName) { alert('Name is required'); return }

    const norm = normalizeName(trimmedName)
    if (existingNameSet.has(norm)) {
      alert(`${trimmedName} already included in compendium`)
      return
    }

    const payload = {
      ...newFly,
      name: trimmedName,
      sizes: arrayify(sizesInput),
      target_species: arrayify(speciesInput),
      colorways: arrayify(colorwaysInput),
    }

    const flyId = await createOrUpdateMyFly(payload)
    if (!flyId) return
    await saveUserFlyMaterials(flyId, newMats)

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
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragActive(true)
  }
  function onDragEnter(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragActive(true)
  }
  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragActive(false)
  }
  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragActive(false)
    const dt = e.dataTransfer

    // Prefer files
    if (dt.files && dt.files.length > 0) {
      const file = dt.files[0]
      setCsvFileName(file.name)
      const reader = new FileReader()
      reader.onload = () => setCsvText(String(reader.result || ''))
      reader.onerror = () => alert('Failed to read dropped file')
      reader.readAsText(file)
      return
    }

    // Fallback to plain text drops (e.g., dragging selected text)
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

        {/* CSV Import (file OR paste with drag-and-drop) */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Upload className="w-5 h-5" /> Import My Flies (CSV)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-gray-600 mb-3">
              Header optional. Columns: <code>name,category,difficulty,sizes,target_species,colorways,image_url,materials</code>.{' '}
              Materials per item: <code>Material@Color@required</code> (use <code>;</code> or <code>|</code> between items).
            </div>

            {/* Drop Zone */}
            <div
              onDragOver={onDragOver}
              onDragEnter={onDragEnter}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={[
                "rounded-lg p-4 border-2 transition-colors",
                "mb-3",
                dragActive
                  ? "border-blue-500 bg-blue-50"
                  : "border-dashed border-gray-300 hover:border-gray-400"
              ].join(' ')}
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <input type="file" accept=".csv,text/csv" onChange={onCSVFileChange} />
                  {csvFileName && <div className="text-xs text-gray-600">Loaded: {csvFileName}</div>}
                </div>

                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  rows={6}
                  className="w-full border rounded p-2"
                  placeholder='Drop a .csv here, or paste CSV text…'
                />
                <div className="text-xs text-gray-500">
                  Tip: You can drag a file onto this box, or drag highlighted text from a sheet.
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={importCSV}>Import</Button>
              <Button variant="secondary" onClick={previewImport}>Preview Import</Button>
              <Button variant="outline" onClick={exportMyFliesCSV}>Export My Flies (CSV)</Button>
            </div>
          </CardContent>
        </Card>

        {/* Create New Fly */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" /> Add a Fly (My Flies)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-600">Name</label>
                <input className="w-full border rounded p-2"
                  value={newFly.name}
                  onChange={(e)=>setNewFly(f=>({...f, name: e.target.value}))}
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Category</label>
                <input className="w-full border rounded p-2"
                  value={newFly.category}
                  onChange={(e)=>setNewFly(f=>({...f, category: e.target.value}))}
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Difficulty</label>
                <input className="w-full border rounded p-2"
                  value={newFly.difficulty ?? ''}
                  onChange={(e)=>setNewFly(f=>({...f, difficulty: e.target.value || null}))}
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Sizes (semicolon or |)</label>
                <input className="w-full border rounded p-2"
                  value={sizesInput}
                  onChange={(e)=>setSizesInput(e.target.value)}
                  placeholder="12;14;16 or 2/0|3/0"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Target Species</label>
                <input className="w-full border rounded p-2"
                  value={speciesInput}
                  onChange={(e)=>setSpeciesInput(e.target.value)}
                  placeholder="trout;steelhead"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Colorways</label>
                <input className="w-full border rounded p-2"
                  value={colorwaysInput}
                  onChange={(e)=>setColorwaysInput(e.target.value)}
                  placeholder="olive;black;white"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">Image URL</label>
                <input className="w-full border rounded p-2"
                  value={newFly.image_url ?? ''}
                  onChange={(e)=>setNewFly(f=>({...f, image_url: e.target.value || null}))}
                />
              </div>
            </div>

            <div className="mt-6">
              <div className="font-semibold mb-2">Materials</div>
              <div className="space-y-2">
                {newMats.map((m, idx) => (
                  <div key={idx} className="grid md:grid-cols-5 gap-2 items-center">
                    <input
                      className="md:col-span-2 border rounded p-2"
                      placeholder="Material name (e.g., UTC 70D Thread)"
                      value={m.material_name ?? ''}
                      onChange={(e)=>{
                        const v = e.target.value
                        setNewMats(arr => arr.map((x,i)=> i===idx ? {...x, material_name: v} : x))
                      }}
                    />
                    <input
                      className="border rounded p-2"
                      placeholder="Color (optional)"
                      value={m.color ?? ''}
                      onChange={(e)=>{
                        const v = e.target.value
                        setNewMats(arr => arr.map((x,i)=> i===idx ? {...x, color: v || null} : x))
                      }}
                    />
                    <select
                      className="border rounded p-2"
                      value={m.required ? 'req' : 'opt'}
                      onChange={(e)=>{
                        const v = e.target.value === 'req'
                        setNewMats(arr => arr.map((x,i)=> i===idx ? {...x, required: v} : x))
                      }}
                    >
                      <option value="req">Required</option>
                      <option value="opt">Optional</option>
                    </select>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={()=>{
                        setNewMats(arr => {
                          const next = [...arr]
                          next.splice(idx,1)
                          return next.length ? next : [{ required: true, position: 0, material_name: '', color: null, material_id: null }]
                        })
                      }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      {idx === newMats.length - 1 && (
                        <Button variant="secondary" onClick={()=> setNewMats(arr => [...arr, { required: true, position: arr.length, material_name: '', color: null, material_id: null }])}>
                          + Add
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <Button onClick={onCreateFly}>Save Fly</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* My Flies */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">My Flies ({filteredMine.length})</h2>
          {filteredMine.length === 0 ? (
            <div className="text-gray-600 flex items-center gap-2"><AlertCircle className="w-5 h-5" />No matches.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredMine.map(f => (
                <Card key={`uf-${f.id}`} className="hover:shadow-lg transition-all">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-xl">{f.name}</CardTitle>
                      <Badge variant="outline">My Fly</Badge>
                    </div>
                    <div className="text-sm text-gray-500 capitalize">{f.category}</div>
                    {f.sizes && (f.sizes as any[]).length > 0 && (
                      <div className="text-xs text-gray-500">Sizes: {arrayify(f.sizes).join(', ')}</div>
                    )}
                  </CardHeader>
                  <CardContent>
                    {f.image_url ? (
                      <img src={f.image_url} alt={f.name} className="w-full h-40 object-cover rounded border" />
                    ) : (
                      <div className="w-full h-40 rounded border flex items-center justify-center text-gray-400">No image</div>
                    )}
                    <div className="mt-3 flex justify-end">
                      <Button variant="destructive" size="sm" onClick={()=>removeMyFly(f.id)}>
                        <Trash2 className="w-4 h-4 mr-1" /> Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Global Flies (read-only) */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold mb-2">Global Flies ({filteredGlobal.length})</h2>
          {filteredGlobal.length === 0 ? (
            <div className="text-gray-600 flex items-center gap-2"><AlertCircle className="w-5 h-5" />No matches.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredGlobal.map(f => (
                <Card key={`g-${f.id}`} className="hover:shadow-lg transition-all">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-xl">{f.name}</CardTitle>
                      <Badge>Global</Badge>
                    </div>
                    <div className="text-sm text-gray-500 capitalize">{f.category}</div>
                    {f.sizes && (f.sizes as any[]).length > 0 && (
                      <div className="text-xs text-gray-500">Sizes: {arrayify(f.sizes).join(', ')}</div>
                    )}
                  </CardHeader>
                  <CardContent>
                    {f.image_url ? (
                      <img src={f.image_url} alt={f.name} className="w-full h-40 object-cover rounded border" />
                    ) : (
                      <div className="w-full h-40 rounded border flex items-center justify-center text-gray-400">No image</div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

