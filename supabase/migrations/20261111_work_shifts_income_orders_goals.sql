-- Life OS · 2026-11-11 · таны Supabase төсөлд аль хэдийн ажиллуулсан.
-- Ажил: ажлын газар, ээлж, орлого, захиалга, хамт ажиллагсад, ойрын зорилго (RLS-тэй).
-- Ажлын даалгавар = tasks (ангилал «Ажил»), уулзалт = calendar_events (event_type 'work') — шинэ хүснэгт хэрэггүй.

-- ── Ажлын газар ─────────────────────────────────────────────────────────────
create table if not exists public.workplaces (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 120),
  color           text,
  pay_type        text not null default 'hourly' check (pay_type in ('hourly', 'fixed', 'none')),
  hourly_rate     numeric(12, 2) check (hourly_rate is null or hourly_rate >= 0),
  monthly_salary  numeric(14, 2) check (monthly_salary is null or monthly_salary >= 0),
  payday          smallint check (payday is null or payday between 1 and 31),     -- цалингийн өдөр (сарын)
  payday_2        smallint check (payday_2 is null or payday_2 between 1 and 31), -- 2 дахь (урьдчилгаа) өдөр
  notes           text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id)
);

-- ── Ажлын ээлж (end_time < start_time бол шөнө дундаас хойш дуусна) ─────────
create table if not exists public.work_shifts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workplace_id   uuid not null,
  shift_date     date not null,
  start_time     time not null,
  end_time       time not null,
  break_minutes  integer not null default 0 check (break_minutes between 0 and 720),
  hourly_rate    numeric(12, 2) check (hourly_rate is null or hourly_rate >= 0),  -- энэ ээлжид өөр хөлс бол
  extra_pay      numeric(12, 2) not null default 0 check (extra_pay >= 0),        -- нэмэгдэл, урамшуулал
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint work_shifts_time_check check (end_time <> start_time),
  constraint work_shifts_workplace_owner_fk foreign key (workplace_id, user_id)
    references public.workplaces (id, user_id) on delete cascade
);

-- ── Орлогын бүртгэл ─────────────────────────────────────────────────────────
create table if not exists public.income_entries (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workplace_id   uuid,
  amount         numeric(14, 2) not null check (amount > 0),
  received_date  date not null default current_date,
  kind           text not null default 'salary' check (kind in ('salary', 'advance', 'bonus', 'tips', 'sale', 'other')),
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint income_entries_workplace_owner_fk foreign key (workplace_id, user_id)
    references public.workplaces (id, user_id) on delete set null (workplace_id)
);

-- ── Дэлгүүр / бизнесийн захиалга ────────────────────────────────────────────
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  customer_name     text not null check (char_length(customer_name) between 1 and 120),
  customer_contact  text,
  items             text not null check (char_length(items) between 1 and 500),
  quantity          integer not null default 1 check (quantity > 0),
  price             numeric(14, 2) not null default 0 check (price >= 0),        -- нийт үнэ
  paid_amount       numeric(14, 2) not null default 0 check (paid_amount >= 0),
  status            text not null default 'new' check (status in ('new', 'preparing', 'ready', 'delivered', 'cancelled')),
  due_date          date,
  due_time          time,
  delivery          text,                                                          -- хаяг / хүргэлтийн арга
  notes             text,
  delivered_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── Хамт ажиллагсад ─────────────────────────────────────────────────────────
create table if not exists public.work_contacts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workplace_id  uuid,
  name          text not null check (char_length(name) between 1 and 120),
  role          text,
  contact       text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint work_contacts_workplace_owner_fk foreign key (workplace_id, user_id)
    references public.workplaces (id, user_id) on delete set null (workplace_id)
);

-- ── Ойрын зорилго (цаг / орлого / захиалга автоматаар, эсвэл гараар) ────────
create table if not exists public.work_goals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 200),
  metric           text not null default 'custom' check (metric in ('hours', 'income', 'orders', 'custom')),
  target           numeric(14, 2) not null check (target > 0),
  manual_progress  numeric(14, 2) not null default 0 check (manual_progress >= 0),
  unit             text,
  workplace_id     uuid,
  start_date       date not null default current_date,
  end_date         date not null,
  status           text not null default 'active' check (status in ('active', 'done')),
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint work_goals_dates_check check (end_date >= start_date),
  constraint work_goals_workplace_owner_fk foreign key (workplace_id, user_id)
    references public.workplaces (id, user_id) on delete set null (workplace_id)
);

create index if not exists workplaces_user_idx        on public.workplaces (user_id);
create index if not exists work_shifts_user_date_idx  on public.work_shifts (user_id, shift_date);
create index if not exists work_shifts_wp_idx         on public.work_shifts (workplace_id, user_id);
create index if not exists income_user_date_idx       on public.income_entries (user_id, received_date);
create index if not exists income_wp_idx              on public.income_entries (workplace_id, user_id);
create index if not exists orders_user_due_idx        on public.orders (user_id, due_date);
create index if not exists work_contacts_user_idx     on public.work_contacts (user_id);
create index if not exists work_contacts_wp_idx       on public.work_contacts (workplace_id, user_id);
create index if not exists work_goals_user_idx        on public.work_goals (user_id, end_date);
create index if not exists work_goals_wp_idx          on public.work_goals (workplace_id, user_id);

do $$
declare t text;
begin
  foreach t in array array['workplaces', 'work_shifts', 'income_entries', 'orders', 'work_contacts', 'work_goals'] loop
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
