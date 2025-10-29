'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Material {
  id: string
  name: string
  material_type_id: string
  color: string | null
  brand: string | null
}
interface InventoryItem {
  id: string
  material_id: string
  quantity: number
  unit: string
  materials: Material
}

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)

  // NEW: separate searches for your materials vs. catalog
  const [invSearch, setInvSearch] = useState('')
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(100)

  useEffect(() => { void loadAll() }, [])

  async function loadAll() {
    try { setLoading(true); await Promise.all([loadInventory(), loadMaterials()]) }
    finally { setLoading(false) }
  }

  async function loadInventory() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setInventory([]); return }
      const { data, error } = await supabase
        .from('user_inventory')
        .select('*, materials (*)')
        .eq('user_id', user.id)
      if (error) throw error
      setInventory(data || [])
    } catch (error) {
      console.error('Error loading inventory:', error)
    }
  }

  async function loadMaterials() {
    try {
      const { data, error } = await supabase.from('materials').select('*').order('name')
      if (error) throw error
      setMaterials(data || [])
    } catch (error) {
      console.error('Error loading materials:', error)
    }
  }

  async function addMaterial(materialId: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { alert('Please log in first!'); return }
      const { error } = await supabase
        .from('user_inventory')
        .upsert(
          { user_id: user.id, material_id: materialId, quantity: 1, unit: 'pieces' },
          { onConflict: 'user_id,material_id', ignoreDuplicates: true }
        )
      if (error) throw error
      await loadInventory()
    } catch (err: any) {
      console.error('Error adding material:', err)
      alert(`Error adding material: ${err?.message || 'Unknown error'}`)
    }
  }

  async function removeMaterial(id: string) {
    try {
      const { error } = await supabase.from('user_inventory').delete().eq('id', id)
      if (error) throw error
      await loadInventory()
    } catch (error) {
      console.error('Error removing material:', error)
    }
  }

  // ---- CSV alias importer (top) ----
  function parseCSV(text: string): string[] {
    return text
      .split(/\r?\n/)
      .flatMap(line => line.split(','))
      .map(s => s.trim())
      .filter(Boolean)
  }

  function deriveFields(alias: string){
    const s = alias.toLowerCase()
    const derived_type =
      /\bhook\b/.test(s) ? 'hook' :
      /\bthread\b/.test(s) ? 'thread' :
      /\bbead\b/.test(s) ? 'bead' :
      /\bwire\b/.test(s) ? 'wire' : undefined
    const derived_weight_class =
      /tungsten|wt\b/.test(s) ? 'tungsten' :
      /brass/.test(s) ? 'brass' : undefined
    const derived_finish =
      /nickel|silver|chrome/.test(s) ? 'nickel/silver' :
      /gold|brass/.test(s) ? 'gold/brass' :
      /black|gunmetal/.test(s) ? 'black' : undefined
    const derived_color_family =
      /black|gunmetal|blk/.test(s) ? 'black' :
      /white|wht/.test(s) ? 'white' :
      /tan|khaki|beige|camel/.test(s) ? 'tan' :
      /brown|cocoa|chocolate/.test(s) ? 'brown' :
      /olive|od|drab/.test(s) ? 'olive' :
      /gray|grey|slate|smoke/.test(s) ? 'gray' :
      /gold|brass/.test(s) ? 'gold' :
      /nickel|silver|chrome/.test(s) ? 'silver' :
      /copper|bronze/.test(s) ? 'copper' :
      /pearl|opalescent/.test(s) ? 'pearl' :
      /chartreuse|lime/.test(s) ? 'chartreuse' :
      /yellow/.test(s) ? 'yellow' :
      /orange/.test(s) ? 'orange' :
      /red|scarlet|crimson/.test(s) ? 'red' :
      /pink|salmon/.test(s) ? 'pink' :
      /purple|violet/.test(s) ? 'purple' :
      /blue|royal|navy/.test(s) ? 'blue' :
      /green|forest/.test(s) ? 'green' : undefined

    let derived_size_value: number | undefined
    let derived_size_unit: string | undefined
    const mm = s.match(/(\d+(?:\.\d+)?)\s*mm/)
    const frac = s.match(/(\d+)\/(\d+)\s*(?:in|")?/)
    if (mm) { derived_size_value = parseFloat(mm[1]); derived_size_unit = 'mm' }
    else if (frac) { derived_size_value = Math.round((+frac[1]/+frac[2])*25.4*10)/10; derived_size_unit = 'mm' }

    return { derived_type, derived_color_family, derived_size_value, derived_size_unit, derived_weight_class, derived_finish }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-xl">Loading inventory...</div></div>
  }

  // Filters
  const invQ = invSearch.toLowerCase().trim()
  const filteredInventory = inventory.filter((it) => {
    const n = (it.materials?.name ?? '').toLowerCase()
    const c = (it.materials?.color ?? '').toLowerCase()
    if (!invQ) return true
    return n.includes(invQ) || c.includes(invQ)
  })

  const q = search.toLowerCase().trim()
  const filtered = materials.filter((m) => {
    if (!q) return true
    return (m.name ?? '').toLowerCase().includes(q) || (m.color ?? '').toLowerCase().includes(q)
  })

  return (
    <div className="min-h-screen p-8 bg-gradient-to-b from-green-50 to-white">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-5xl font-bold mb-2">Material Inventory</h1>
        <p className="text-gray-600 mb-8">Track what you have in your tying desk</p>

        {/* Nav */}
        <div className="flex gap-4 mb-8">
          <Link href="/"><button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">← Back to Flies</button></Link>
          <Link href="/discover"><button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">🎯 What Can I Tie?</button></Link>
          <Link href="/unlock"><button className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700">🔓 Unlock</button></Link>
          <Link href="/compendium"><button className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900">📚 Compendium</button></Link>
        </div>

        {/* CSV / Custom Alias Importer (TOP) */}
        <Card className="mb-8">
          <CardHeader><CardTitle>Import Materials (CSV or one per line)</CardTitle></CardHeader>
          <CardContent>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                const ta = (e.currentTarget.querySelector('textarea[name="csv"]') as HTMLTextAreaElement)
                const items = parseCSV(ta.value)
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) { alert('Please log in first'); return }
                for (const alias_text of items) {
                  const derived = deriveFields(alias_text)
                  await supabase
                    .from('user_material_aliases')
                    .upsert(
                      { user_id: user.id, alias_text, ...derived },
                      { onConflict: 'user_id,alias_text', ignoreDuplicates: true }
                    )
                }
                ta.value = ''
                alert('Imported! These aliases will be considered in Discover and Unlock.')
              }}
            >
              <textarea
                name="csv"
                rows={5}
                className="w-full border rounded p-2 mb-2"
                placeholder={`Examples:\nMFC 3/16" Brass Slotted Bead - Nickel\nUTC 70D Thread - Brown\nKrystal Flash - Pearl`}
              />
              <Button type="submit">Import</Button>
            </form>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Your Materials (with search) */}
          <Card>
            <CardHeader>
              <CardTitle>Your Materials ({filteredInventory.length}/{inventory.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3">
                <input
                  value={invSearch}
                  onChange={(e) => setInvSearch(e.target.value)}
                  placeholder="Search your materials by name or color…"
                  className="w-full px-3 py-2 border rounded-lg"
                />
                <div className="mt-1 text-xs text-gray-500">
                  Showing {filteredInventory.length} of {inventory.length}
                </div>
              </div>

              {filteredInventory.length === 0 ? (
                <p className="text-gray-500">No materials match your search.</p>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {filteredInventory.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 border rounded hover:bg-gray-50"
                    >
                      <div>
                        <p className="font-medium">{item.materials?.name ?? 'Unknown'}</p>
                        {item.materials?.color && (
                          <p className="text-sm text-gray-500">{item.materials.color}</p>
                        )}
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeMaterial(item.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Available Materials (catalog) */}
          <Card>
            <CardHeader><CardTitle>Available Materials ({filtered.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="mb-3">
                <input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setVisibleCount(100) }}
                  placeholder="Search catalog by name or color…"
                  className="w-full px-3 py-2 border rounded-lg"
                />
                <div className="mt-1 text-xs text-gray-500">
                  Showing {Math.min(filtered.length, visibleCount)} of {filtered.length}
                </div>
              </div>

              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {filtered.slice(0, visibleCount).map((material) => (
                  <div
                    key={material.id}
                    className="flex items-center justify-between p-3 border rounded hover:bg-gray-50"
                  >
                    <div>
                      <p className="font-medium">{material.name}</p>
                      {material.color && (
                        <p className="text-sm text-gray-500">{material.color}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => addMaterial(material.id)}
                      disabled={inventory.some((i) => i.material_id === material.id)}
                    >
                      {inventory.some((i) => i.material_id === material.id) ? 'Added' : 'Add'}
                    </Button>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div className="text-sm text-gray-500">No materials match your search.</div>
                )}
              </div>

              {visibleCount < filtered.length && (
                <div className="mt-3">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setVisibleCount((v) => v + 100)}
                  >
                    Load 100 more
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
