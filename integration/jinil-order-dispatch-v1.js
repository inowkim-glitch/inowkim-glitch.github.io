/**
 * Jinil V72 integration / order routing core v1.
 * Stage 5 working branch only. No Supabase mutations.
 * Each recipient department has its own queue and status.
 * UI/DB adapters must persist and validate transitions server-side.
 */
export const ORDER_STATUS = Object.freeze({
  WAITING: "대기",
  CONFIRMED: "확인",
  COMPLETED: "완료"
});
export const ORDER_DEPARTMENTS = Object.freeze(["총무부", "테프론부", "가공부", "생산부"]);
const ALLOWED = Object.freeze({
  "대기": ["확인"],
  "확인": ["완료"],
  "완료": []
});
function assert(value, message) {
  if (!value) throw new Error(message);
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
/**
 * Create independent department deliveries on a single send action.
 * The caller must persist these records atomically in Supabase before
 * reporting the order as delivered to the user.
 */
export function prepareDepartmentDispatch({ orderId, recipients, sentBy, now = new Date().toISOString() }) {
  assert(orderId != null && String(orderId).trim(), "발주 ID가 필요합니다.");
  assert(sentBy != null && String(sentBy).trim(), "송부자 ID가 필요합니다.");
  assert(Array.isArray(recipients) && recipients.length > 0, "송부할 부서를 선택하세요.");
  const unique = [...new Set(recipients)];
  assert(unique.length === recipients.length, "중복 부서가 포함됐습니다.");
  for (const department of unique)
    assert(ORDER_DEPARTMENTS.includes(department) && department !== "총무부", "허용되지 않은 수신 부서입니다.");
  return unique.map(department => ({
    order_id: orderId,
    recipient_department: department,
    status: ORDER_STATUS.WAITING,
    sent_by: sentBy,
    sent_at: now,
    confirmed_by: null,
    confirmed_at: null,
    completed_by: null,
    completed_at: null
  }));
}
/**
 * Pure draft transition. Actual updates must use a guarded server-side
 * transaction checking the authenticated actor's department/role and
 * status precondition to prevent stale tablet writes.
 */
export function prepareStatusTransition({ delivery, nextStatus, actor, now = new Date().toISOString() }) {
  assert(delivery && typeof delivery === "object", "수신 발주 기록이 필요합니다.");
  assert(actor?.id, "로그인 사용자 정보가 필요합니다.");
  assert(actor.department === delivery.recipient_department || actor.role === "supervisor",
    "해당 부서의 발주 처리 권한이 없습니다.");
  assert((ALLOWED[delivery.status] || []).includes(nextStatus),
    "허용되지 않은 상태 변경입니다.");
  const result = clone(delivery);
  result.status = nextStatus;
  if (nextStatus === ORDER_STATUS.CONFIRMED) {
    result.confirmed_by = actor.id;
    result.confirmed_at = now;
  }
  if (nextStatus === ORDER_STATUS.COMPLETED) {
    result.completed_by = actor.id;
    result.completed_at = now;
  }
  return result;
}
export function summarizeDispatch(deliveries) {
  const list = Array.isArray(deliveries) ? deliveries : [];
  return {
    total: list.length,
    waiting: list.filter(v => v.status === ORDER_STATUS.WAITING).length,
    confirmed: list.filter(v => v.status === ORDER_STATUS.CONFIRMED).length,
    completed: list.filter(v => v.status === ORDER_STATUS.COMPLETED).length
  };
}
