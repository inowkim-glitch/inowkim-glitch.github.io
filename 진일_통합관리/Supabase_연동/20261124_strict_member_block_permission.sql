-- 진일 통합관리: 회원별 체크된 블록만 열람, 기존 데이터를 변경하지 않음
CREATE OR REPLACE FUNCTION public.jinil_can_view_block(block_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND (
        p.role = 'super_admin'
        OR EXISTS(
          SELECT 1 FROM public.jinil_block_access a
          WHERE a.user_id = p.id AND a.block_key = block_path
        )
      )
  )
$function$;
