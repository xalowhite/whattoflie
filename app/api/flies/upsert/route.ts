// app/api/flies/upsert/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function normalizeName(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { name, category, difficulty } = await req.json()
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name required' }, { status: 400 })
    }

    const supabase = supabaseAdmin()
    const norm = normalizeName(name)

    const pre = await supabase.from('flies').select('id').eq('normalized_name', norm).maybeSingle()
    const existedBefore = !!pre.data

    const { data, error } = await supabase.rpc('upsert_fly_if_new', {
      p_name: name,
      p_category: category ?? null,
      p_difficulty: difficulty ?? null,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ fly: data, existed: existedBefore })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown error' }, { status: 500 })
  }
}
