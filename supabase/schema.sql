-- ═══════════════════════════════════════════════════════════════════════════
--  Life OS · Supabase (PostgreSQL) схем
-- ═══════════════════════════════════════════════════════════════════════════
--  Энэ файл таны одоо ажиллаж буй Supabase төсөл (cztdncdfhyrctqzpfwob)-ийн
--  апп-д хэрэглэгддэг хүснэгтүүдийг тайлбарлана. Таны сан аль хэдийн бэлэн —
--  энэ файлыг ДАХИН АЖИЛЛУУЛАХ ШААРДЛАГАГҮЙ. Шинэ, хоосон Supabase төсөл дээр
--  ижил бүтэц үүсгэх бол SQL Editor-т ажиллуулна (дахин ажиллуулахад аюулгүй).
--
--  Апп-ын талбарын нэр зарим газар сангийнхаас өөр — хөрвүүлэлт нь
--  js/services/dbMapping.js-д бий:
--    tasks            notes ↔ description · done ↔ completed · due_date+due_time ↔ due_at
--    calendar_events  category ↔ event_type · event_date+start/end ↔ starts_at/ends_at
--    journal_entries  reflection ↔ content · сэтгэл санаа 1–5 ↔ terrible…great
--    birthdays        name ↔ person_name · сар/өдөр/он ↔ birth_date (+ birth_year_known)
--    ai_messages      actions + source ↔ metadata (jsonb)
--
--  Сургуулийн хүснэгтүүд (subjects, class_sessions, homework):
--    supabase/migrations/20261111_school_subjects_classes_homework.sql
--
--  Таны санд мөн profiles, user_preferences, reminders, time_entries,
--  in_app_notifications, decision_logs, monthly_reports хүснэгтүүд бий —
--  апп одоогоор ашиглахгүй, ирээдүйн функцэд (сануулга, таймер…) бэлэн.
--
--  Төлөв, ач холбогдлын утгууд ('active', 'todo', 'high' …) англиар хадгалагдаж,
--  зөвхөн дэлгэц дээр монголоор харагдана.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Зорилго ба төсөл ────────────────────────────────────────────────────────
create table if not exists public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  title         text not null,
  description   text,
  status        text not null default 'active' check (status in ('active', 'completed', 'paused', 'cancelled')),
  priority      text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  start_date    date,
  target_date   date,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  goal_id       uuid,
  title         text not null,
  description   text,
  status        text not null default 'active' check (status in ('active', 'completed', 'paused', 'cancelled')),
  priority      text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  start_date    date,
  due_date      date,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, user_id),
  constraint projects_goal_owner_fk foreign key (goal_id, user_id) references public.goals (id, user_id)
);

-- ── Ажил ────────────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  project_id         uuid,
  goal_id            uuid,
  parent_task_id     uuid,
  title              text not null,
  description        text,
  category           text not null default 'personal',
  priority           text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status             text not null default 'todo' check (status in ('todo', 'in_progress', 'completed', 'cancelled')),
  scheduled_start    timestamptz,
  scheduled_end      timestamptz,
  due_at             timestamptz,       -- цаггүй эцсийн хугацааг тухайн өдрийн 23:59:59-өөр хадгална
  estimated_minutes  integer check (estimated_minutes is null or estimated_minutes > 0),
  actual_minutes     integer check (actual_minutes is null or actual_minutes >= 0),
  recurrence_rule    text,
  completed_at       timestamptz,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, user_id),
  constraint tasks_project_owner_fk foreign key (project_id, user_id) references public.projects (id, user_id),
  constraint tasks_goal_owner_fk foreign key (goal_id, user_id) references public.goals (id, user_id),
  constraint tasks_parent_owner_fk foreign key (parent_task_id, user_id) references public.tasks (id, user_id)
);

-- ── Календарийн үйл явдал ───────────────────────────────────────────────────
create table if not exists public.calendar_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  task_id      uuid,
  title        text not null,
  description  text,
  event_type   text not null default 'event',   -- апп: work / personal / health / social / focus / other
  location     text,
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  all_day      boolean not null default false,
  color        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint calendar_events_task_owner_fk foreign key (task_id, user_id) references public.tasks (id, user_id)
);

-- ── Тэмдэглэл ───────────────────────────────────────────────────────────────
create table if not exists public.journal_entries (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  entry_date         date not null default current_date,
  title              text,
  content            text not null default '',
  mood               text,                -- terrible / bad / okay / good / great
  energy_level       smallint check (energy_level is null or energy_level between 1 and 5),
  gratitude          text,
  lessons_learned    text,
  improvement_notes  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── Төрсөн өдөр ─────────────────────────────────────────────────────────────
create table if not exists public.birthdays (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  person_name       text not null,
  birth_date        date not null,        -- он мэдэгдэхгүй бол 2000 он (birth_year_known = false)
  birth_year_known  boolean not null default true,
  relationship      text,
  notes             text,
  gift_ideas        text,
  reminder_enabled  boolean not null default true,
  reminder_days     smallint not null default 1 check (reminder_days between 0 and 60),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── AI туслах ───────────────────────────────────────────────────────────────
create table if not exists public.ai_conversations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  title            text not null default 'Шинэ яриа',
  context_summary  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.ai_messages (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  conversation_id  uuid not null,
  role             text not null check (role in ('user', 'assistant', 'system')),
  content          text not null,
  metadata         jsonb not null default '{}'::jsonb,   -- { actions: [...], source: 'local-rules' | 'ai' | ... }
  created_at       timestamptz not null default now(),
  constraint ai_messages_conversation_owner_fk foreign key (conversation_id, user_id)
    references public.ai_conversations (id, user_id) on delete cascade
);

create table if not exists public.ai_memories (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  memory_type  text not null default 'preference',
  content      text not null,
  source       text,
  confidence   numeric check (confidence is null or confidence between 0 and 1),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Индекс ──────────────────────────────────────────────────────────────────
create index if not exists tasks_user_due_idx        on public.tasks (user_id, due_at);
create index if not exists tasks_project_idx         on public.tasks (project_id, user_id);
create index if not exists tasks_goal_idx            on public.tasks (goal_id, user_id);
create index if not exists tasks_parent_idx          on public.tasks (parent_task_id, user_id);
create index if not exists events_user_start_idx     on public.calendar_events (user_id, starts_at);
create index if not exists events_task_idx           on public.calendar_events (task_id, user_id);
create index if not exists goals_user_idx            on public.goals (user_id);
create index if not exists projects_user_idx         on public.projects (user_id);
create index if not exists projects_goal_idx         on public.projects (goal_id, user_id);
create index if not exists journal_user_date_idx     on public.journal_entries (user_id, entry_date);
create index if not exists birthdays_user_idx        on public.birthdays (user_id);
create index if not exists ai_conversations_user_idx on public.ai_conversations (user_id);
create index if not exists ai_messages_conv_idx      on public.ai_messages (conversation_id, user_id, created_at);
create index if not exists ai_memories_user_idx      on public.ai_memories (user_id);

-- ── RLS: хэрэглэгч бүр зөвхөн өөрийн мөрийг харж, засна ─────────────────────
do $$
declare t text; op text;
begin
  foreach t in array array[
    'goals', 'projects', 'tasks', 'calendar_events', 'journal_entries',
    'birthdays', 'ai_conversations', 'ai_messages', 'ai_memories'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    foreach op in array array['select', 'insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', t || '_' || op || '_own', t);
    end loop;
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_delete_own', t);
    if t <> 'ai_messages' then
      execute format('drop trigger if exists set_updated_at on public.%I', t);
      execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    end if;
  end loop;
end
$$;
