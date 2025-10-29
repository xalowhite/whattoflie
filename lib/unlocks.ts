import { supabase } from '@/lib/supabase';

export type TieableRow = { source: 'global'|'user'; fly_id: string; fly_name: string };
export async function getTieableNow() {
  const { data, error } = await supabase.rpc('rpc_tieable_now');
  if (error) throw error;
  return (data ?? []) as TieableRow[];
}

export type UnlockRow = {
  kind: 'fly' | 'material_leader';
  fly_id: string | null;
  fly_name: string | null;
  missing_count: number | null;
  missing_group: string | null;
  missing_group_name: string | null;
  unlocks: number | null;
};
export async function getUnlocks(maxMissing = 1) {
  const { data, error } = await supabase.rpc('rpc_unlocks', { max_missing: maxMissing });
  if (error) throw error;
  const rows = (data ?? []) as UnlockRow[];
  return {
    flies: rows.filter(r => r.kind === 'fly') as UnlockRow[],
    leaderboard: rows.filter(r => r.kind === 'material_leader') as UnlockRow[],
  };
}
