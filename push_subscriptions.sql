-- Supabase SQL Editor에서 1회 실행. 기존 테이블은 변경하지 않습니다.
create table if not exists public.push_subscriptions (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null unique,
 subscription jsonb not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
-- 브라우저에서 직접 접근하지 않고 Edge Function의 서버 전용 service_role만 사용합니다.
revoke all on public.push_subscriptions from anon, authenticated;
