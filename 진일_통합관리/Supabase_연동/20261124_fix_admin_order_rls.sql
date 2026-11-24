-- 진일 통합관리: 관리자 발주 조회 정책 교정 (2026-11-24)
-- 기존 데이터 및 다른 정책 유지. 승인된 관리자 블록에 소속된 발주만 조회.
DROP POLICY IF EXISTS jinil_admin_granted_order_view ON public.jinil_orders;
CREATE POLICY jinil_admin_granted_order_view
ON public.jinil_orders FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
  )
  AND EXISTS (
    SELECT 1 FROM public.jinil_dispatches d
    WHERE d.order_id = jinil_orders.id
      AND EXISTS (
        SELECT 1 FROM public.jinil_block_access b
        WHERE b.user_id = (SELECT auth.uid())
          AND (
            b.block_key LIKE ('부서/' || d.department || '/%발주목록확인/%')
            OR b.block_key LIKE ('부서/' || d.department || '/%발주목록검색/%')
            OR b.block_key LIKE ('부서/' || d.department || '/%납품예정달력/%')
            OR b.block_key LIKE '부서/총무부/%발주목록확인/%'
            OR b.block_key LIKE '부서/총무부/%발주목록검색/%'
            OR b.block_key LIKE '부서/총무부/%납품예정달력/%'
          )
      )
  )
);
