-- Original definition captured from current DB. Reference only; not applied.
CREATE OR REPLACE FUNCTION public.jinil_guard_dispatch_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare actor text;
begin
 actor=public.jinil_workspace_dept();
 if tg_op='INSERT' then
  if actor <> '총무부' and actor <> '관리자' then raise exception 'Only general affairs can dispatch';end if;
  if new.status <> '대기' or new.confirmed_at is not null or new.completed_at is not null then
   raise exception 'Initial dispatch must be waiting';
  end if;
  if new.department not in ('테프론부','생산부','가공부') then
   raise exception 'Invalid recipient department';
  end if;
  new.sent_at=now();new.updated_by=auth.uid();
  return new;
 end if;
 if actor <> '관리자' and actor is distinct from old.department then
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
 else
  raise exception 'Invalid status transition';
 end if;
 new.updated_by=auth.uid();
 return new;
end;
$function$;
