-- Execute after activation SQL in isolated DB only.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT public.jinil_order_action_lease('10000000-0000-0000-0000-000000000001','edit','30000000-0000-0000-0000-000000000001','acquire');
DO $$ BEGIN
 BEGIN
 PERFORM public.jinil_order_action_lease('10000000-0000-0000-0000-000000000001','cancel','30000000-0000-0000-0000-000000000002','acquire');
 RAISE EXCEPTION 'TEST: second lock was accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '이미 다른%' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
DO $$ BEGIN
 IF (SELECT action FROM public.jinil_order_action_locks WHERE order_id='10000000-0000-0000-0000-000000000001') IS DISTINCT FROM 'edit' THEN RAISE EXCEPTION 'Lock visibility failed'; END IF;
 BEGIN
 UPDATE public.jinil_dispatches SET status='완료' WHERE id='20000000-0000-0000-0000-000000000001';
 RAISE EXCEPTION 'TEST: locked status update allowed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '총무과에서 현재%' THEN RAISE; END IF; END;
 BEGIN
 PERFORM public.jinil_order_action_lease('10000000-0000-0000-0000-000000000001','edit','30000000-0000-0000-0000-000000000002','acquire');
 RAISE EXCEPTION 'TEST: field department obtained lock';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '총무과만%' THEN RAISE; END IF; END;
 UPDATE public.jinil_dispatches SET status='완료' WHERE id='20000000-0000-0000-0000-000000000002';
 IF (SELECT status FROM public.jinil_dispatches WHERE id='20000000-0000-0000-0000-000000000002')<>'완료' THEN RAISE EXCEPTION 'Unrelated order blocked'; END IF;
 UPDATE public.jinil_dispatches SET status='확인' WHERE id='20000000-0000-0000-0000-000000000002';
 IF (SELECT completed_at FROM public.jinil_dispatches WHERE id='20000000-0000-0000-0000-000000000002') IS NOT NULL THEN RAISE EXCEPTION 'Reversion timestamp not cleared'; END IF;
 BEGIN
 UPDATE public.jinil_dispatches SET status='대기' WHERE id='20000000-0000-0000-0000-000000000002';
 RAISE EXCEPTION 'TEST: confirmed to waiting accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Invalid status transition' THEN RAISE; END IF; END;
 UPDATE public.jinil_dispatches SET status='완료' WHERE id='20000000-0000-0000-0000-000000000002';
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT public.jinil_commit_order_action('10000000-0000-0000-0000-000000000001','edit','30000000-0000-0000-0000-000000000001','{"company":"B","phone":"","deliveryMethod":"","deliveryAddress":"","dueDate":"","memo":"","items":[]}','{"company":"A","phone":"","deliveryMethod":"","deliveryAddress":"","dueDate":"","memo":"","items":[]}');
RESET ROLE;
DO $$ BEGIN
 IF (SELECT payload->>'company' FROM public.jinil_orders WHERE order_no='fixture1')<>'B' OR (SELECT order_summary->>'company' FROM public.jinil_dispatches WHERE id='20000000-0000-0000-0000-000000000001')<>'B' THEN RAISE EXCEPTION 'Atomic edit failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.jinil_order_action_locks) THEN RAISE EXCEPTION 'Lock not cleared'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.jinil_notifications WHERE body='발주서가 수정되었습니다.') THEN RAISE EXCEPTION 'Edit notification missing'; END IF;
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT public.jinil_order_action_lease('10000000-0000-0000-0000-000000000001','cancel','30000000-0000-0000-0000-000000000003','acquire');
SELECT public.jinil_commit_order_action('10000000-0000-0000-0000-000000000001','cancel','30000000-0000-0000-0000-000000000003',null,null);
RESET ROLE;
DO $$ BEGIN
 IF (SELECT status FROM public.jinil_dispatches WHERE id='20000000-0000-0000-0000-000000000001')<>'취소' OR (SELECT jsonb_array_length(payload->'orderRevisionHistory') FROM public.jinil_orders WHERE order_no='fixture1')<>2 THEN RAISE EXCEPTION 'Cancellation/history failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.jinil_order_action_locks) THEN RAISE EXCEPTION 'Cancel lock not cleared'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.jinil_notifications WHERE body='발주서가 취소되었습니다.') THEN RAISE EXCEPTION 'Cancellation notification missing'; END IF;
END $$;
SELECT 'ISOLATED POSTGRES TESTS PASSED' AS result;
