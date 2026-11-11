-- Life OS · 2026-11-11 · таны Supabase төсөлд аль хэдийн ажиллуулсан.
-- Төрсөн өдөр бүрийн сануулгын тохиргоо + он мэдэгдэхгүй байх боломж.
-- Зөвхөн нэмэлт багана — байгаа мөрүүд анхдагч утгаараа ажилласаар байна.
alter table public.birthdays
  add column if not exists reminder_enabled boolean not null default true,
  add column if not exists reminder_days smallint not null default 1,
  add column if not exists birth_year_known boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'birthdays_reminder_days_check') then
    alter table public.birthdays
      add constraint birthdays_reminder_days_check check (reminder_days between 0 and 60);
  end if;
end
$$;

comment on column public.birthdays.birth_year_known is
  'false = year unknown; birth_date then stores year 2000 as a placeholder (leap year, so Feb 29 is valid).';
