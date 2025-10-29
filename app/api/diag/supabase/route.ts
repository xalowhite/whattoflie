// app/api/diag/supabase/route.ts
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const out: any = { url, hasAnon: !!anon, checks: {} }

  async function ping(name: string, path: string) {
    try {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 5000)
      const res = await fetch(`${url}${path}`, {
        headers: { apikey: anon || '', Authorization: `Bearer ${anon || ''}` },
        signal: controller.signal,
      })
      clearTimeout(t)
      out.checks[name] = { ok: res.ok, status: res.status }
    } catch (e: any) {
      out.checks[name] = { ok: false, error: String(e?.message || e) }
    }
  }

  if (url) {
    await ping('auth_health', '/auth/v1/health') // should be 200 when URL/key are good
    await ping('rest_root',  '/rest/v1/')        // often 404; that’s fine, host is reachable
  }

  return NextResponse.json(out)
}
