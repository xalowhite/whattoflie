'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Check, Copy, RefreshCw, X } from 'lucide-react'

type Status = 'unknown' | 'pass' | 'fail' | 'warn'

type CheckResult = {
  key: string
  label: string
  status: Status
  detail?: string
}

const INITIAL: CheckResult[] = [
  { key: 'materials_read', label: 'Public read on public.materials', status: 'unknown' },
  { key: 'groups_read', label: 'Public read on public.material_groups', status: 'unknown' },
  { key: 'materials_normalized', label: 'Column public.materials.normalized_name exists', status: 'unknown' },
  { key: 'materials_search_col', label: 'Column public.materials.search (tsvector) exists', status: 'unknown' },
  { key: 'materials_textsearch', label: 'Full-text search works on materials.search', status: 'unknown' },
]

const PATCH_SQL = String.raw`-- ===========================
-- UNLOCK / SEARCH / PUBLIC READ (IDEMPOTENT)
-- Safe to run multiple times
-- ===========================

-- Extensions we rely on
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- ---------- Public read for catalogs ----------
alter table if exists public.materials enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='materials' and policyname='read materials'
  ) then
    create policy "read materials" on public.materials for select using (true);
  end if;
end$$;

alter table if exists public.material_groups enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='material_groups' and policyname='read material_groups'
  ) then
    create policy "read material_groups" on public.material_groups for select using (true);
  end if;
end$$;

-- ---------- Columns for search on materials ----------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='materials' and column_name='normalized_name'
  ) then
    alter table public.materials add column normalized_name text;
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='materials' and column_name='search'
  ) then
    alter table public.materials add column search tsvector;
  end if;
end$$;

-- ---------- Trigger to maintain normalized_name + search ----------
create or replace function public.materials_maintain_search()
returns trigger
language plpgsql
as $$
begin
  -- normalize name for trigram search; unaccent if available
  new.normalized_name := coalesce(lower(unaccent(new.name)), lower(new.name));

  -- simple tsvector combining name + (optional) color if present
  new.search :=
    to_tsvector('simple',
      coalesce(new.name,'') || ' ' ||
      coalesce(new.color,'')
    );

  return new;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'materials_search_trg'
  ) then
    create trigger materials_search_trg
    before insert or update on public.materials
    for each row execute function public.materials_maintain_search();
  end if;
end$$;

-- backfill existing rows
update public.materials
set name = name;  -- touch rows to fire trigger via UPDATE

-- ---------- Helpful indexes ----------
create index if not exists materials_search_gin on public.materials using gin (search);
create index if not exists materials_normalized_trgm on public.materials using gin (normalized_name gin_trgm_ops);

-- ---------- (Optional) same treatment for groups (name-only) ----------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='material_groups' and column_name='normalized_name'
  ) then
    alter table public.material_groups add column normalized_name text;
  end if;
end$$;

create or replace function public.material_groups_maintain_normalized()
returns trigger language plpgsql as $$
begin
  new.normalized_name := coalesce(lower(unaccent(new.name)), lower(new.name));
  return new;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'material_groups_norm_trg'
  ) then
    create trigger material_groups_norm_trg
    before insert or update on public.material_groups
    for each row execute function public.material_groups_maintain_normalized();
  end if;
end$$;

update public.material_groups set name = name;
create index if not exists material_groups_normalized_trgm on public.material_groups using gin (normalized_name gin_trgm_ops);
`;

export default function UnlocksPage() {
  const [checks, setChecks] = useState<CheckResult[]>(INITIAL)
  const [copyOK, setCopyOK] = useState(false)
  const [running, setRunning] = useState(false)

  const passCount = useMemo(
    () => checks.filter(c => c.status === 'pass').length,
    [checks]
  )

  async function runChecks() {
    setRunning(true)
    const results: CheckResult[] = []

    // 1) Public read on materials
    {
      const key = 'materials_read'
      try {
        const { error } = await supabase.from('materials').select('id').limit(1)
        if (error) {
          results.push({ key, label: getLabel(key), status: 'fail', detail: error.message })
        } else {
          results.push({ key, label: getLabel(key), status: 'pass' })
        }
      } catch (e: any) {
        results.push({ key, label: getLabel(key), status: 'fail', detail: String(e?.message || e) })
      }
    }

    // 2) Public read on material_groups
    {
      const key = 'groups_read'
      try {
        const { error } = await supabase.from('material_groups').select('id').limit(1)
        if (error) {
          results.push({ key, label: getLabel(key), status: 'fail', detail: error.message })
        } else {
          results.push({ key, label: getLabel(key), status: 'pass' })
        }
      } catch (e: any) {
        results.push({ key, label: getLabel(key), status: 'fail', detail: String(e?.message || e) })
      }
    }

    // 3) materials.normalized_name exists
    {
      const key = 'materials_normalized'
      try {
        const { error } = await supabase.from('materials').select('normalized_name').limit(1)
        if (error) {
          results.push({ key, label: getLabel(key), status: 'fail', detail: error.message })
        } else {
          results.push({ key, label: getLabel(key), status: 'pass' })
        }
      } catch (e: any) {
        results.push({ key, label: getLabel(key), status: 'fail', detail: String(e?.message || e) })
      }
    }

    // 4) materials.search exists
    {
      const key = 'materials_search_col'
      try {
        const { error } = await supabase.from('materials').select('search').limit(1)
        if (error) {
          results.push({ key, label: getLabel(key), status: 'fail', detail: error.message })
        } else {
          results.push({ key, label: getLabel(key), status: 'pass' })
        }
      } catch (e: any) {
        results.push({ key, label: getLabel(key), status: 'fail', detail: String(e?.message || e) })
      }
    }

    // 5) text search works on search (tsvector @@ query)
    {
      const key = 'materials_textsearch'
      try {
        // Try an innocuous query; will fail if column not tsvector or fts ops unavailable
        const { error } = await supabase
          .from('materials')
          .select('id')
          .textSearch('search', 'fly', { type: 'plain' })
          .limit(1)

        if (error) {
          // If the search column exists but isn't tsvector/indexed, we mark warn to differentiate from hard fail
          const msg = error.message || ''
          const warnish = /operator|tsvector|fts|function|does not exist/i.test(msg)
          results.push({
            key,
            label: getLabel(key),
            status: warnish ? 'warn' : 'fail',
            detail: msg,
          })
        } else {
          results.push({ key, label: getLabel(key), status: 'pass' })
        }
      } catch (e: any) {
        results.push({ key, label: getLabel(key), status: 'fail', detail: String(e?.message || e) })
      }
    }

    // merge into state
    setChecks(prev => prev.map(c => results.find(r => r.key === c.key) ?? c))
    setRunning(false)
  }

  function getLabel(key: string) {
    const found = INITIAL.find(i => i.key === key)
    return found?.label ?? key
  }

  useEffect(() => {
    // Run once on mount
    runChecks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function copySQL() {
    try {
      await navigator.clipboard.writeText(PATCH_SQL)
      setCopyOK(true)
      setTimeout(() => setCopyOK(false), 1600)
    } catch {
      // noop
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Unlocks & Diagnostics</h1>
        <Button variant="secondary" onClick={runChecks} disabled={running}>
          <RefreshCw className={`mr-2 h-4 w-4 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Checking…' : 'Run checks'}
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            Current status
            <Badge variant={passCount === 5 ? 'default' : 'secondary'}>
              {passCount}/5 passing
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {checks.map((c) => (
            <div key={c.key} className="flex items-start justify-between rounded-xl border p-3">
              <div>
                <div className="font-medium">{c.label}</div>
                {c.detail && (
                  <div className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                    {c.detail}
                  </div>
                )}
              </div>
              <StatusPill status={c.status} />
            </div>
          ))}
          <p className="text-sm text-muted-foreground">
            If any checks fail, apply the SQL patch below in your Supabase SQL Editor, then re-run.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            SQL Patch (idempotent)
            <div className="flex items-center gap-2">
              {copyOK ? (
                <Badge variant="default" className="gap-1">
                  <Check className="h-3.5 w-3.5" /> Copied
                </Badge>
              ) : (
                <Button size="sm" variant="outline" onClick={copySQL}>
                  <Copy className="mr-2 h-4 w-4" /> Copy SQL
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto whitespace-pre rounded-xl bg-muted p-4 text-xs leading-relaxed">
            {PATCH_SQL}
          </pre>
          <div className="mt-3 text-sm text-muted-foreground">
            What it does: enables public read on <code>materials</code> and <code>material_groups</code>, adds
            <code>normalized_name</code> and a <code>search</code> <em>(tsvector)</em> to <code>materials</code> with
            triggers, and creates helpful GIN/TRGM indexes.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Notes & Tips <AlertCircle className="h-4 w-4" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <ul className="list-disc pl-5 space-y-1">
            <li>Client checks can’t verify server-side index existence; the patch safely creates them if missing.</li>
            <li>
              If your <code>materials</code> table doesn’t have a <code>color</code> column, you can remove it from the
              trigger body—everything else remains valid.
            </li>
            <li>
              After running the patch, click <em>Run checks</em> again. All rows should turn green if things are set.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

function StatusPill({ status }: { status: Status }) {
  const map: Record<Status, { label: string; className: string; icon: ReactNode }> = {
    unknown: { label: 'Unknown', className: 'bg-muted text-foreground', icon: <AlertCircle className="h-4 w-4" /> },
    pass: { label: 'Pass', className: 'bg-emerald-600 text-white', icon: <Check className="h-4 w-4" /> },
    fail: { label: 'Fail', className: 'bg-red-600 text-white', icon: <X className="h-4 w-4" /> },
    warn: { label: 'Warn', className: 'bg-amber-500 text-white', icon: <AlertCircle className="h-4 w-4" /> },
  }
  const item = map[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${item.className}`}>
      {item.icon}
      {item.label}
    </span>
  )
}
