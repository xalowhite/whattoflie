import { supabase } from '@/lib/supabase';
import { normalizeName } from './normalize';
import type { BaseFly, CsvFly } from '@/types/fly';

/**
 * Fetch a fly by its normalized name. Returns null if not found.
 */
export async function getByNormalizedName(norm: string) {
  const { data, error } = await supabase
    .from('flies')
    .select('id,name,normalized_name')
    .eq('normalized_name', norm)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') { // ignore "no rows" if surfaced
    throw error;
  }
  return data ?? null;
}

/**
 * Add one fly; returns { ok: true } on insert, or { ok: false, reason } if duplicate/failed.
 * Relies on DB unique constraint on (normalized_name).
 */
export async function addFly(fly: CsvFly) {
  const norm = normalizeName(fly.name);

  // Friendly pre-check to craft a nice message
  const existing = await getByNormalizedName(norm);
  if (existing) {
    return { ok: false as const, reason: `${existing.name} already included in compendium.` };
  }

  // Race-safe insert; DB constraint is the real guard
  const { error } = await supabase
    .from('flies')
    .upsert([fly], { onConflict: 'normalized_name', ignoreDuplicates: true });

  if (error) {
    // 23505 = unique violation
    if ((error as any).code === '23505') {
      return { ok: false as const, reason: `${fly.name} already included in compendium.` };
    }
    return { ok: false as const, reason: error.message };
  }

  return { ok: true as const };
}

/**
 * Bulk-import CSV rows; skips known duplicates based on normalized_name.
 * Returns summary: { inserted, skipped }
 */
export async function importCsvRows(rows: CsvFly[]) {
  const wanted = Array.from(new Set(rows.map(r => normalizeName(r.name)).filter(Boolean)));

  const { data: existing, error: selErr } = await supabase
    .from('flies')
    .select('normalized_name,name')
    .in('normalized_name', wanted);

  if (selErr) throw selErr;

  const existingSet = new Set((existing ?? []).map(x => x.normalized_name));
  const toInsert = rows.filter(r => !existingSet.has(normalizeName(r.name)));
  const duplicates = rows.filter(r => existingSet.has(normalizeName(r.name)));

  const chunk = 300;
  for (let i = 0; i < toInsert.length; i += chunk) {
    const slice = toInsert.slice(i, i + chunk);
    const { error } = await supabase
      .from('flies')
      .upsert(slice, { onConflict: 'normalized_name', ignoreDuplicates: true });
    if (error) throw error;
  }

  return { inserted: toInsert.length, skipped: duplicates.map(d => d.name) };
}
