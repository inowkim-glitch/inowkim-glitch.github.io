-- Applied in Supabase project hjkcdaqzbsnmwpvpvpti on 2026-11-24.
-- Non-destructive isolated snapshot for V72 per-user dashboard layout.
create table if not exists public.jinil_v72_member_layout (
 user_id uuid primary key references auth.users(id) on delete cascade,
 snapshot jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now(),
 constraint jinil_v72_member_layout_object check (jsonb_typeof(snapshot)='object')
);
alter table public.jinil_v72_member_layout enable row level security;
create policy jinil_v72_layout_select on public.jinil_v72_member_layout for select to authenticated using (user_id=(select auth.uid()));
create policy jinil_v72_layout_insert on public.jinil_v72_member_layout for insert to authenticated with check (user_id=(select auth.uid()));
create policy jinil_v72_layout_update on public.jinil_v72_member_layout for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
revoke all on public.jinil_v72_member_layout from anon;
grant select,insert,update on public.jinil_v72_member_layout to authenticated;
do $m$
begin
 if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='jinil_v72_member_layout') then
  alter publication supabase_realtime add table public.jinil_v72_member_layout;
 end if;
end $m$;
