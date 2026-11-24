-- JINIL V78, 2026-11-24
-- NOT APPLIED: 운영 발주 INSERT 시 휴대폰 OS 푸시 전송을 켜는 절차.
-- 보안 정책/브라우저 수신 테스트 후 슈퍼관리자 운영 배포 승인에서만 적용.
-- 기존 숫자 테스트 웹훅 구성을 서버 내부에서 복제하므로 비밀키를 이 파일에 쓰지 않는다.
-- 사전 조건: jinil-push-order-v78 Edge Function ACTIVE 및 기존 'jinil-number-push' 웹훅 정상.
DO $$
DECLARE existing_def text; send_function text;
BEGIN
 IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='jinil_order_os_push_v78' AND tgrelid='public.jinil_dispatches'::regclass) THEN
   RAISE EXCEPTION 'Jinil order webhook already exists; do not duplicate';
 END IF;
 SELECT pg_get_triggerdef(t.oid) INTO existing_def
 FROM pg_trigger t
 WHERE t.tgrelid='public.shared_test'::regclass AND t.tgname='jinil-number-push' AND NOT t.tgisinternal;
 IF existing_def IS NULL OR position('/functions/v1/push-send' IN existing_def)=0
 THEN RAISE EXCEPTION 'Reference webhook was not found; inspect configuration before enabling'; END IF;
 send_function:=substring(existing_def FROM 'EXECUTE FUNCTION (.*)$');
 send_function:=replace(send_function,'/functions/v1/push-send','/functions/v1/jinil-push-order-v78');
 IF send_function IS NULL OR position('supabase_functions.http_request' IN send_function)=0 THEN
   RAISE EXCEPTION 'Unexpected webhook configuration'; END IF;
 EXECUTE 'CREATE TRIGGER jinil_order_os_push_v78 AFTER INSERT ON public.jinil_dispatches FOR EACH ROW EXECUTE FUNCTION ' || send_function;
END;
$$;
