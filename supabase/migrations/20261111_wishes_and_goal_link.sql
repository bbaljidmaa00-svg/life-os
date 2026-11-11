-- Life OS · 2026-11-11 · таны Supabase төсөлд аль хэдийн ажиллуулсан.
-- Хүсэл мөрөөдөл (хугацаагүй) → Зорилго (goals.wish_id) → Төсөл → Хийх зүйлс.
-- 4 ангилал: be = Болох · do = Хийх · have = Эзэмших · give = Өгөх
create table if not exists public.wishes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  category     text not null default 'do' check (category in ('be', 'do', 'have', 'give')),
  note         text,
  achieved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id)
);

alter table public.goals add column if not exists wish_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'goals_wish_owner_fk') then
    alter table public.goals add constraint goals_wish_owner_fk foreign key (wish_id, user_id)
      references public.wishes (id, user_id) on delete set null (wish_id);
  end if;
end
$$;

create index if not exists wishes_user_idx on public.wishes (user_id, category);
create index if not exists goals_wish_idx  on public.goals (wish_id, user_id);

alter table public.wishes enable row level security;
revoke all on table public.wishes from anon;
grant select, insert, update, delete on table public.wishes to authenticated;
drop policy if exists wishes_select_own on public.wishes;
drop policy if exists wishes_insert_own on public.wishes;
drop policy if exists wishes_update_own on public.wishes;
drop policy if exists wishes_delete_own on public.wishes;
create policy wishes_select_own on public.wishes for select to authenticated using ((select auth.uid()) = user_id);
create policy wishes_insert_own on public.wishes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy wishes_update_own on public.wishes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy wishes_delete_own on public.wishes for delete to authenticated using ((select auth.uid()) = user_id);
drop trigger if exists set_updated_at on public.wishes;
create trigger set_updated_at before update on public.wishes for each row execute function public.set_updated_at();
