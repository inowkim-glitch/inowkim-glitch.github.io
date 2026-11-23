/**
 * Jinil stage 5: Supabase order queue adapter.
 * Works only after integration/sql/jinil_orders_dispatches_v1.sql is applied.
 * The caller supplies an authenticated supabase-js client.
 * No secrets and no automatic DB modification at module load.
 */
import { prepareDepartmentDispatch } from "./jinil-order-dispatch-v1.js";

function requireClient(client) {
  if (!client?.from || !client?.auth?.getUser) throw new Error("인증된 Supabase 클라이언트가 필요합니다.");
}
async function currentUser(client) {
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user?.id) throw new Error("로그인이 필요합니다.");
  return data.user.id;
}
function check(result, operation) {
  if (result.error) throw new Error(operation + ": " + result.error.message);
  return result.data;
}

/** Create the order only. A send is confirmed only if every recipient is persisted. */
export async function createOrder(client, { orderNumber, payload }) {
  requireClient(client);
  const uid = await currentUser(client);
  if (!String(orderNumber || "").trim()) throw new Error("발주번호를 입력하세요.");
  const row = { order_number: orderNumber.trim(), payload: payload ?? {}, created_by: uid };
  return check(await client.from("jinil_orders_v1").insert(row).select("id,order_number,payload,created_at").single(), "발주서 저장 실패");
}

/**
 * Dispatch to recipients. A failed request is NOT marked sent.
 * DB has unique(order_id,recipient_department) to prevent duplicate delivery.
 * Multi-row INSERT is atomic within a single PostgREST request.
 */
export async function sendOrder(client, { orderId, recipients }) {
  requireClient(client);
  const uid = await currentUser(client);
  const rows = prepareDepartmentDispatch({ orderId, recipients, sentBy: uid });
  const response = await client.from("jinil_dispatches_v1")
    .insert(rows)
    .select("id,order_id,recipient_department,status,sent_at");
  const stored = check(response, "부서별 송부 실패");
  if (!Array.isArray(stored) || stored.length !== rows.length) {
    throw new Error("송부 결과 개수가 일치하지 않습니다. 서버 기록을 확인하세요.");
  }
  return stored;
}
/** Department queue, ordered oldest-first, with RLS controlling visibility. */
export async function loadDepartmentQueue(client, { department, status = null }) {
  requireClient(client);
  await currentUser(client);
  if (!department) throw new Error("부서가 필요합니다.");
  let query = client.from("jinil_dispatches_v1")
    .select("id,order_id,recipient_department,status,sent_at,confirmed_at,completed_at")
    .eq("recipient_department", department).order("sent_at", { ascending: true });
  if (status) query = query.eq("status", status);
  return check(await query, "부서별 대기목록 조회 실패");
}
/** Subscribe to change notifications, then requery through RLS. */
export function watchDepartmentQueue(client, { department, onChange }) {
  requireClient(client);
  if (typeof onChange !== "function") throw new TypeError("onChange callback required");
  const channel = client.channel("jinil-dispatch-" + department + "-" + Math.random().toString(36).slice(2))
    .on("postgres_changes", {
      event: "*", schema: "public", table: "jinil_dispatches_v1",
      filter: "recipient_department=eq." + department
    }, () => onChange())
    .subscribe();
  return () => client.removeChannel(channel);
}
// '확인'/'완료' intentionally not implemented as client-side updates.
// They require an authenticated, guarded server-side transaction to prevent
// another department from writing or skipping a status.
