-- Additive stage-5 schema. Existing tables and policies remain unchanged.
create table if not exists public.jinil_orders_v1 (
 id uuid primary key default gen_random_uuid(),
 order_number text not null unique,
 payload jsonb not null default '{}'::jsonb,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.jinil_dispatches_v1 (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.jinil_orders_v1(id) on delete restrict,
 recipient_department text not null check (recipient_department in ('테프론부','가공부','생산부')),
 status text not null default '대기' check (status in ('대기','확인','완료')),
 sent_by uuid not null references auth.users(id),
 sent_at timestamptz not null default now(),
 confirmed_by uuid references auth.users(id),
 confirmed_at timestamptz,
 completed_by uuid references auth.users(id),
 completed_at timestamptz,
 unique(order_id, recipient_department),
 check ((status = '대기' and confirmed_at is null and completed_at is null)
    or (status = '확인' and confirmed_at is not null and completed_at is null)
    or (status = '완료' and confirmed_at is not null and completed_at is not null))
);
create index if not exists jinil_dispatches_v1_recipient_status_idx
 on public.jinil_dispatches_v1(recipient_department, status);
alter table public.jinil_orders_v1 enable row level security;
alter table public.jinil_dispatches_v1 enable row level security;
revoke all on public.jinil_orders_v1, public.jinil_dispatches_v1 from anon, authenticated;
grant select, insert on public.jinil_orders_v1 to authenticated;
grant select, insert on public.jinil_dispatches_v1 to authenticated;
-- Existing 'admin' is used for read-only oversight; supervisor is not yet provisioned.
create policy "jinil_orders_read" on public.jinil_orders_v1 for select to authenticated using (
 created_by = (select auth.uid()) or
 exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin') or
 exists (select 1 from public.jinil_dispatches_v1 d join public.profiles p
 on p.id = (select auth.uid()) where d.order_id = id and
 (p.department = d.recipient_department or
 (p.department = '생산동' and d.recipient_department = '생산부') or
 (p.department = '가공동' and d.recipient_department = '가공부')))
);
create policy "jinil_orders_insert" on public.jinil_orders_v1 for insert to authenticated
 with check (created_by = (select auth.uid()) and exists (
 select 1 from public.profiles p where p.id = (select auth.uid())
 and p.department in ('총무부','본사 총무')));
create policy "jinil_dispatches_read" on public.jinil_dispatches_v1 for select to authenticated using (
 sent_by = (select auth.uid()) or
 exists (select 1 from public.profiles p where p.id = (select auth.uid()) and
 (p.role = 'admin' or p.department = recipient_department or
 (p.department = '생산동' and recipient_department = '생산부') or
 (p.department = '가공동' and recipient_department = '가공부')))
);
create policy "jinil_dispatches_insert" on public.jinil_dispatches_v1 for insert to authenticated with check (
 sent_by = (select auth.uid()) and status = '대기' and
 confirmed_by is null and completed_by is null and
 exists (select 1 from public.jinil_orders_v1 o
 where o.id = order_id and o.created_by = (select auth.uid()))
);
-- Writes of status intentionally restricted until guarded transition RPC is verified.
