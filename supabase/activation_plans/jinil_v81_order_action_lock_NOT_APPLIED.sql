-- NOT APPLIED. V81 isolated test only. Never run on production before user approval.
-- Combined replacement for completion revert plan; adds scoped lease table/RLS. Do not apply both plans.
BEGIN;
DO $guard$
BEGIN
 IF md5(pg_get_functiondef('public.jinil_guard_dispatch_v1()'::regprocedure)) IS DISTINCT FROM '54d20b56d831ba9c648c1f19362489fe' THEN
  RAISE EXCEPTION 'Existing guard differs; stop and re-review';
 END IF;
END;
$guard$;
-- V81 edit/cancel lease; deploy together with a verified general-affairs workflow.
CREATE TABLE public.jinil_order_action_locks (
 order_id uuid PRIMARY KEY REFERENCES public.jinil_orders(id) ON DELETE CASCADE,
 action text NOT NULL CHECK (action IN ('edit','cancel')),
 token uuid NOT NULL,
 owner_id uuid NOT NULL,
 expires_at timestamptz NOT NULL
);
ALTER TABLE public.jinil_order_action_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jinil_order_action_locks FROM PUBLIC, anon, authenticated;
GRANT SELECT(order_id,action,expires_at) ON public.jinil_order_action_locks TO authenticated;
CREATE POLICY jinil_order_action_lock_read ON public.jinil_order_action_locks FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.jinil_dispatches d WHERE d.order_id=jinil_order_action_locks.order_id));
CREATE SCHEMA IF NOT EXISTS jinil_private;
REVOKE ALL ON SCHEMA jinil_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA jinil_private TO authenticated;
-- private function is callable only by authenticated, with a fresh profile check on each call.
CREATE FUNCTION jinil_private.order_action_lease(p_order uuid,p_action text,p_token uuid,p_op text)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $lease$
DECLARE deadline timestamptz;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.department IN ('총무부','본사 총무') AND p.role IN ('staff','super_admin')) THEN
  RAISE EXCEPTION '총무과만 수정·취소 잠금을 사용할 수 있습니다.';
 END IF;
 IF p_order IS NULL OR p_token IS NULL OR p_action NOT IN ('edit','cancel') OR p_action IS NULL OR p_op NOT IN ('acquire','renew','release') OR p_op IS NULL THEN
  RAISE EXCEPTION 'Invalid order action';
 END IF;
 -- Same transaction mutex as dispatch status guard. Try, never wait behind another action.
 IF NOT pg_try_advisory_xact_lock(hashtextextended(p_order::text,811125)) THEN
  RAISE EXCEPTION '다른 발주 작업이 진행 중입니다. 다시 시도하세요.';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.jinil_dispatches d WHERE d.order_id=p_order) THEN
  RAISE EXCEPTION '발송된 발주를 찾을 수 없습니다.';
 END IF;
 IF p_op='release' THEN
  DELETE FROM public.jinil_order_action_locks WHERE order_id=p_order AND token=p_token AND action=p_action AND owner_id=auth.uid();
  RETURN NULL;
 END IF;
 IF EXISTS (SELECT 1 FROM public.jinil_dispatches WHERE order_id=p_order AND status IN ('완료','취소')) THEN RAISE EXCEPTION '완료 또는 취소된 발주서는 현재 수정·취소할 수 없습니다.'; END IF;
 deadline=clock_timestamp()+interval '90 seconds';
 IF p_op='renew' THEN
  UPDATE public.jinil_order_action_locks SET expires_at=deadline WHERE order_id=p_order AND token=p_token AND action=p_action AND owner_id=auth.uid() AND expires_at>clock_timestamp();
 ELSE
  INSERT INTO public.jinil_order_action_locks(order_id,action,token,owner_id,expires_at) VALUES(p_order,p_action,p_token,auth.uid(),deadline)
  ON CONFLICT(order_id) DO UPDATE SET action=excluded.action,token=excluded.token,owner_id=excluded.owner_id,expires_at=excluded.expires_at
  WHERE jinil_order_action_locks.expires_at<=clock_timestamp() OR (jinil_order_action_locks.token=p_token AND jinil_order_action_locks.action=p_action AND jinil_order_action_locks.owner_id=auth.uid());
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION '이미 다른 수정·취소 작업이 진행 중이거나 잠금이 만료되었습니다.'; END IF;
 RETURN deadline;
END;
$lease$;
REVOKE ALL ON FUNCTION jinil_private.order_action_lease(uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION jinil_private.order_action_lease(uuid,text,uuid,text) TO authenticated;
CREATE FUNCTION public.jinil_order_action_lease(p_order uuid,p_action text,p_token uuid,p_op text)
RETURNS timestamptz LANGUAGE sql SECURITY INVOKER SET search_path='' AS $rpc$
 SELECT jinil_private.order_action_lease(p_order,p_action,p_token,p_op)
$rpc$;
REVOKE ALL ON FUNCTION public.jinil_order_action_lease(uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.jinil_order_action_lease(uuid,text,uuid,text) TO authenticated;


-- Cancellation is retained, not deleted. Existing timestamp checks still apply.
ALTER TABLE public.jinil_dispatches DROP CONSTRAINT jinil_dispatches_status_check;
ALTER TABLE public.jinil_dispatches ADD CONSTRAINT jinil_dispatches_status_check CHECK(status IN ('대기','확인','완료','취소'));
CREATE FUNCTION jinil_private.commit_order_action(p_order uuid,p_action text,p_token uuid,p_patch jsonb,p_before jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $commit$
DECLARE old_payload jsonb; next_payload jsonb; old_fields jsonb; new_fields jsonb;
DECLARE allowed text[]:=ARRAY['company','phone','deliveryMethod','deliveryAddress','dueDate','memo','items'];
DECLARE event jsonb; changed_at timestamptz:=clock_timestamp();
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.department IN ('총무부','본사 총무') AND p.role IN ('staff','super_admin')) THEN RAISE EXCEPTION '총무과만 수정·취소할 수 있습니다.'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('edit','cancel') THEN RAISE EXCEPTION 'Invalid action'; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended(p_order::text,811125)) THEN RAISE EXCEPTION '다른 발주 작업이 진행 중입니다.'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.jinil_order_action_locks WHERE order_id=p_order AND action=p_action AND token=p_token AND owner_id=auth.uid() AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION '작업 잠금이 만료되었습니다. 다시 열어 주세요.'; END IF;
 IF EXISTS (SELECT 1 FROM public.jinil_dispatches WHERE order_id=p_order AND status IN ('완료','취소')) THEN RAISE EXCEPTION '완료 또는 취소된 발주서는 현재 수정·취소할 수 없습니다.'; END IF;
 SELECT payload INTO STRICT old_payload FROM public.jinil_orders WHERE id=p_order FOR UPDATE;
 SELECT jsonb_object_agg(k,coalesce(nullif(old_payload->k,'null'::jsonb),CASE WHEN k='items' THEN '[]'::jsonb ELSE '""'::jsonb END)) INTO old_fields FROM unnest(allowed) k;
 IF p_action='edit' THEN
  IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR p_patch-allowed <> '{}'::jsonb OR NOT(p_patch ?& allowed) OR jsonb_typeof(p_patch->'items') IS DISTINCT FROM 'array' OR nullif(btrim(p_patch->>'company'),'') IS NULL THEN RAISE EXCEPTION '수정 항목이 올바르지 않습니다.'; END IF;
  IF p_before IS DISTINCT FROM old_fields THEN RAISE EXCEPTION '발주 내용이 이미 변경되었습니다. 새로 조회하세요.'; END IF;
  new_fields=p_patch;
  event=jsonb_build_object('at',changed_at,'by',auth.uid(),'action','edit','before',old_fields,'after',new_fields);
  next_payload=old_payload||p_patch||jsonb_build_object('orderRevisionHistory',coalesce(old_payload->'orderRevisionHistory','[]'::jsonb)||jsonb_build_array(event));
  IF old_fields->'dueDate' IS DISTINCT FROM new_fields->'dueDate' THEN
   next_payload=next_payload||jsonb_build_object('revisedDueDate',new_fields->>'dueDate','dueRevisionHistory',coalesce(old_payload->'dueRevisionHistory','[]'::jsonb)||jsonb_build_array(jsonb_build_object('id',p_token,'at',changed_at,'by',auth.uid(),'from',coalesce(old_payload->>'revisedDueDate',old_fields->>'dueDate'),'to',new_fields->>'dueDate','seenBy','[]'::jsonb)));
  END IF;
 ELSE
  event=jsonb_build_object('at',changed_at,'by',auth.uid(),'action','cancel','beforeStatus',(SELECT jsonb_agg(jsonb_build_object('department',department,'status',status)) FROM public.jinil_dispatches WHERE order_id=p_order));
  next_payload=old_payload||jsonb_build_object('status','cancelled','orderRevisionHistory',coalesce(old_payload->'orderRevisionHistory','[]'::jsonb)||jsonb_build_array(event));
 END IF;
 UPDATE public.jinil_orders SET payload=next_payload,updated_at=changed_at WHERE id=p_order;
 UPDATE public.jinil_dispatches SET order_summary=order_summary||next_payload,status=CASE WHEN p_action='cancel' THEN '취소' ELSE status END,updated_by=auth.uid() WHERE order_id=p_order;
 INSERT INTO public.jinil_notifications(user_id,dispatch_id,department,block_key,title,body)
 SELECT p.id,d.id,d.department,'부서/'||d.department||'/발주목록확인','진일 통합관리',CASE WHEN p_action='edit' THEN '발주서가 수정되었습니다.' ELSE '발주서가 취소되었습니다.' END
 FROM public.jinil_dispatches d CROSS JOIN public.profiles p WHERE d.order_id=p_order AND (p.role='super_admin' OR (p.role IN ('staff','admin') AND (CASE p.department WHEN '생산동' THEN '생산부' WHEN '가공동' THEN '가공부' WHEN '테프론동' THEN '테프론부' WHEN '본사 총무' THEN '총무부' ELSE p.department END)=d.department))
 ON CONFLICT(user_id,dispatch_id) DO UPDATE SET title=excluded.title,body=excluded.body,read_at=NULL,created_at=changed_at;
 DELETE FROM public.jinil_order_action_locks WHERE order_id=p_order AND token=p_token AND owner_id=auth.uid();
END;
$commit$;
REVOKE ALL ON FUNCTION jinil_private.commit_order_action(uuid,text,uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION jinil_private.commit_order_action(uuid,text,uuid,jsonb,jsonb) TO authenticated;
CREATE FUNCTION public.jinil_commit_order_action(p_order uuid,p_action text,p_token uuid,p_patch jsonb,p_before jsonb)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $rpc$
 SELECT jinil_private.commit_order_action(p_order,p_action,p_token,p_patch,p_before)
$rpc$;
REVOKE ALL ON FUNCTION public.jinil_commit_order_action(uuid,text,uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.jinil_commit_order_action(uuid,text,uuid,jsonb,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.jinil_guard_dispatch_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare actor text;
begin
 actor=public.jinil_workspace_dept();
 if tg_op='INSERT' then
  if actor is null or (actor <> '총무부' and actor <> '관리자') then raise exception 'Only general affairs can dispatch';end if;
  if new.status <> '대기' or new.confirmed_at is not null or new.completed_at is not null then
   raise exception 'Initial dispatch must be waiting';
  end if;
  if new.department not in ('테프론부','생산부','가공부') then
   raise exception 'Invalid recipient department';
  end if;
  new.sent_at=now();new.updated_by=auth.uid();
  return new;
 end if;
 -- Serialize each dispatch transition against general-affairs edit/cancel acquisition.
 if not pg_try_advisory_xact_lock(hashtextextended(old.order_id::text,811125)) then
  raise exception '총무과 또는 다른 담당자가 발주 작업 중입니다. 다시 시도해 주세요.';
 end if;
 -- Only the checked private definer function may write revised summaries/cancellation.
 if current_user=(select pg_get_userbyid(proowner) from pg_proc where oid='jinil_private.commit_order_action(uuid,text,uuid,jsonb,jsonb)'::regprocedure)
    and exists(select 1 from public.jinil_order_action_locks l where l.order_id=old.order_id and l.owner_id=auth.uid() and l.expires_at>clock_timestamp()
       and ((l.action='edit' and new.status=old.status) or (l.action='cancel' and new.status='취소')))
    and new.id=old.id and new.order_id=old.order_id and new.department=old.department and new.sent_at=old.sent_at
    and new.confirmed_at is not distinct from old.confirmed_at and new.completed_at is not distinct from old.completed_at then
   new.updated_by=auth.uid(); return new;
 end if;
 if exists(select 1 from public.jinil_order_action_locks l where l.order_id=old.order_id and l.expires_at>clock_timestamp()) then
  raise exception '총무과에서 현재 발주 수정 또는 취소 작업 중입니다.';
 end if;
 if actor is null or (actor <> '관리자' and actor is distinct from old.department) then
  raise exception 'Only recipient department can transition dispatch';
 end if;
 if new.id is distinct from old.id or
    new.order_id is distinct from old.order_id or
    new.department is distinct from old.department or
    new.sent_at is distinct from old.sent_at or
    new.order_summary is distinct from old.order_summary then
   raise exception 'Dispatch metadata cannot be changed';
 end if;
 if new.confirmed_at is distinct from old.confirmed_at or
    new.completed_at is distinct from old.completed_at then
   -- client adapter may supply timestamps; overwrite only the legitimate step below
   null;
 end if;
 if old.status='대기' and new.status='확인' then
  if new.completed_at is not null then raise exception 'Completion cannot precede confirmation';end if;
  new.confirmed_at=now();
 elsif old.status='확인' and new.status='완료' then
  if old.confirmed_at is null then raise exception 'Prior confirmation required';end if;
  new.confirmed_at=old.confirmed_at;new.completed_at=now();
 elsif old.status='완료' and new.status='확인' then
  if actor is distinct from old.department or actor not in ('생산부','가공부','테프론부') then
   raise exception 'Only recipient production department can undo completion';
  end if;
  if old.confirmed_at is null then raise exception 'Prior confirmation required';end if;
  new.confirmed_at=old.confirmed_at;new.completed_at=null;
 else
  raise exception 'Invalid status transition';
 end if;
 new.updated_by=auth.uid();
 return new;
end;
$function$;
COMMIT;
