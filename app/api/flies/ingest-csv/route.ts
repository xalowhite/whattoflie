// app/api/flies/ingest-csv/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin' // keep this path; adjust only if your lib path differs

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

    const text = await file.text()
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
    if (lines.length < 2) return NextResponse.json({ error: 'empty csv' }, { status: 400 })

    const header = lines.shift()!.split(',').map(s => s.trim().toLowerCase())
    const idxName = header.indexOf('name')
    const idxCat = header.indexOf('category')
    const idxDiff = header.indexOf('difficulty')
    if (idxName === -1) return NextResponse.json({ error: 'CSV must include a "name" column' }, { status: 400 })

    const supabase = supabaseAdmin()
    const results: { name: string; ok: boolean; error?: string }[] = []

    for (const line of lines) {
      const cols = line.split(',')
      const name = cols[idxName]?.trim()
      if (!name) continue
      const category = idxCat >= 0 ? (cols[idxCat]?.trim() || null) : null
      const difficulty = idxDiff >= 0 ? (cols[idxDiff]?.trim() || null) : null

      const { error } = await supabase.rpc('upsert_fly_if_new', {
        p_name: name, p_category: category, p_difficulty: difficulty,
      })
      results.push({ name, ok: !error, error: error?.message })
    }

    return NextResponse.json({ count: results.length, results })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown error' }, { status: 500 })
  }
}
