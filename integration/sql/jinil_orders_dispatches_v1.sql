-- 역사적 작업 초안. 실제 운영 DB에 적용하지 마세요.
-- 2026-11-23 실제 Supabase 생성 테이블:
--   public.jinil_orders(id,order_no,payload,created_by,created_at,updated_at)
--   public.jinil_dispatches(id,order_id,department,status,sent_at,confirmed_at,completed_at,updated_by,order_summary)
-- status: 대기 -> 확인 -> 완료 (transition trigger enforced).
-- 이 파일의 과거 _v1 테이블 설계는 실제 사용 중인 테이블과 불일치하여 폐기되었습니다.
-- 실제 연결 소스: integration/jinil-supabase-orders-adapter-v1.js
-- 기존 업무/테이블 보존, 읽기 전용 검증만 이 파일에서 실행하세요.
select table_name from information_schema.tables
where table_schema='public' and table_name in ('jinil_orders','jinil_dispatches')
order by table_name;
