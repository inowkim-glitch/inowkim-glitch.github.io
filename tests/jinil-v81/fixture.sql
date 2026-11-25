-- Isolated synthetic data only. Never run against the operational database.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.profiles(id uuid primary key,department text,role text);
CREATE FUNCTION public.jinil_workspace_dept() RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$ SELECT CASE WHEN p.role='super_admin' THEN '관리자' WHEN p.role='admin' THEN null ELSE p.department END FROM public.profiles p WHERE id=auth.uid() $$;
CREATE TABLE public.jinil_orders(id uuid PRIMARY KEY,order_no text UNIQUE NOT NULL,payload jsonb NOT NULL,created_by uuid NOT NULL,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE public.jinil_dispatches(id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES public.jinil_orders(id),department text NOT NULL,status text NOT NULL,sent_at timestamptz NOT NULL DEFAULT now(),confirmed_at timestamptz,completed_at timestamptz,updated_by uuid,order_summary jsonb NOT NULL,UNIQUE(order_id,department),CONSTRAINT jinil_dispatches_status_check CHECK(status IN ('대기','확인','완료')),CHECK((status<>'확인' OR confirmed_at IS NOT NULL) AND (status<>'완료' OR (confirmed_at IS NOT NULL AND completed_at IS NOT NULL))));
CREATE TABLE public.jinil_notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,dispatch_id uuid NOT NULL,department text,block_key text,title text,body text,read_at timestamptz,created_at timestamptz DEFAULT now(),UNIQUE(user_id,dispatch_id));
GRANT SELECT ON public.profiles, public.jinil_dispatches TO authenticated;
GRANT UPDATE ON public.jinil_dispatches TO authenticated;
ALTER TABLE public.jinil_dispatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_read ON public.jinil_dispatches FOR SELECT TO authenticated USING (public.jinil_workspace_dept() IN ('관리자','총무부') OR department=public.jinil_workspace_dept());
CREATE POLICY fixture_update ON public.jinil_dispatches FOR UPDATE TO authenticated USING (department=public.jinil_workspace_dept()) WITH CHECK(department=public.jinil_workspace_dept());
INSERT INTO public.profiles VALUES ('00000000-0000-0000-0000-000000000001','총무부','staff'),('00000000-0000-0000-0000-000000000002','생산부','staff'),('00000000-0000-0000-0000-000000000003','가공부','staff');
INSERT INTO public.jinil_orders(id,order_no,payload,created_by) VALUES
('10000000-0000-0000-0000-000000000001','fixture1','{"company":"A","items":[]}','00000000-0000-0000-0000-000000000001'),
('10000000-0000-0000-0000-000000000002','fixture2','{"company":"C","items":[]}','00000000-0000-0000-0000-000000000001');
INSERT INTO public.jinil_dispatches(id,order_id,department,status,confirmed_at,order_summary) VALUES
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','생산부','확인',now(),'{"company":"A","items":[]}'),
('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','생산부','확인',now(),'{"company":"C","items":[]}');
