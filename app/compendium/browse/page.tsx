'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type Fly = {
  id: string
  name: string
  category: string | null
  sizes?: number[] | null
  difficulty?: string | null
  image_url?: string | null
  normalized_name?: string | null
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function normalizeName(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export default function BrowseCompendium() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Fly[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const pageSize = 24

  const norm = useMemo(() => normalizeName(q), [q])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      const from = page * pageSize
      const to = from + pageSize - 1

      // If query is empty, just list alphabetically
      const query = supabase
        .from('flies')
        .select('id,name,category,sizes,difficulty,image_url,normalized_name')
        .order('name', { ascending: true })
        .range(from, to)

      const { data, error } =
        norm.length > 0
          ? await query.ilike('normalized_name', `%${norm}%`)
          : await query

      if (!cancelled) {
        if (error) {
          console.error(error)
          setRows([])
        } else {
          setRows(data || [])
        }
        setLoading(false)
      }
    }, 300) // debounce

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [norm, page])

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Input
          placeholder="Search flies (e.g., zebra midge, bugger, etc.)"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(0)
          }}
        />
        <Button variant="secondary" onClick={() => { setQ(''); setPage(0) }}>
          Clear
        </Button>
      </div>

      <div className="text-sm opacity-70">
        Showing {rows.length} {rows.length === 1 ? 'result' : 'results'} {q && <>for “{q}”</>}
      </div>

      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
        {rows.map((f) => (
          <Card key={f.id} className="rounded-2xl">
            <CardContent className="p-4">
              <div className="font-semibold text-lg">{f.name}</div>
              <div className="text-sm opacity-80">
                {f.category || '—'} · {f.difficulty || '—'}
              </div>
              {Array.isArray(f.sizes) && f.sizes.length > 0 && (
                <div className="text-sm mt-1">Sizes: {f.sizes.join(', ')}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-center gap-3 pt-2">
        <Button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || loading}>
          Prev
        </Button>
        <div className="text-sm opacity-70">Page {page + 1}</div>
        <Button onClick={() => setPage((p) => p + 1)} disabled={rows.length < pageSize || loading}>
          Next
        </Button>
      </div>
    </main>
  )
}
