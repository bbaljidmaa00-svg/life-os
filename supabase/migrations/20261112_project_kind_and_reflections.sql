-- Life OS · 2026-11-12 · таны Supabase төсөлд аль хэдийн ажиллуулсан.
-- Төслийн төрөл: quick = Хурдан (цөөн алхам), long = Урт хугацааны (олон, давтагдах үйлдэл).
-- Төслийн алхам дуусахад бичдэг «Юу сурсан бэ? Сэтгэгдэл» тэмдэглэл.
alter table public.projects add column if not exists kind text not null default 'quick';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_kind_check') then
    alter table public.projects add constraint projects_kind_check check (kind in ('quick', 'long'));
  end if;
end
$$;

create table if not exists public.project_reflections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id  uuid not null,
  task_id     uuid,
  task_title  text,                                  -- алхам устсан ч нэр нь үлдэнэ
  learned     text,                                  -- Юу сурсан бэ
  feeling     text,                                  -- Сэтгэгдэл, мэдрэмж
  mood        smallint check (mood is null or mood between 1 and 5),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint project_reflections_not_empty check (
    coalesce(btrim(learned), '') <> '' or coalesce(btrim(feeling), '') <> '' or mood is not null
  ),
  constraint project_reflections_project_owner_fk foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete cascade,
  constraint project_reflections_task_owner_fk foreign key (task_id, user_id)
    references public.tasks (id, user_id) on delete set null (task_id)
);

create index if not exists project_reflections_project_idx on public.project_reflections (project_id, user_id, created_at);
create index if not exists project_reflections_task_idx    on public.project_reflections (task_id, user_id);

alter table public.project_reflections enable row level security;
revoke all on table public.project_reflections from anon;
grant select, insert, update, delete on table public.project_reflections to authenticated;
drop policy if exists project_reflections_select_own on public.project_reflections;
drop policy if exists project_reflections_insert_own on public.project_reflections;
drop policy if exists project_reflections_update_own on public.project_reflections;
drop policy if exists project_reflections_delete_own on public.project_reflections;
create policy project_reflections_select_own on public.project_reflections for select to authenticated using ((select auth.uid()) = user_id);
create policy project_reflections_insert_own on public.project_reflections for insert to authenticated with check ((select auth.uid()) = user_id);
create policy project_reflections_update_own on public.project_reflections for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy project_reflections_delete_own on public.project_reflections for delete to authenticated using ((select auth.uid()) = user_id);
drop trigger if exists set_updated_at on public.project_reflections;
create trigger set_updated_at before update on public.project_reflections for each row execute function public.set_updated_at();
