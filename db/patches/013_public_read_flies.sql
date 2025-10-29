-- PATCH 013 — Public-read flies (+ optional fly_materials)

alter table if exists public.flies enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='flies' and policyname='read flies'
  ) then
    create policy "read flies" on public.flies
      for select using (true);
  end if;
end$$;

-- Optional global defaults for catalog materials
do $$
begin
  if to_regclass('public.fly_materials') is null then
    create table public.fly_materials (
      id uuid primary key default gen_random_uuid(),
      fly_id uuid not null references public.flies(id) on delete cascade,
      material_id uuid references public.materials(id) on delete set null,
      material_name text,
      color text,
      required boolean not null default true,
      position int not null default 0
    );
    create index on public.fly_materials(fly_id, position);
  end if;
end$$;

alter table if exists public.fly_materials enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='fly_materials' and policyname='read fly_materials'
  ) then
    create policy "read fly_materials" on public.fly_materials
      for select using (true);
  end if;
end$$;
