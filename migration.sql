-- Daily Chief of Staff: relational schema for Supabase (Postgres).
-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query)
-- before deploying the app with NEXT_PUBLIC_SUPABASE_URL,
-- NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY set.
--
-- Safe to re-run: every statement is idempotent, including the migration
-- block at the bottom that upgrades an already-created `steps` table (adds
-- `resource`, renames `estimated_days` to `estimated_hours`) if you ran an
-- earlier version of this file.
--
-- All tables use the Clerk user ID (a string, e.g. "user_2abc...") as the
-- tenant key. Every table cascades on user/parent deletion so removing a
-- user or a goal cleans up everything beneath it.

create extension if not exists "pgcrypto";

-- One row per signed-in user. `stats` is a denormalized JSON blob (streaks,
-- totals, per-day completed counts) recomputed on every meaningful action --
-- kept as JSON rather than its own table since it's always read/written as
-- a single unit per user, never queried by sub-field.
create table if not exists users (
  id text primary key,                 -- Clerk user ID
  email text,
  onboarded_at timestamptz,
  last_weekly_review_date date,
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists goals (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  title text not null,
  status text not null default 'inactive'
    check (status in ('inactive', 'active', 'completed')),
  created_at timestamptz not null default now()
);
create index if not exists goals_user_id_idx on goals (user_id);

create table if not exists milestones (
  id text primary key,
  goal_id text not null references goals(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  title text not null,
  "order" integer not null default 0,
  status text not null default 'proposed'
    check (status in ('proposed', 'confirmed', 'completed')),
  created_at timestamptz not null default now()
);
create index if not exists milestones_goal_id_idx on milestones (goal_id);
create index if not exists milestones_user_id_idx on milestones (user_id);

-- Steps are generated for EVERY milestone as soon as it's confirmed (5-7
-- each), not just the first. Each step carries a concrete action ("title"),
-- a named resource/tool ("resource"), a deliverable ("output"), and a time
-- estimate in hours ("estimated_hours", fractional to the nearest quarter
-- hour -- e.g. 1.5, 2.25).
create table if not exists steps (
  id text primary key,
  milestone_id text not null references milestones(id) on delete cascade,
  goal_id text not null references goals(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  title text not null,
  resource text not null default '',
  output text not null default '',
  estimated_hours numeric(6, 2) not null default 1,
  dependencies text[] not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'active', 'done', 'blocked', 'skipped')),
  "order" integer not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists steps_milestone_id_idx on steps (milestone_id);
create index if not exists steps_goal_id_idx on steps (goal_id);
create index if not exists steps_user_id_idx on steps (user_id);

-- Idempotent upgrade path for a `steps` table created by an earlier version
-- of this file (which had `estimated_days integer` and no `resource`
-- column). Safe to run even on a brand-new table created just above.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'steps' and column_name = 'estimated_days'
  ) then
    alter table steps rename column estimated_days to estimated_hours;
    alter table steps alter column estimated_hours type numeric(6, 2);
  end if;
end $$;

alter table steps add column if not exists resource text not null default '';
alter table steps add column if not exists notes text not null default '';

-- One row per (user, date, step) focused on that day. Day-level fields
-- (morning_generated_at, evening_completed_at, adjustment_note) are
-- duplicated across each row for that date -- this table is always read and
-- written as "all of today's focus items" as a unit, mirroring the app's
-- daily-loop model, while still giving each step its own queryable status.
-- step_id is nullable to allow a single sentinel row representing "morning
-- focus was generated but there were zero candidate steps" -- a day with no
-- step to attach to.
create table if not exists daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  step_id text references steps(id) on delete cascade,
  goal_id text,
  milestone_id text,
  goal_text text,
  milestone_text text,
  step_text text,
  reasoning text,
  date date not null,
  status text check (status in ('done', 'blocked', 'skipped')),
  reason text not null default '',
  morning_generated_at timestamptz,
  evening_completed_at timestamptz,
  adjustment_note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists daily_logs_user_date_idx on daily_logs (user_id, date);

create table if not exists weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  summary jsonb not null default '{}'::jsonb,  -- { "moved": string[], "stuck": string[] }
  wins text not null default '',                -- celebration prose
  replanned_steps text not null default '',     -- replan prose
  created_at timestamptz not null default now(),
  unique (user_id, week_end)
);
create index if not exists weekly_reviews_user_id_idx on weekly_reviews (user_id);

-- Row Level Security: the app talks to Supabase exclusively from server-side
-- API routes using the service role key (which bypasses RLS), after already
-- verifying the Clerk session. Enabling RLS with no policies blocks any
-- accidental client-side use of the anon key from reading/writing this data.
alter table users enable row level security;
alter table goals enable row level security;
alter table milestones enable row level security;
alter table steps enable row level security;
alter table daily_logs enable row level security;
alter table weekly_reviews enable row level security;
