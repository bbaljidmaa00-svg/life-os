-- Life OS · 2026-11-11 · таны Supabase төсөлд аль хэдийн ажиллуулсан.
-- Сургууль: хичээл, хичээлийн хуваарь, гэрийн даалгавар (RLS-тэй).
create table if not exists public.subjects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  teacher     text,
  color       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.class_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id  uuid not null,
  weekday     smallint not null check (weekday between 0 and 6),   -- 0 = Ням … 6 = Бямба
  start_time  time not null,
  end_time    time,
  room        text,
  kind        text not null default 'lecture' check (kind in ('lecture', 'seminar', 'lab', 'workshop', 'other')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint class_sessions_time_check check (end_time is null or end_time > start_time),
  constraint class_sessions_subject_owner_fk foreign key (subject_id, user_id)
    references public.subjects (id, user_id) on delete cascade
);

create table if not exists public.homework (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id         uuid,
  title              text not null check (char_length(title) between 1 and 200),
  description        text,
  assigned_date      date,
  start_date         date,
  start_time         time,
  due_date           date,
  due_time           time,
  estimated_minutes  integer check (estimated_minutes is null or estimated_minutes > 0),
  status             text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'submitted')),
  completed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint homework_subject_owner_fk foreign key (subject_id, user_id)
    references public.subjects (id, user_id) on delete set null (subject_id)
);

create index if not exists subjects_user_idx        on public.subjects (user_id);
create index if not exists class_sessions_user_idx  on public.class_sessions (user_id, weekday);
create index if not exists class_sessions_subj_idx  on public.class_sessions (subject_id, user_id);
create index if not exists homework_user_due_idx    on public.homework (user_id, due_date);
create index if not exists homework_subj_idx        on public.homework (subject_id, user_id);

do $$
declare t text;
begin
  foreach t in array array['subjects', 'class_sessions', 'homework'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_delete_own', t);
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end
$$;
