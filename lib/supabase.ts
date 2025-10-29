// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (typeof window !== 'undefined') {
  // Only warn in browser to help debug Vercel/PC issues
  if (!url || !key) {
    console.warn(
      '[whattoflie] Supabase env missing. ' +
      'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment.'
    )
  }
}

export const supabase = createClient(url ?? '', key ?? '')
