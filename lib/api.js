import { supabase } from "./supabaseClient";

const STATUS_LABEL = { pending: "대기", progress: "진행중", done: "완료", delayed: "지연", hold: "보류" };
const ATTACHMENTS_BUCKET = "task-attachments";

function formatAt(iso) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(iso).toISOString().slice(0, 10);
}

/* ---------------- accounts / admins ---------------- */

function mapAccountRow(r) {
  return { id: r.id, group: r.group, unitId: r.unit_id, role: r.role, name: r.name, email: r.email, phone: r.phone, password: r.password, createdAt: r.created_at };
}
function mapAdminRow(r) {
  return { id: r.id, name: r.name, email: r.email, phone: r.phone, password: r.password, createdAt: r.created_at };
}

export async function fetchAccounts() {
  const { data, error } = await supabase.from("accounts").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(mapAccountRow);
}
export async function fetchAdmins() {
  const { data, error } = await supabase.from("admins").select("*");
  if (error) throw error;
  return data.map(mapAdminRow);
}
export async function createAccount({ group, unitId, role, name, email, phone, password }) {
  const { data, error } = await supabase.from("accounts").insert({ group, unit_id: unitId, role, name, email, phone, password }).select().single();
  if (error) throw error;
  return mapAccountRow(data);
}
export async function updateAccount(id, { group, unitId, role, name, email, phone, password }) {
  const { data, error } = await supabase.from("accounts").update({ group, unit_id: unitId, role, name, email, phone, password }).eq("id", id).select().single();
  if (error) throw error;
  return mapAccountRow(data);
}
export async function deleteAccount(id) {
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- tasks / logs ---------------- */

function mapLogRow(l) {
  return { id: l.id, at: formatAt(l.created_at), text: l.text, by: { name: l.by_name, group: l.by_group }, kind: l.kind || undefined };
}
function mapTaskRow(r, logRows = []) {
  return {
    id: r.id, categoryId: r.category_id, itemId: r.item_id, title: r.title, cycle: r.cycle,
    unitId: r.unit_id, role: r.role, owner: r.owner, status: r.status, due: r.due,
    priority: r.priority, desc: r.description, requested: r.requested, createdAt: r.created_at,
    logs: logRows.map(mapLogRow),
  };
}

export async function fetchTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .select("*, task_logs(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((row) => mapTaskRow(row, [...row.task_logs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))));
}

async function insertLog(taskId, text, actor, kind) {
  const { data, error } = await supabase.from("task_logs").insert({
    task_id: taskId, text, by_name: actor.name, by_group: actor.group, kind: kind || null,
  }).select().single();
  if (error) throw error;
  return mapLogRow(data);
}

async function notifyHq(text, taskId, kind) {
  await supabase.from("notifications").insert({ kind, text, task_id: taskId, recipient_scope: "all_hq" });
}

export async function createTask({ categoryId, itemId, title, cycle, unitId, role, owner, priority, due, desc }, actor) {
  const { data, error } = await supabase.from("tasks").insert({
    category_id: categoryId, item_id: itemId, title, cycle, unit_id: unitId, role, owner,
    status: "pending", priority, due, description: desc, requested: false,
  }).select().single();
  if (error) throw error;
  const log = await insertLog(data.id, "업무 등록됨", actor);
  await notifyHq(`${owner} — ${title} 등록`, data.id, "assign");
  return { ...mapTaskRow(data), logs: [log] };
}

export async function updateTaskStatus(taskId, status, actor) {
  const clearsRequest = actor.group !== "admin" && actor.group !== "hq";
  const { data, error } = await supabase.from("tasks").update({
    status, ...(clearsRequest ? { requested: false } : {}),
  }).eq("id", taskId).select().single();
  if (error) throw error;
  const log = await insertLog(taskId, `상태 변경 → ${STATUS_LABEL[status]}`, actor);
  if (actor.group === "branch") await notifyHq(`"${data.title}" 상태가 ${STATUS_LABEL[status]}(으)로 변경됨`, taskId, "status");
  return { task: mapTaskRow(data), log };
}

export async function addTaskLog(taskId, text, actor) {
  const clearsRequest = actor.group !== "admin" && actor.group !== "hq";
  let taskRow = null;
  if (clearsRequest) {
    const { data, error } = await supabase.from("tasks").update({ requested: false }).eq("id", taskId).select().single();
    if (error) throw error;
    taskRow = data;
  }
  const log = await insertLog(taskId, text, actor);
  if (actor.group === "branch") {
    const title = taskRow ? taskRow.title : (await supabase.from("tasks").select("title").eq("id", taskId).single()).data.title;
    await notifyHq(`${actor.name} — "${title}" 진행 내용 공유: ${text}`, taskId, "update");
  }
  return log;
}

export async function requestUpdate(taskId, actor) {
  const { data, error } = await supabase.from("tasks").update({ requested: true }).eq("id", taskId).select().single();
  if (error) throw error;
  const log = await insertLog(taskId, "담당자에게 진행상황 업데이트를 요청했습니다", actor, "request");
  await supabase.from("notifications").insert({
    kind: "request", text: `${data.owner}님에게 "${data.title}" 진행상황 요청`, task_id: taskId,
    recipient_scope: "unit", recipient_id: data.unit_id,
  });
  return { task: mapTaskRow(data), log };
}

/* ---------------- attachments ---------------- */

function mapAttachmentRow(r) {
  return { id: r.id, taskId: r.task_id, filePath: r.file_path, fileName: r.file_name, fileSize: r.file_size, uploadedByName: r.uploaded_by_name, uploadedByGroup: r.uploaded_by_group, createdAt: r.created_at };
}

export async function fetchAttachments(taskId) {
  const { data, error } = await supabase.from("task_attachments").select("*").eq("task_id", taskId).order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(mapAttachmentRow);
}

export async function uploadAttachment(taskId, file, actor) {
  const filePath = `${taskId}/${crypto.randomUUID()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(filePath, file);
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.from("task_attachments").insert({
    task_id: taskId, file_path: filePath, file_name: file.name, file_size: file.size,
    uploaded_by_name: actor.name, uploaded_by_group: actor.group,
  }).select().single();
  if (error) throw error;

  const log = await insertLog(taskId, `파일 첨부: ${file.name}`, actor);
  if (actor.group === "branch") await notifyHq(`${actor.name} — 파일 첨부: ${file.name}`, taskId, "update");
  return { attachment: mapAttachmentRow(data), log };
}

export async function getAttachmentSignedUrl(filePath) {
  const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(filePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

/* ---------------- notifications ---------------- */

function mapNotificationRow(r) {
  return { id: r.id, kind: r.kind, text: r.text, at: formatAt(r.created_at), taskId: r.task_id, recipientScope: r.recipient_scope, recipientId: r.recipient_id };
}

export async function fetchNotifications() {
  const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return data.map(mapNotificationRow);
}

export function isNotificationForViewer(n, currentUser) {
  if (currentUser.type === "admin") return n.recipientScope === "all_hq" || n.recipientScope === "all_admin";
  if (n.recipientScope === "all_hq") return currentUser.group === "hq";
  if (n.recipientScope === "unit") return n.recipientId === currentUser.unitId;
  if (n.recipientScope === "account") return n.recipientId === currentUser.accountId;
  return false;
}

/* ---------------- sent links (magic links) ---------------- */

function mapSentLinkRow(r, appUrl) {
  return { id: r.id, accountId: r.account_id, name: r.name, unit: r.unit, role: r.role, method: r.method, taskId: r.task_id, at: formatAt(r.created_at), link: `${appUrl}/?token=${r.token}` };
}

export async function fetchSentLinks() {
  const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
  const { data, error } = await supabase.from("sent_links").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((r) => mapSentLinkRow(r, appUrl));
}

export async function createSentLink({ accountId, name, unit, role, method, taskId }) {
  const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
  const token = crypto.randomUUID().replace(/-/g, "");
  const { data, error } = await supabase.from("sent_links").insert({
    account_id: accountId, token, name, unit, role, method, task_id: taskId || null,
  }).select().single();
  if (error) throw error;
  return mapSentLinkRow(data, appUrl);
}

export async function resolveLinkToken(token) {
  const { data, error } = await supabase.from("sent_links").select("*, accounts(*)").eq("token", token).maybeSingle();
  if (error) throw error;
  if (!data || !data.accounts) return null;
  return { account: mapAccountRow(data.accounts), taskId: data.task_id };
}
