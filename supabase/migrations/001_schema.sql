-- Hold My Beer - freemium backend
-- profiles: one row per auth user; paid flag set by the Dodo webhook only.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  paid boolean not null default false,
  paid_at timestamptz,
  dodo_payment_id text,
  created_at timestamptz not null default now()
);

-- auto-create a profile row on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- server-attested hold sessions: the server clock owns the duration
create table if not exists public.hold_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_ms integer
);

-- leaderboard scores (written only by the hold-end edge function)
create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null,
  duration_ms integer not null,
  glass text not null default 'mug',
  beer text not null default 'lager',
  hidden boolean not null default false,       -- admin moderation
  flagged boolean not null default false,      -- review queue (top 10 / outliers)
  created_at timestamptz not null default now()
);
create index if not exists scores_board_idx on public.scores (hidden, duration_ms desc);

-- witnessed: a paid user vouches they watched the hold happen
create table if not exists public.witnesses (
  score_id uuid not null references public.scores(id) on delete cascade,
  witness_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (score_id, witness_user_id)
);

-- leaderboard view the client reads
create or replace view public.leaderboard as
select s.id, s.display_name, s.duration_ms, s.glass, s.beer, s.created_at, s.user_id,
       (select count(*) from public.witnesses w where w.score_id = s.id) as witness_count
from public.scores s
where not s.hidden
order by s.duration_ms desc
limit 50;

alter table public.profiles enable row level security;
alter table public.hold_sessions enable row level security;
alter table public.scores enable row level security;
alter table public.witnesses enable row level security;

-- profiles: anyone can read the name/paid flag (leaderboard needs it); only the owner updates their name
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (true);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (auth.uid() = id)
  with check (auth.uid() = id);
-- paid can never be flipped by the client
revoke update (paid, paid_at, dodo_payment_id) on public.profiles from authenticated;

-- scores/witnesses/hold_sessions: read open, writes only via edge functions (service role bypasses RLS)
drop policy if exists scores_read on public.scores;
create policy scores_read on public.scores for select using (true);
drop policy if exists witnesses_read on public.witnesses;
create policy witnesses_read on public.witnesses for select using (true);
drop policy if exists sessions_read_own on public.hold_sessions;
create policy sessions_read_own on public.hold_sessions for select using (auth.uid() = user_id);
