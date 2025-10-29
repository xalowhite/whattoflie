import { createClient } from '@supabase/supabase-js'
export const supabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('Supabase admin env vars missing')
  return createClient(url, key, { auth: { persistSession: false } })
}
