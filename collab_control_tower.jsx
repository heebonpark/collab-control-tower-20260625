import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import ExcelUploader from "./components/ui/ExcelUploader"; // NEW: Excel uploader component
import { loadAssignments, saveAssignments } from "./utils/persistence"; // NEW: persistence utilities
import { supabase } from "./lib/supabaseClient";
import {
  fetchAccounts, fetchAdmins, fetchTasks, fetchNotifications, fetchSentLinks,
  fetchCategories, createCategory, createCategoryItem,
  createAccount, updateAccount, deleteAccount, setAccountPassword,
  verifyStaffLogin, verifyAdminLogin,
  createTask, updateTaskStatus, updateTaskDetails, deleteTask, addTaskLog, requestUpdate,
  fetchAttachments, uploadAttachment, getAttachmentSignedUrl,
  createSentLink, resolveLinkToken, isNotificationForViewer,
} from "./lib/api";
import {
  Paperclip, Download,
  Bell, Search, Plus, X, ChevronRight, Building2, Store,
  Clock, AlertTriangle, CheckCircle2, Circle, PauseCircle, Filter,
  Calendar, MessageSquare, Send, LogOut, ShieldCheck, ArrowLeft,
  Mail, MessageCircle, Eye, EyeOff, Trash2, Pencil, UserPlus, Users,
  KeyRound, RefreshCw, Megaphone, Link2, Gauge, Check
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid
} from "recharts";

/* ---------------------------------------------------------
   디자인 토큰
--------------------------------------------------------- */
const T = {
  ink: "#14171F",
  sub: "#5B6270",
  faint: "#9AA1AC",
  canvas: "#F2F4F8",
  surface: "#FFFFFF",
  border: "#E3E6EC",
  hq: "#3851D6",
  hqSoft: "#EBEFFC",
  branch: "#E08A2C",
  branchSoft: "#FBF1E3",
  admin: "#7C3AED",
  adminSoft: "#F1E9FE",
  pending: "#9AA1AC",
  progress: "#2F8FE0",
  done: "#1FA67A",
  delayed: "#E5484D",
  hold: "#C28E1F",
  request: "#C28E1F",
};

const FONT = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');
  .cct-root, .cct-root * { box-sizing: border-box; font-family: -apple-system, "Apple SD Gothic Neo", "Pretendard", "Malgun Gothic", system-ui, sans-serif; }
  .cct-mono { font-family: 'JetBrains Mono', monospace; }
  .cct-root *::-webkit-scrollbar { width: 6px; height: 6px; }
  .cct-root *::-webkit-scrollbar-thumb { background: #D7DBE3; border-radius: 4px; }
  .cct-btn:focus-visible, .cct-input:focus-visible, .cct-chip:focus-visible { outline: 2px solid ${T.hq}; outline-offset: 1px; }
  @keyframes cct-pulse { 0%,100% { opacity:1 } 50% { opacity:.35 } }
  @keyframes cct-in { from { opacity:0; transform: translateY(4px) } to { opacity:1; transform:translateY(0) } }
  @keyframes cct-toast { from { opacity:0; transform: translateY(8px) } to { opacity:1; transform:translateY(0) } }
`;

/* ---------------------------------------------------------
   조직 구조 & 직책
--------------------------------------------------------- */
const ROLES_HQ = ["본부담당"];
const ROLES_BRANCH = ["지사장", "영업팀장", "고객팀장", "지사담당"];

const ORG = {
  hq: {
    label: "본부", color: T.hq, soft: T.hqSoft,
    units: [{ id: "hq-gbgw", name: "강북강원본부", roles: ROLES_HQ }],
  },
  branch: {
    label: "지사", color: T.branch, soft: T.branchSoft,
    units: [
      { id: "br-jungang", name: "중앙지사", roles: ROLES_BRANCH },
      { id: "br-gangbuk", name: "강북지사", roles: ROLES_BRANCH },
      { id: "br-seodaemun", name: "서대문지사", roles: ROLES_BRANCH },
      { id: "br-goyang", name: "고양지사", roles: ROLES_BRANCH },
      { id: "br-uijeongbu", name: "의정부지사", roles: ROLES_BRANCH },
      { id: "br-namyangju", name: "남양주지사", roles: ROLES_BRANCH },
      { id: "br-gangneung", name: "강릉지사", roles: ROLES_BRANCH },
      { id: "br-wonju", name: "원주지사", roles: ROLES_BRANCH },
    ],
  },
};
const ALL_UNITS = [...ORG.hq.units.map(u => ({ ...u, group: "hq" })), ...ORG.branch.units.map(u => ({ ...u, group: "branch" }))];

/* ---------------------------------------------------------
   업무 카탈로그 — 구분/세부업무는 DB(categories/category_items)에서 로드.
   관리자가 화면에서 새 구분/세부업무를 추가할 수 있다.
--------------------------------------------------------- */
const CATEGORY_COLOR_PRESETS = ["#3851D6", "#1FA67A", "#9B5DE5", "#C28E1F", "#E08A2C", "#E5484D", "#0EA5E9", "#D946EF"];
const CYCLE_STYLE = { "매일": { color: T.progress }, "상시": { color: T.faint }, "월마감": { color: T.delayed }, "월3회": { color: "#9B5DE5" }, "분기별": { color: "#1FA67A" } };
const CYCLE_LIST = ["매일", "상시", "월마감", "월3회", "분기별"];

function findItem(categories, categoryId, itemId) {
  const cat = categories.find((c) => c.id === categoryId);
  const item = cat && cat.items.find((i) => i.id === itemId);
  return { cat, item };
}

const STATUS = {
  pending: { label: "대기", color: T.pending, Icon: Circle },
  progress: { label: "진행중", color: T.progress, Icon: Clock },
  done: { label: "완료", color: T.done, Icon: CheckCircle2 },
  delayed: { label: "지연", color: T.delayed, Icon: AlertTriangle },
  hold: { label: "보류", color: T.hold, Icon: PauseCircle },
};
const PRIORITY = { high: { label: "높음", color: T.delayed }, mid: { label: "보통", color: T.progress }, low: { label: "낮음", color: T.faint } };

function uid(prefix = "T") { return `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`; }
function genPassword() { return Math.random().toString(36).slice(2, 8); }
function unitInfo(unitId) {
  for (const grp of Object.values(ORG)) {
    const u = grp.units.find((x) => x.id === unitId);
    if (u) return { ...u, group: grp.label === "본부" ? "hq" : "branch" };
  }
  return null;
}
function daysUntil(dateStr) {
  const d = new Date(dateStr); const now = new Date();
  d.setHours(0, 0, 0, 0); now.setHours(0, 0, 0, 0);
  return Math.round((d - now) / 86400000);
}

/* ---------------------------------------------------------
   공용 작은 컴포넌트
--------------------------------------------------------- */
function StatusPill({ status }) {
  const s = STATUS[status]; const Icon = s.Icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, fontSize: 12, fontWeight: 600, color: s.color, background: `${s.color}1A`, whiteSpace: "nowrap" }}>
      <Icon size={12} strokeWidth={2.5} />{s.label}
    </span>
  );
}
function CycleTags({ cycle }) {
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {cycle.map((c) => (
        <span key={c} style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 999, color: CYCLE_STYLE[c].color, background: `${CYCLE_STYLE[c].color}16` }}>{c}</span>
      ))}
    </span>
  );
}
function OrgBadge({ unitId, role, compact }) {
  const info = unitInfo(unitId);
  if (!info) return null;
  const color = info.group === "hq" ? T.hq : T.branch;
  const soft = info.group === "hq" ? T.hqSoft : T.branchSoft;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: compact ? "2px 8px" : "4px 10px", borderRadius: 8, background: soft, color, fontSize: compact ? 11.5 : 12.5, fontWeight: 600 }}>
      {info.group === "hq" ? <Building2 size={12} /> : <Store size={12} />}
      {info.name}{role ? ` · ${role}` : ""}
    </span>
  );
}
function CategoryTag({ categoryId, categories }) {
  const c = categories.find((x) => x.id === categoryId);
  if (!c) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: c.color }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.color }} />{c.name}
    </span>
  );
}
function Toast({ toasts }) {
  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 200, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map((t) => (
        <div key={t.id} style={{ background: T.ink, color: "#fff", padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 500, boxShadow: "0 8px 24px rgba(0,0,0,.18)", animation: "cct-toast .22s ease-out", display: "flex", alignItems: "center", gap: 8 }}>
          <CheckCircle2 size={15} color="#6EE7B7" />{t.text}
        </div>
      ))}
    </div>
  );
}
const inputStyle = { width: "100%", padding: "9px 11px", borderRadius: 9, border: `1px solid ${T.border}`, fontSize: 13.5, color: T.ink, background: "#fff" };
const labelStyle = { fontSize: 12.5, fontWeight: 600, color: T.sub, marginBottom: 6, display: "block" };

/* ---------------------------------------------------------
   로그인 화면 — 담당자(소속→단위→계정→비밀번호) / 관리자
--------------------------------------------------------- */
function LoginScreen({ accounts, admins, onLogin }) {
  const [mode, setMode] = useState("staff"); // staff | admin
  const [group, setGroup] = useState(null);
  const [unitId, setUnitId] = useState(null);
  const [accountId, setAccountId] = useState(null);
  const [adminId, setAdminId] = useState(admins[0] ? admins[0].id : null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const units = group ? ORG[group].units : [];
  const unitAccounts = unitId ? accounts.filter((a) => a.unitId === unitId) : [];
  const account = accounts.find((a) => a.id === accountId);
  const admin = admins.find((a) => a.id === adminId);

  const pickGroup = (g) => { setGroup(g); setUnitId(null); setAccountId(null); setError(""); if (g === "hq") setUnitId(ORG.hq.units[0].id); };

  const cardBtn = (active, color, soft) => ({
    padding: "10px 14px", borderRadius: 10, cursor: "pointer", fontSize: 13.5, fontWeight: 700,
    border: `1.5px solid ${active ? color : T.border}`, background: active ? soft : "#fff",
    color: active ? color : T.sub, textAlign: "left", display: "flex", alignItems: "center", gap: 8,
  });

  const submitStaff = async () => {
    if (!account) { setError("담당자를 선택하세요"); return; }
    try {
      const verified = await verifyStaffLogin(account.id, password);
      if (!verified) { setError("비밀번호가 일치하지 않습니다"); return; }
      onLogin({ type: "staff", group: verified.group, unitId: verified.unitId, unitName: unitInfo(verified.unitId).name, role: verified.role, name: verified.name, accountId: verified.id });
    } catch (e) { setError("로그인에 실패했습니다"); }
  };
  const submitAdmin = async () => {
    if (!admin) { setError("관리자 계정이 없습니다"); return; }
    try {
      const verified = await verifyAdminLogin(admin.id, password);
      if (!verified) { setError("비밀번호가 일치하지 않습니다"); return; }
      onLogin({ type: "admin", name: verified.name, adminId: verified.id });
    } catch (e) { setError("로그인에 실패했습니다"); }
  };

  return (
    <div style={{ minHeight: 560, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(180deg, ${T.ink} 0%, #1C2333 220px, ${T.canvas} 220px)`, padding: "40px 16px" }}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#fff", marginBottom: 24, justifyContent: "center" }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#5CF0B2", animation: "cct-pulse 2s infinite" }} />
          <span style={{ fontWeight: 800, fontSize: 16 }}>강북강원본부 협업 관제 시스템</span>
        </div>

        <div style={{ background: "#fff", borderRadius: 16, padding: 22, boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 18, background: T.canvas, borderRadius: 10, padding: 4 }}>
            {[{ k: "staff", label: "담당자 로그인" }, { k: "admin", label: "관리자 로그인" }].map((m) => (
              <button key={m.k} className="cct-chip" onClick={() => { setMode(m.k); setError(""); }} style={{
                flex: 1, padding: "9px 0", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
                background: mode === m.k ? "#fff" : "transparent", color: mode === m.k ? T.ink : T.faint,
                boxShadow: mode === m.k ? "0 1px 4px rgba(0,0,0,.10)" : "none",
              }}>{m.label}</button>
            ))}
          </div>

          {mode === "staff" ? (
            <>
              <label style={labelStyle}>소속</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                <button className="cct-chip" onClick={() => pickGroup("hq")} style={cardBtn(group === "hq", T.hq, T.hqSoft)}><Building2 size={15} /> 본부</button>
                <button className="cct-chip" onClick={() => pickGroup("branch")} style={cardBtn(group === "branch", T.branch, T.branchSoft)}><Store size={15} /> 지사</button>
              </div>

              {group && (
                <>
                  <label style={labelStyle}>단위</label>
                  <select className="cct-input" style={{ ...inputStyle, marginBottom: 14 }} value={unitId || ""} onChange={(e) => { setUnitId(e.target.value); setAccountId(null); setError(""); }}>
                    <option value="" disabled>선택하세요</option>
                    {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </>
              )}

              {unitId && (
                <>
                  <label style={labelStyle}>담당자</label>
                  <select className="cct-input" style={{ ...inputStyle, marginBottom: 14 }} value={accountId || ""} onChange={(e) => { setAccountId(e.target.value); setError(""); }}>
                    <option value="" disabled>선택하세요</option>
                    {unitAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.role})</option>)}
                  </select>
                  {unitAccounts.length === 0 && <div style={{ fontSize: 12, color: T.delayed, marginBottom: 14 }}>등록된 담당자가 없습니다. 관리자에게 문의하세요.</div>}
                </>
              )}

              {account && (
                <>
                  <label style={labelStyle}>비밀번호</label>
                  <input className="cct-input" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    style={{ ...inputStyle, marginBottom: 6 }} placeholder="비밀번호 입력" autoFocus
                    onKeyDown={(e) => e.key === "Enter" && submitStaff()} />
                </>
              )}
            </>
          ) : (
            <>
              <label style={labelStyle}>관리자 계정</label>
              <select className="cct-input" style={{ ...inputStyle, marginBottom: 14 }} value={adminId || ""} onChange={(e) => { setAdminId(e.target.value); setError(""); }}>
                {admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <label style={labelStyle}>비밀번호</label>
              <input className="cct-input" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
                style={{ ...inputStyle, marginBottom: 6 }} placeholder="비밀번호 입력"
                onKeyDown={(e) => e.key === "Enter" && submitAdmin()} />
            </>
          )}

          {error && <div style={{ fontSize: 12, color: T.delayed, marginBottom: 6, fontWeight: 600 }}>{error}</div>}

          <button className="cct-btn" onClick={mode === "staff" ? submitStaff : submitAdmin} style={{
            width: "100%", marginTop: 16, padding: "12px 0", borderRadius: 10, border: "none",
            background: T.ink, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}><ShieldCheck size={16} /> 로그인</button>
        </div>
        <div style={{ textAlign: "center", color: T.faint, fontSize: 11.5, marginTop: 14 }}>
          계정은 관리자가 등록합니다. 데모 비밀번호 — 담당자: 1234 / 관리자: admin123
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   업무 등록 모달
--------------------------------------------------------- */
function TaskModal({ currentUser, accounts, categories, onAddCategory, onAddCategoryItem, onClose, onCreate }) {
  const isAdminCreator = currentUser.type === "admin";
  const [ownerGroup, setOwnerGroup] = useState(isAdminCreator ? "branch" : currentUser.group);
  const [ownerUnitId, setOwnerUnitId] = useState(isAdminCreator ? ORG.branch.units[0].id : currentUser.unitId);
  const ownerUnitAccounts = isAdminCreator ? (accounts || []).filter((a) => a.unitId === ownerUnitId) : [];
  const [ownerAccountId, setOwnerAccountId] = useState(ownerUnitAccounts[0] ? ownerUnitAccounts[0].id : null);
  const ownerAccount = ownerUnitAccounts.find((a) => a.id === ownerAccountId);

  const changeOwnerGroup = (g) => {
    setOwnerGroup(g);
    const u = ORG[g].units[0];
    setOwnerUnitId(u.id);
    const accs = (accounts || []).filter((a) => a.unitId === u.id);
    setOwnerAccountId(accs[0] ? accs[0].id : null);
  };
  const changeOwnerUnit = (uid) => {
    setOwnerUnitId(uid);
    const accs = (accounts || []).filter((a) => a.unitId === uid);
    setOwnerAccountId(accs[0] ? accs[0].id : null);
  };

  const [categoryId, setCategoryId] = useState(categories[0] ? categories[0].id : null);
  const cat = categories.find((c) => c.id === categoryId) || null;
  const [itemId, setItemId] = useState(cat && cat.items[0] ? cat.items[0].id : null);
  const { item } = findItem(categories, categoryId, itemId);
  const [priority, setPriority] = useState("mid");
  const [due, setDue] = useState(new Date().toISOString().slice(0, 10));
  const [desc, setDesc] = useState("");
  const changeCategory = (cid) => {
    setCategoryId(cid);
    const c = categories.find((x) => x.id === cid);
    setItemId(c && c.items[0] ? c.items[0].id : null);
  };
  const valid = desc.trim().length > 0 && !!cat && !!item && (!isAdminCreator || !!ownerAccount);

  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState(CATEGORY_COLOR_PRESETS[0]);
  const submitAddCategory = async () => {
    if (!newCatName.trim()) return;
    const created = await onAddCategory({ name: newCatName.trim(), color: newCatColor });
    setCategoryId(created.id);
    setItemId(null);
    setNewCatName("");
    setShowAddCategory(false);
  };

  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemCycle, setNewItemCycle] = useState(new Set());
  const toggleNewItemCycle = (c) => setNewItemCycle((prev) => { const next = new Set(prev); next.has(c) ? next.delete(c) : next.add(c); return next; });
  const submitAddItem = async () => {
    if (!newItemName.trim() || newItemCycle.size === 0 || !categoryId) return;
    const created = await onAddCategoryItem({ categoryId, name: newItemName.trim(), cycle: [...newItemCycle] });
    setItemId(created.id);
    setNewItemName("");
    setNewItemCycle(new Set());
    setShowAddItem(false);
  };

  const submit = () => {
    if (!valid) return;
    if (isAdminCreator) {
      onCreate({ categoryId, itemId, priority, due, desc, unitId: ownerUnitId, role: ownerAccount.role, owner: ownerAccount.name });
    } else {
      onCreate({ categoryId, itemId, priority, due, desc });
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,23,31,.45)", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 540, maxHeight: "88vh", overflowY: "auto", background: "#fff", borderRadius: 16, padding: 22, boxShadow: "0 24px 60px rgba(0,0,0,.22)", animation: "cct-in .18s ease-out" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: T.ink }}>업무 등록</h3>
          <button className="cct-btn" onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: T.faint }}><X size={18} /></button>
        </div>

        {isAdminCreator ? (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>담당자 (이 업무가 등록될 소속)</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              {["hq", "branch"].map((g) => (
                <button key={g} className="cct-chip" onClick={() => changeOwnerGroup(g)} style={{ padding: "8px 0", borderRadius: 9, cursor: "pointer", fontSize: 12.5, fontWeight: 700, border: `1.5px solid ${ownerGroup === g ? ORG[g].color : T.border}`, color: ownerGroup === g ? ORG[g].color : T.sub, background: ownerGroup === g ? ORG[g].soft : "#fff" }}>{ORG[g].label}</button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <select className="cct-input" style={inputStyle} value={ownerUnitId} onChange={(e) => changeOwnerUnit(e.target.value)}>
                {ORG[ownerGroup].units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <select className="cct-input" style={inputStyle} value={ownerAccountId || ""} onChange={(e) => setOwnerAccountId(e.target.value)}>
                {ownerUnitAccounts.length === 0 && <option value="">등록된 계정 없음</option>}
                {ownerUnitAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.role})</option>)}
              </select>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 16 }}>
            <OrgBadge unitId={currentUser.unitId} role={currentUser.role} compact />
            <span style={{ marginLeft: 8, fontSize: 12.5, color: T.faint }}>{currentUser.name} 님으로 등록됩니다</span>
          </div>
        )}

        <label style={labelStyle}>구분</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 8 }}>
          {categories.map((c) => (
            <button key={c.id} className="cct-chip" onClick={() => changeCategory(c.id)} style={{
              padding: "8px 6px", borderRadius: 9, cursor: "pointer", fontSize: 12.5, fontWeight: 700,
              border: `1.5px solid ${categoryId === c.id ? c.color : T.border}`,
              color: categoryId === c.id ? c.color : T.sub, background: categoryId === c.id ? `${c.color}14` : "#fff",
            }}>{c.name}</button>
          ))}
        </div>
        {isAdminCreator && (
          showAddCategory ? (
            <div style={{ display: "flex", gap: 6, marginBottom: 14, alignItems: "center" }}>
              <input className="cct-input" style={{ ...inputStyle, flex: 1 }} placeholder="새 구분 이름 (예: 회선관리)" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} />
              <div style={{ display: "flex", gap: 3 }}>
                {CATEGORY_COLOR_PRESETS.map((c) => (
                  <button key={c} onClick={() => setNewCatColor(c)} style={{ width: 20, height: 20, borderRadius: "50%", background: c, border: newCatColor === c ? `2px solid ${T.ink}` : "2px solid transparent", cursor: "pointer", padding: 0 }} />
                ))}
              </div>
              <button className="cct-btn" onClick={submitAddCategory} style={{ border: "none", background: T.admin, color: "#fff", borderRadius: 7, padding: "8px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>추가</button>
              <button className="cct-btn" onClick={() => setShowAddCategory(false)} style={{ border: "none", background: "transparent", color: T.faint, cursor: "pointer" }}><X size={14} /></button>
            </div>
          ) : (
            <button className="cct-btn" onClick={() => setShowAddCategory(true)} style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "transparent", color: T.admin, cursor: "pointer", fontSize: 12, fontWeight: 700, marginBottom: 14, padding: 0 }}><Plus size={13} />새 구분 추가</button>
          )
        )}

        <label style={labelStyle}>세부업무</label>
        {cat && (
          <select className="cct-input" style={{ ...inputStyle, marginBottom: 10 }} value={itemId || ""} onChange={(e) => setItemId(e.target.value)}>
            {cat.items.length === 0 && <option value="">등록된 세부업무 없음</option>}
            {cat.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        )}
        {item && (
          <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11.5, color: T.faint }}>등록 주기</span><CycleTags cycle={item.cycle} />
          </div>
        )}
        {isAdminCreator && cat && (
          showAddItem ? (
            <div style={{ marginBottom: 16, background: T.canvas, borderRadius: 9, padding: 10 }}>
              <input className="cct-input" style={{ ...inputStyle, marginBottom: 8 }} placeholder="새 세부업무 이름" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} />
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                {CYCLE_LIST.map((c) => (
                  <button key={c} onClick={() => toggleNewItemCycle(c)} style={{ padding: "4px 9px", borderRadius: 999, cursor: "pointer", fontSize: 11, fontWeight: 700, border: `1.5px solid ${newItemCycle.has(c) ? CYCLE_STYLE[c].color : T.border}`, color: newItemCycle.has(c) ? CYCLE_STYLE[c].color : T.sub, background: newItemCycle.has(c) ? `${CYCLE_STYLE[c].color}14` : "#fff" }}>{c}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="cct-btn" onClick={() => setShowAddItem(false)} style={{ border: `1px solid ${T.border}`, background: "#fff", borderRadius: 7, padding: "6px 12px", cursor: "pointer", fontSize: 12, color: T.sub }}>취소</button>
                <button className="cct-btn" onClick={submitAddItem} style={{ border: "none", background: T.admin, color: "#fff", borderRadius: 7, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>추가</button>
              </div>
            </div>
          ) : (
            <button className="cct-btn" onClick={() => setShowAddItem(true)} style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "transparent", color: T.admin, cursor: "pointer", fontSize: 12, fontWeight: 700, marginBottom: 16, padding: 0 }}><Plus size={13} />새 세부업무 추가</button>
          )
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>우선순위</label>
            <select className="cct-input" style={inputStyle} value={priority} onChange={(e) => setPriority(e.target.value)}>
              {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>처리 기한</label>
            <input className="cct-input" type="date" style={inputStyle} value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
        </div>

        <label style={labelStyle}>처리 내용 / 비고</label>
        <textarea className="cct-input" style={{ ...inputStyle, marginBottom: 18, minHeight: 70, resize: "vertical" }}
          placeholder="구체적인 진행 내용을 입력하세요" value={desc} onChange={(e) => setDesc(e.target.value)} />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="cct-btn" onClick={onClose} style={{ padding: "10px 16px", borderRadius: 10, border: `1px solid ${T.border}`, background: "#fff", fontSize: 13.5, fontWeight: 600, color: T.sub, cursor: "pointer" }}>취소</button>
          <button className="cct-btn" disabled={!valid} onClick={submit} style={{
            padding: "10px 18px", borderRadius: 10, border: "none", background: valid ? T.hq : T.border, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: valid ? "pointer" : "not-allowed",
          }}>등록하기</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   업무 상세 패널
--------------------------------------------------------- */
function DetailPanel({ task, currentUser, categories, canRequest, onClose, onUpdateStatus, onAddLog, onRequestUpdate, onUploadAttachment, onUpdateTask, onDeleteTask }) {
  const [comment, setComment] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const isAdmin = currentUser.type === "admin";
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [editPriority, setEditPriority] = useState(task ? task.priority : "mid");
  const [editDue, setEditDue] = useState(task ? task.due : "");
  const [editDesc, setEditDesc] = useState(task ? task.desc : "");

  useEffect(() => {
    if (!task) return;
    setEditPriority(task.priority);
    setEditDue(task.due);
    setEditDesc(task.desc);
    setEditing(false);
  }, [task && task.id]);

  useEffect(() => {
    if (!task) return;
    let active = true;
    fetchAttachments(task.id).then((rows) => { if (active) setAttachments(rows); }).catch(() => {});
    return () => { active = false; };
  }, [task && task.id]);

  if (!task) return null;

  const pickFile = () => fileInputRef.current && fileInputRef.current.click();
  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const att = await onUploadAttachment(task.id, file);
      setAttachments((prev) => [att, ...prev]);
    } finally {
      setUploading(false);
    }
  };
  const download = async (att) => {
    const url = await getAttachmentSignedUrl(att.filePath);
    window.open(url, "_blank");
  };
  const dleft = daysUntil(task.due);
  const isReviewer = currentUser.type === "admin" || currentUser.group === "hq";
  const viewerGroupTag = currentUser.type === "admin" ? "admin" : currentUser.group;

  const submit = () => { if (!comment.trim()) return; onAddLog(task.id, comment.trim()); setComment(""); };
  const logColor = (g) => g === "admin" ? T.admin : g === "hq" ? T.hq : T.branch;
  const logLabel = (l) => {
    if (l.kind === "request") return `진행상황 요청 · ${l.by.name}`;
    if (l.by.group === "admin") return `관리자 · ${l.by.name}`;
    if (l.by.group === "hq") return `본부 피드백 · ${l.by.name}`;
    return `현장 공유 · ${l.by.name}`;
  };

  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 380, maxWidth: "92vw", background: "#fff", borderLeft: `1px solid ${T.border}`, zIndex: 140, boxShadow: "-12px 0 32px rgba(0,0,0,.10)", display: "flex", flexDirection: "column", animation: "cct-in .18s ease-out" }}>
      <div style={{ padding: "16px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <OrgBadge unitId={task.unitId} role={task.role} compact />
          <h3 style={{ margin: "8px 0 0", fontSize: 15.5, fontWeight: 800, color: T.ink, lineHeight: 1.4 }}>{task.title}</h3>
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {isAdmin && !editing && (
            <button className="cct-btn" onClick={() => setEditing(true)} title="수정" style={{ border: "none", background: "transparent", cursor: "pointer", color: T.faint }}><Pencil size={16} /></button>
          )}
          {isAdmin && (
            confirmDel ? (
              <>
                <button className="cct-btn" onClick={() => onDeleteTask(task.id)} style={{ border: "none", background: T.delayed, color: "#fff", borderRadius: 7, padding: "4px 8px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>삭제</button>
                <button className="cct-btn" onClick={() => setConfirmDel(false)} style={{ border: `1px solid ${T.border}`, background: "#fff", borderRadius: 7, padding: "4px 8px", cursor: "pointer", fontSize: 11, color: T.sub }}>취소</button>
              </>
            ) : (
              <button className="cct-btn" onClick={() => setConfirmDel(true)} title="삭제" style={{ border: "none", background: "transparent", cursor: "pointer", color: T.faint }}><Trash2 size={16} /></button>
            )
          )}
          <button className="cct-btn" onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: T.faint }}><X size={18} /></button>
        </div>
      </div>

      <div style={{ padding: 18, overflowY: "auto", flex: 1 }}>
        {task.requested && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: `${T.request}16`, color: T.request, borderRadius: 9, padding: "8px 10px", fontSize: 12.5, fontWeight: 700, marginBottom: 14 }}>
            <Megaphone size={14} /> 진행상황 업데이트가 요청되었습니다
          </div>
        )}
        <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
          <CategoryTag categoryId={task.categoryId} categories={categories} /><CycleTags cycle={task.cycle} />
          {!editing && <span style={{ fontSize: 12.5, color: PRIORITY[task.priority].color, fontWeight: 700 }}>우선순위 {PRIORITY[task.priority].label}</span>}
        </div>

        {editing ? (
          <div style={{ marginBottom: 18, background: T.canvas, borderRadius: 10, padding: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>우선순위</label>
                <select className="cct-input" style={inputStyle} value={editPriority} onChange={(e) => setEditPriority(e.target.value)}>
                  {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>처리 기한</label>
                <input className="cct-input" type="date" style={inputStyle} value={editDue} onChange={(e) => setEditDue(e.target.value)} />
              </div>
            </div>
            <label style={labelStyle}>처리 내용 / 비고</label>
            <textarea className="cct-input" style={{ ...inputStyle, marginBottom: 10, minHeight: 60, resize: "vertical" }} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="cct-btn" onClick={() => setEditing(false)} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: "#fff", fontSize: 12.5, fontWeight: 600, color: T.sub, cursor: "pointer" }}>취소</button>
              <button className="cct-btn" onClick={() => { onUpdateTask(task.id, { priority: editPriority, due: editDue, desc: editDesc }); setEditing(false); }} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: T.admin, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>저장</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontSize: 13, color: dleft < 0 && task.status !== "done" ? T.delayed : T.sub, fontWeight: dleft < 0 ? 700 : 500 }}>
              <Calendar size={14} /> 처리기한 {task.due} {dleft < 0 ? `(D+${-dleft} 지연)` : dleft === 0 ? "(오늘 마감)" : `(D-${dleft})`}
            </div>
            <p style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.6, marginBottom: 18 }}>{task.desc}</p>
          </>
        )}

        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 12.5, fontWeight: 700, color: T.sub, marginBottom: 8, display: "block" }}>상태 변경</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(STATUS).map(([k, v]) => (
              <button key={k} className="cct-chip" onClick={() => onUpdateStatus(task.id, k)} style={{
                padding: "6px 11px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 700,
                border: `1.5px solid ${task.status === k ? v.color : T.border}`, color: task.status === k ? v.color : T.sub,
                background: task.status === k ? `${v.color}14` : "#fff",
              }}>{v.label}</button>
            ))}
          </div>
        </div>

        {canRequest && (
          <button className="cct-btn" onClick={() => onRequestUpdate(task.id)} style={{
            display: "flex", alignItems: "center", gap: 7, width: "100%", justifyContent: "center", marginBottom: 18,
            padding: "9px 0", borderRadius: 9, border: `1.5px solid ${T.request}`, background: `${T.request}10`, color: T.request, fontSize: 12.8, fontWeight: 700, cursor: "pointer",
          }}><Megaphone size={14} /> 진행상황 요청 보내기</button>
        )}

        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 12.5, fontWeight: 700, color: T.sub, marginBottom: 8, display: "block" }}>
            <Paperclip size={12} style={{ verticalAlign: -1, marginRight: 4 }} />첨부파일
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
            {attachments.length === 0 ? (
              <div style={{ fontSize: 12, color: T.faint }}>첨부된 파일이 없습니다.</div>
            ) : attachments.map((att) => (
              <div key={att.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 12.5, background: T.canvas, borderRadius: 8, padding: "7px 10px" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.fileName}</span>
                <button className="cct-btn" onClick={() => download(att)} style={{ border: "none", background: "transparent", cursor: "pointer", color: T.hq, display: "flex", flexShrink: 0 }}><Download size={14} /></button>
              </div>
            ))}
          </div>
          <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={handleFile} />
          <button className="cct-btn" onClick={pickFile} disabled={uploading} style={{
            display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: T.sub,
            border: `1px dashed ${T.border}`, background: "#fff", borderRadius: 9, padding: "7px 12px", cursor: uploading ? "not-allowed" : "pointer",
          }}><Paperclip size={13} />{uploading ? "업로드 중..." : "파일 첨부하기"}</button>
        </div>

        <label style={{ fontSize: 12.5, fontWeight: 700, color: T.sub, marginBottom: 8, display: "block" }}>
          <MessageSquare size={12} style={{ verticalAlign: -1, marginRight: 4 }} />공유 / 피드백 로그
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {[...task.logs].reverse().map((l, i) => {
            const color = logColor(l.by ? l.by.group : "branch");
            return (
              <div key={i} style={{ fontSize: 12.5, color: T.sub, background: T.canvas, borderRadius: 9, padding: "8px 10px", borderLeft: `3px solid ${color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontWeight: 700, color, fontSize: 11.5 }}>{l.by ? logLabel(l) : ""}</span>
                  <span className="cct-mono" style={{ color: T.faint, fontSize: 11 }}>{l.at}</span>
                </div>
                {l.text}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ padding: 14, borderTop: `1px solid ${T.border}` }}>
        {isReviewer && <div style={{ fontSize: 11.5, color: T.hq, fontWeight: 700, marginBottom: 6 }}>{currentUser.type === "admin" ? "관리자 의견으로 등록됩니다" : "본부 피드백으로 등록됩니다"}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <input className="cct-input" value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder={isReviewer ? "지사에 전달할 피드백을 입력하세요" : "진행 내용을 공유하세요"}
            style={{ flex: 1, padding: "9px 12px", borderRadius: 9, border: `1px solid ${T.border}`, fontSize: 13 }}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
          <button className="cct-btn" onClick={submit} style={{ border: "none", background: logColor(viewerGroupTag), color: "#fff", borderRadius: 9, padding: "0 12px", cursor: "pointer", display: "flex", alignItems: "center" }}>
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   대시보드 (담당자/본부/관리자 공용)
--------------------------------------------------------- */
function Dashboard({ viewer, tasks, notifications, accounts, categories, onAddCategory, onAddCategoryItem, onCreate, onUpdateStatus, onAddLog, onRequestUpdate, onUploadAttachment, onUpdateTask, onDeleteTask, canRegister, canRequest }) {
  const [regionAssignments, setRegionAssignments] = useState(() => loadAssignments() || {}); // NEW: region assignments state
  const [query, setQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState(new Set());
  const [cycleFilter, setCycleFilter] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  const toggleCategory = (id) => setCategoryFilter((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const scoped = useMemo(() => {
    if (viewer.scope === "own") return tasks.filter((t) => t.unitId === viewer.unitId);
    if (scopeFilter === "all") return tasks;
    return tasks.filter((t) => unitInfo(t.unitId).group === scopeFilter);
  }, [tasks, viewer, scopeFilter]);

  const filtered = useMemo(() => scoped.filter((t) => {
    if (categoryFilter.size > 0 && !categoryFilter.has(t.categoryId)) return false;
    if (cycleFilter && !t.cycle.includes(cycleFilter)) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (query) {
      const info = unitInfo(t.unitId);
      if (!(t.title.includes(query) || t.owner.includes(query) || info.name.includes(query) || t.desc.includes(query))) return false;
    }
    return true;
  }).sort((a, b) => new Date(a.due) - new Date(b.due)), [scoped, categoryFilter, cycleFilter, statusFilter, query]);

  const kpis = useMemo(() => {
    const total = scoped.length;
    const inProgress = scoped.filter((t) => t.status === "progress").length;
    const delayed = scoped.filter((t) => t.status === "delayed").length;
    const done = scoped.filter((t) => t.status === "done").length;
    return { total, inProgress, delayed, done, rate: total ? Math.round((done / total) * 100) : 0 };
  }, [scoped]);

  const pieData = useMemo(() => Object.entries(STATUS).map(([k, v]) => ({ name: v.label, value: scoped.filter((t) => t.status === k).length, color: v.color })).filter((d) => d.value > 0), [scoped]);
  const barData = useMemo(() => categories.map((c) => ({ name: c.name, value: scoped.filter((t) => t.categoryId === c.id).length, color: c.color })), [scoped, categories]);

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex" }}>
        <div style={{ width: 220, flexShrink: 0, background: "#fff", borderRight: `1px solid ${T.border}`, padding: 16, minHeight: 580 }}>
          {viewer.scope !== "own" ? (
            <>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: T.faint, marginBottom: 10, letterSpacing: .3 }}>모니터링 범위</div>
              {[{ k: "all", label: "전체 (본부+지사)" }, { k: "hq", label: "본부" }, { k: "branch", label: "지사" }].map((g) => (
                <button key={g.k} className="cct-chip" onClick={() => setScopeFilter(g.k)} style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", cursor: "pointer", border: "none",
                  background: scopeFilter === g.k ? T.canvas : "transparent", borderRadius: 8, padding: "8px 10px", marginBottom: 4,
                  fontSize: 13, fontWeight: scopeFilter === g.k ? 700 : 500, color: scopeFilter === g.k ? T.ink : T.sub,
                }}>
                  {g.k === "hq" && <Building2 size={14} color={T.hq} />}
                  {g.k === "branch" && <Store size={14} color={T.branch} />}
                  {g.k === "all" && <Filter size={14} color={T.faint} />}
                  {g.label}
                </button>
              ))}
            </>
          ) : (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: T.faint, marginBottom: 10, letterSpacing: .3 }}>내 소속</div>
              <OrgBadge unitId={viewer.unitId} role={viewer.role} />
            </div>
          )}

          <div style={{ fontSize: 11.5, fontWeight: 700, color: T.faint, margin: "18px 0 10px", letterSpacing: .3 }}>구분</div>
          {categories.map((c) => (
            <button key={c.id} className="cct-chip" onClick={() => toggleCategory(c.id)} style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", cursor: "pointer", border: "none",
              background: categoryFilter.has(c.id) ? `${c.color}14` : "transparent", borderRadius: 8, padding: "7px 10px", marginBottom: 3,
              fontSize: 12.8, fontWeight: categoryFilter.has(c.id) ? 700 : 500, color: categoryFilter.has(c.id) ? c.color : T.sub,
            }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: c.color, flexShrink: 0 }} />{c.name}</button>
          ))}
          {categoryFilter.size > 0 && <button className="cct-btn" onClick={() => setCategoryFilter(new Set())} style={{ marginTop: 6, fontSize: 11.5, color: T.faint, background: "none", border: "none", cursor: "pointer", padding: "4px 10px" }}>구분 필터 초기화</button>}

          <div style={{ fontSize: 11.5, fontWeight: 700, color: T.faint, margin: "18px 0 10px", letterSpacing: .3 }}>주기</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {CYCLE_LIST.map((c) => (
              <button key={c} className="cct-chip" onClick={() => setCycleFilter(cycleFilter === c ? null : c)} style={{
                padding: "5px 10px", borderRadius: 999, cursor: "pointer", fontSize: 11.5, fontWeight: 700,
                border: `1.5px solid ${cycleFilter === c ? CYCLE_STYLE[c].color : T.border}`,
                color: cycleFilter === c ? CYCLE_STYLE[c].color : T.sub, background: cycleFilter === c ? `${CYCLE_STYLE[c].color}14` : "#fff",
              }}>{c}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, padding: 18, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            {canRegister && (
              <button className="cct-btn" onClick={() => setShowModal(true)} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: T.ink, color: "#fff", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                <Plus size={15} />업무 등록
              </button>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
            {[
              { label: viewer.scope === "own" ? "내 지사 업무" : "전체 업무", value: kpis.total, color: T.ink, sub: null },
              { label: "진행중", value: kpis.inProgress, color: T.progress, sub: null },
              { label: "지연", value: kpis.delayed, color: T.delayed, sub: kpis.delayed > 0 ? "확인 필요" : null },
              { label: "완료율", value: `${kpis.rate}%`, color: T.done, sub: `${kpis.done}건 완료` },
            ].map((k, i) => (
              <div key={i} style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 13, padding: "14px 16px" }}>
                <div style={{ fontSize: 12, color: T.sub, fontWeight: 600, marginBottom: 6 }}>{k.label}</div>
                <div className="cct-mono" style={{ fontSize: 26, fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.value}</div>
                {k.sub && <div style={{ fontSize: 11, color: k.color === T.delayed ? T.delayed : T.faint, marginTop: 4, fontWeight: 600 }}>{k.sub}</div>}
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 12, marginBottom: 16 }}>
            <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 13, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>상태별 분포</div>
              <div style={{ height: 160, display: "flex", alignItems: "center" }}>
                <ResponsiveContainer width="60%" height="100%">
                  <PieChart><Pie data={pieData} dataKey="value" innerRadius={38} outerRadius={58} paddingAngle={2}>{pieData.map((d, i) => <Cell key={i} fill={d.color} stroke="none" />)}</Pie><Tooltip /></PieChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {pieData.map((d, i) => (<div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.sub }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: d.color }} />{d.name} {d.value}</div>))}
                </div>
              </div>
            </div>
            <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 13, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>구분별 업무 건수</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={barData} margin={{ left: -20, top: 4 }}>
                  <CartesianGrid vertical={false} stroke={T.border} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: T.sub }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: T.sub }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip /><Bar dataKey="value" radius={[5, 5, 0, 0]}>{barData.map((d, i) => <Cell key={i} fill={d.color} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            <button className="cct-chip" onClick={() => setStatusFilter("all")} style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${statusFilter === "all" ? T.ink : T.border}`, background: statusFilter === "all" ? T.ink : "#fff", color: statusFilter === "all" ? "#fff" : T.sub }}>전체 {filtered.length}건</button>
            {Object.entries(STATUS).map(([k, v]) => (
              <button key={k} className="cct-chip" onClick={() => setStatusFilter(k)} style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${statusFilter === k ? v.color : T.border}`, background: statusFilter === k ? `${v.color}14` : "#fff", color: statusFilter === k ? v.color : T.sub }}>{v.label}</button>
            ))}
          </div>

          <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 13, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 1.1fr .8fr .9fr 1fr .5fr", gap: 8, padding: "10px 16px", fontSize: 11.5, fontWeight: 700, color: T.faint, background: T.canvas }}>
              <div>업무</div><div>조직</div><div>구분</div><div>주기</div><div>우선순위</div><div>기한</div><div>상태</div><div></div>
            </div>
            {filtered.length === 0 ? (
              <div style={{ padding: "48px 16px", textAlign: "center", color: T.faint, fontSize: 13 }}>조건에 맞는 업무가 없습니다.</div>
            ) : filtered.map((t) => {
              const dleft = daysUntil(t.due);
              return (
                <div key={t.id} onClick={() => setSelectedTask(t)} className="cct-btn" style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 1.1fr .8fr .9fr 1fr .5fr", gap: 8, padding: "12px 16px", fontSize: 13, alignItems: "center", borderTop: `1px solid ${T.border}`, cursor: "pointer" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {t.requested && <Megaphone size={12} color={T.request} />}
                      <span style={{ fontWeight: 600, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: T.faint, marginTop: 2 }}>{t.owner} · {t.role}</div>
                  </div>
                  <div><OrgBadge unitId={t.unitId} compact /></div>
                  <div><CategoryTag categoryId={t.categoryId} categories={categories} /></div>
                  <div><CycleTags cycle={t.cycle} /></div>
                  <div style={{ color: PRIORITY[t.priority].color, fontWeight: 700, fontSize: 12 }}>{PRIORITY[t.priority].label}</div>
                  <div className="cct-mono" style={{ fontSize: 12, color: dleft < 0 && t.status !== "done" ? T.delayed : T.sub }}>{t.due}{dleft < 0 && t.status !== "done" ? ` (D+${-dleft})` : ""}</div>
                  <div><StatusPill status={t.status} /></div>
                  <div style={{ color: T.faint }}><ChevronRight size={15} /></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showModal && (
        <TaskModal currentUser={viewer} accounts={accounts} categories={categories} onAddCategory={onAddCategory} onAddCategoryItem={onAddCategoryItem}
          onClose={() => setShowModal(false)} onCreate={(f) => { onCreate(f); setShowModal(false); }} />
      )}
      {selectedTask && (
        <DetailPanel task={tasks.find((t) => t.id === selectedTask.id) || selectedTask} currentUser={viewer.raw} categories={categories} canRequest={canRequest}
          onClose={() => setSelectedTask(null)} onUpdateStatus={onUpdateStatus} onAddLog={onAddLog} onRequestUpdate={onRequestUpdate}
          onUploadAttachment={onUploadAttachment} onUpdateTask={onUpdateTask}
          onDeleteTask={(id) => { onDeleteTask(id); setSelectedTask(null); }} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   계정 관리 (관리자)
--------------------------------------------------------- */
function AccountModal({ initial, onClose, onSave }) {
  const isEdit = !!initial;
  const [group, setGroup] = useState(initial ? initial.group : "branch");
  const [unitId, setUnitId] = useState(initial ? initial.unitId : ORG.branch.units[0].id);
  const units = ORG[group].units;
  const unit = units.find((u) => u.id === unitId) || units[0];
  const [role, setRole] = useState(initial ? initial.role : unit.roles[0]);
  const [name, setName] = useState(initial ? initial.name : "");
  const [email, setEmail] = useState(initial ? initial.email : "");
  const [phone, setPhone] = useState(initial ? initial.phone : "");
  const [password, setPassword] = useState(isEdit ? "" : genPassword());
  const [showPw, setShowPw] = useState(false);

  const changeGroup = (g) => { setGroup(g); const u = ORG[g].units[0]; setUnitId(u.id); setRole(u.roles[0]); };
  const changeUnit = (uid) => { setUnitId(uid); setRole(units.find((u) => u.id === uid).roles[0]); };
  const passwordOk = isEdit ? (password.trim().length === 0 || password.trim().length >= 4) : password.trim().length >= 4;
  const valid = name.trim().length > 0 && passwordOk;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,23,31,.45)", zIndex: 160, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: "#fff", borderRadius: 16, padding: 22, boxShadow: "0 24px 60px rgba(0,0,0,.22)", animation: "cct-in .18s ease-out" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: T.ink }}>{isEdit ? "계정 수정" : "계정 추가"}</h3>
          <button className="cct-btn" onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: T.faint }}><X size={18} /></button>
        </div>

        <label style={labelStyle}>소속</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          {["hq", "branch"].map((g) => (
            <button key={g} className="cct-chip" onClick={() => changeGroup(g)} style={{ padding: "9px 0", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 700, border: `1.5px solid ${group === g ? ORG[g].color : T.border}`, color: group === g ? ORG[g].color : T.sub, background: group === g ? ORG[g].soft : "#fff" }}>{ORG[g].label}</button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>단위</label>
            <select className="cct-input" style={inputStyle} value={unitId} onChange={(e) => changeUnit(e.target.value)}>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>직책</label>
            <select className="cct-input" style={inputStyle} value={role} onChange={(e) => setRole(e.target.value)}>
              {unit.roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <label style={labelStyle}>이름</label>
        <input className="cct-input" style={{ ...inputStyle, marginBottom: 14 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="예) 김도윤" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>이메일</label>
            <input className="cct-input" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@gbgw.co.kr" />
          </div>
          <div>
            <label style={labelStyle}>휴대폰</label>
            <input className="cct-input" style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" />
          </div>
        </div>

        <label style={labelStyle}>비밀번호{isEdit && <span style={{ color: T.faint, fontWeight: 500 }}> (변경할 때만 입력)</span>}</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <input className="cct-input" type={showPw ? "text" : "password"} style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder={isEdit ? "비워두면 비밀번호가 변경되지 않습니다" : ""} />
          <button className="cct-btn" onClick={() => setShowPw((s) => !s)} style={{ border: `1px solid ${T.border}`, background: "#fff", borderRadius: 9, padding: "0 10px", cursor: "pointer", color: T.sub, display: "flex", alignItems: "center" }}>{showPw ? <EyeOff size={15} /> : <Eye size={15} />}</button>
          <button className="cct-btn" onClick={() => setPassword(genPassword())} title="자동생성" style={{ border: `1px solid ${T.border}`, background: "#fff", borderRadius: 9, padding: "0 10px", cursor: "pointer", color: T.sub, display: "flex", alignItems: "center" }}><RefreshCw size={15} /></button>
        </div>
        {isEdit && password.trim().length > 0 && (
          <div style={{ fontSize: 11.5, color: T.request, marginBottom: 12, fontWeight: 600 }}>저장하면 이 비밀번호로 즉시 변경됩니다. 변경 후에는 다시 조회할 수 없으니 담당자에게 전달해주세요.</div>
        )}
        {!(isEdit && password.trim().length > 0) && <div style={{ marginBottom: 18 }} />}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="cct-btn" onClick={onClose} style={{ padding: "10px 16px", borderRadius: 10, border: `1px solid ${T.border}`, background: "#fff", fontSize: 13.5, fontWeight: 600, color: T.sub, cursor: "pointer" }}>취소</button>
          <button className="cct-btn" disabled={!valid} onClick={() => valid && onSave({ ...(initial || {}), group, unitId, role, name: name.trim(), email, phone, password: password.trim() || undefined })} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: valid ? T.admin : T.border, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: valid ? "pointer" : "not-allowed" }}>저장</button>
        </div>
      </div>
    </div>
  );
}

function AccountsManager({ accounts, setAccounts, pushToast }) {
  const [groupFilter, setGroupFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [editing, setEditing] = useState(null); // null | true(new) | account(edit)
  const [confirmDel, setConfirmDel] = useState(null);
  const [resetPasswords, setResetPasswords] = useState({}); // accountId -> 방금 재설정한 비밀번호(1회 표시용)

  const resetPassword = async (id) => {
    const newPw = genPassword();
    try {
      await setAccountPassword(id, newPw);
      setResetPasswords((m) => ({ ...m, [id]: newPw }));
      pushToast("비밀번호가 재설정되었습니다");
    } catch (e) { console.error(e); pushToast("재설정에 실패했습니다"); }
  };

  const units = groupFilter === "all" ? ALL_UNITS : ALL_UNITS.filter((u) => u.group === groupFilter);
  const rows = accounts.filter((a) => (groupFilter === "all" || a.group === groupFilter) && (unitFilter === "all" || a.unitId === unitFilter));

  const save = async (data) => {
    try {
      if (data.id) {
        const updated = await updateAccount(data.id, data);
        setAccounts((acc) => acc.map((a) => a.id === updated.id ? updated : a));
        pushToast("계정이 수정되었습니다");
      } else {
        const created = await createAccount(data);
        setAccounts((acc) => [created, ...acc]);
        pushToast("계정이 등록되었습니다");
      }
    } catch (e) { console.error(e); pushToast("저장에 실패했습니다"); }
    setEditing(null);
  };
  const remove = async (id) => {
    try {
      await deleteAccount(id);
      setAccounts((acc) => acc.filter((a) => a.id !== id));
      pushToast("계정이 삭제되었습니다");
    } catch (e) { console.error(e); pushToast("삭제에 실패했습니다"); }
    setConfirmDel(null);
  };

  const cellStyle = { padding: "10px 12px", fontSize: 13, borderTop: `1px solid ${T.border}` };

  return (
    <div style={{ flex: 1, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <select className="cct-input" style={{ ...inputStyle, width: 140 }} value={groupFilter} onChange={(e) => { setGroupFilter(e.target.value); setUnitFilter("all"); }}>
          <option value="all">전체 소속</option><option value="hq">본부</option><option value="branch">지사</option>
        </select>
        <select className="cct-input" style={{ ...inputStyle, width: 160 }} value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}>
          <option value="all">전체 단위</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="cct-btn" onClick={() => setEditing(true)} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: T.admin, color: "#fff", borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}><UserPlus size={15} />계정 추가</button>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 13, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: ".9fr 1.1fr 1fr 1fr 1.6fr 1.1fr 1.1fr", gap: 8, padding: "10px 14px", fontSize: 11.5, fontWeight: 700, color: T.faint, background: T.canvas }}>
          <div>소속</div><div>단위</div><div>직책</div><div>이름</div><div>연락처</div><div>비밀번호</div><div></div>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: "40px 14px", textAlign: "center", color: T.faint, fontSize: 13 }}>등록된 계정이 없습니다.</div>
        ) : rows.map((a) => (
          <div key={a.id} style={{ display: "grid", gridTemplateColumns: ".9fr 1.1fr 1fr 1fr 1.6fr 1.1fr 1.1fr", gap: 8, alignItems: "center" }}>
            <div style={cellStyle}>{a.group === "hq" ? <Building2 size={13} color={T.hq} style={{ marginRight: 4, verticalAlign: -2 }} /> : <Store size={13} color={T.branch} style={{ marginRight: 4, verticalAlign: -2 }} />}{ORG[a.group].label}</div>
            <div style={cellStyle}>{unitInfo(a.unitId).name}</div>
            <div style={cellStyle}>{a.role}</div>
            <div style={{ ...cellStyle, fontWeight: 600 }}>{a.name}</div>
            <div style={{ ...cellStyle, fontSize: 11.5, color: T.sub }}>{a.email}<br />{a.phone}</div>
            <div style={cellStyle}>
              {resetPasswords[a.id] ? (
                <>
                  <span className="cct-mono" style={{ marginRight: 6, color: T.request, fontWeight: 700 }}>{resetPasswords[a.id]}</span>
                  <button className="cct-btn" onClick={() => setResetPasswords((m) => { const n = { ...m }; delete n[a.id]; return n; })} title="가리기" style={{ border: "none", background: "transparent", cursor: "pointer", color: T.faint, verticalAlign: -3 }}><EyeOff size={13} /></button>
                </>
              ) : (
                <button className="cct-btn" onClick={() => resetPassword(a.id)} style={{ display: "flex", alignItems: "center", gap: 4, border: `1px solid ${T.border}`, background: "#fff", borderRadius: 7, padding: "4px 8px", cursor: "pointer", color: T.sub, fontSize: 11.5 }}><KeyRound size={12} />재설정</button>
              )}
            </div>
            <div style={{ ...cellStyle, display: "flex", gap: 6 }}>
              <button className="cct-btn" onClick={() => setEditing(a)} style={{ border: `1px solid ${T.border}`, background: "#fff", borderRadius: 7, padding: "5px 7px", cursor: "pointer", color: T.sub, display: "flex" }}><Pencil size={13} /></button>
              {confirmDel === a.id ? (
                <>
                  <button className="cct-btn" onClick={() => remove(a.id)} style={{ border: "none", background: T.delayed, color: "#fff", borderRadius: 7, padding: "5px 8px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>삭제</button>
                  <button className="cct-btn" onClick={() => setConfirmDel(null)} style={{ border: `1px solid ${T.border}`, background: "#fff", borderRadius: 7, padding: "5px 8px", cursor: "pointer", fontSize: 11, color: T.sub }}>취소</button>
                </>
              ) : (
                <button className="cct-btn" onClick={() => setConfirmDel(a.id)} style={{ border: `1px solid ${T.border}`, background: "#fff", borderRadius: 7, padding: "5px 7px", cursor: "pointer", color: T.delayed, display: "flex" }}><Trash2 size={13} /></button>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && <AccountModal initial={editing === true ? null : editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

/* ---------------------------------------------------------
   링크 발송 (관리자)
--------------------------------------------------------- */
function LinkSender({ accounts, sentLinks, setSentLinks, pushToast }) {
  const [groupFilter, setGroupFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [method, setMethod] = useState("email");
  const [selected, setSelected] = useState(new Set());

  const units = groupFilter === "all" ? ALL_UNITS : ALL_UNITS.filter((u) => u.group === groupFilter);
  const rows = accounts.filter((a) => (groupFilter === "all" || a.group === groupFilter) && (unitFilter === "all" || a.unitId === unitFilter));
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggle = (id) => setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));

  const sendTo = async (ids) => {
    const targets = accounts.filter((a) => ids.includes(a.id));
    if (targets.length === 0) return;
    try {
      const entries = await Promise.all(targets.map((a) =>
        createSentLink({ accountId: a.id, name: a.name, unit: unitInfo(a.unitId).name, role: a.role, method })
      ));
      setSentLinks((s) => [...entries, ...s]);
      pushToast(`${targets.length}명에게 ${method === "email" ? "이메일" : "문자"}로 발송했습니다`);
      setSelected(new Set());
    } catch (e) { console.error(e); pushToast("발송에 실패했습니다"); }
  };

  return (
    <div style={{ flex: 1, padding: 18, display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <select className="cct-input" style={{ ...inputStyle, width: 140 }} value={groupFilter} onChange={(e) => { setGroupFilter(e.target.value); setUnitFilter("all"); }}>
            <option value="all">전체 소속</option><option value="hq">본부</option><option value="branch">지사</option>
          </select>
          <select className="cct-input" style={{ ...inputStyle, width: 160 }} value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}>
            <option value="all">전체 단위</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", background: T.canvas, borderRadius: 9, padding: 3 }}>
            {[{ k: "email", label: "이메일", Icon: Mail }, { k: "sms", label: "문자", Icon: MessageCircle }].map((m) => (
              <button key={m.k} className="cct-chip" onClick={() => setMethod(m.k)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700, background: method === m.k ? "#fff" : "transparent", color: method === m.k ? T.ink : T.faint, boxShadow: method === m.k ? "0 1px 4px rgba(0,0,0,.10)" : "none" }}><m.Icon size={13} />{m.label}</button>
            ))}
          </div>
        </div>

        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 13, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: ".4fr .9fr 1.1fr 1fr 1fr .6fr", gap: 8, padding: "10px 14px", fontSize: 11.5, fontWeight: 700, color: T.faint, background: T.canvas, alignItems: "center" }}>
            <div><input type="checkbox" checked={allChecked} onChange={toggleAll} /></div>
            <div>소속</div><div>단위</div><div>직책</div><div>이름</div><div></div>
          </div>
          {rows.map((a) => (
            <div key={a.id} style={{ display: "grid", gridTemplateColumns: ".4fr .9fr 1.1fr 1fr 1fr .6fr", gap: 8, padding: "9px 14px", fontSize: 12.8, alignItems: "center", borderTop: `1px solid ${T.border}` }}>
              <div><input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} /></div>
              <div>{ORG[a.group].label}</div>
              <div>{unitInfo(a.unitId).name}</div>
              <div>{a.role}</div>
              <div style={{ fontWeight: 600 }}>{a.name}</div>
              <div><button className="cct-btn" onClick={() => sendTo([a.id])} style={{ border: "none", background: "transparent", cursor: "pointer", color: T.admin, display: "flex" }}><Send size={14} /></button></div>
            </div>
          ))}
        </div>

        <button className="cct-btn" disabled={selected.size === 0} onClick={() => sendTo([...selected])} style={{ display: "flex", alignItems: "center", gap: 7, border: "none", background: selected.size ? T.admin : T.border, color: "#fff", borderRadius: 9, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: selected.size ? "pointer" : "not-allowed" }}>
          <Link2 size={15} />선택한 {selected.size}명에게 발송
        </button>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>발송 내역</div>
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 13, maxHeight: 460, overflowY: "auto" }}>
          {sentLinks.length === 0 ? (
            <div style={{ padding: "30px 14px", textAlign: "center", color: T.faint, fontSize: 12.5 }}>발송 내역이 없습니다.</div>
          ) : sentLinks.map((l) => (
            <div key={l.id} style={{ padding: "10px 14px", borderBottom: `1px solid ${T.canvas}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                {l.method === "email" ? <Mail size={12} color={T.admin} /> : <MessageCircle size={12} color={T.admin} />}
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{l.unit} · {l.name} ({l.role})</span>
              </div>
              <div className="cct-mono" style={{ fontSize: 11, color: T.faint, wordBreak: "break-all" }}>{l.link}</div>
              <div style={{ fontSize: 10.5, color: T.faint, marginTop: 2 }}>{l.at}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   메인 App
--------------------------------------------------------- */
export default function CollabControlTower() {
  const [accounts, setAccounts] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [sentLinks, setSentLinks] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [adminTab, setAdminTab] = useState("monitor");
  const [toasts, setToasts] = useState([]);
  const [tokenChecked, setTokenChecked] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const notifRef = useRef(null);

  useEffect(() => {
    function onClick(e) { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false); }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const pushToast = useCallback((text) => {
    const id = uid("X");
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  // 링크발송으로 받은 매직링크(?token=...)로 들어온 경우 로그인 화면을 건너뛰고 자동 로그인
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { setTokenChecked(true); return; }
    resolveLinkToken(token).then((result) => {
      if (result && result.account) {
        const acc = result.account;
        setCurrentUser({ type: "staff", group: acc.group, unitId: acc.unitId, unitName: unitInfo(acc.unitId).name, role: acc.role, name: acc.name, accountId: acc.id });
      }
    }).catch((e) => console.error(e)).finally(() => setTokenChecked(true));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [acc, adm, tk, nf, sl, cat] = await Promise.all([
          fetchAccounts(), fetchAdmins(), fetchTasks(), fetchNotifications(), fetchSentLinks(), fetchCategories(),
        ]);
        if (cancelled) return;
        setAccounts(acc); setAdmins(adm); setTasks(tk); setNotifications(nf); setSentLinks(sl); setCategories(cat);
      } catch (e) {
        console.error(e);
        pushToast("데이터를 불러오지 못했습니다. Supabase 설정을 확인하세요.");
      } finally {
        if (!cancelled) setDataLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [pushToast]);

  // 다른 사용자의 변경사항을 실시간으로 반영
  // tasks 업무 등록/로그 추가는 같은 동작 안에서 tasks와 task_logs에 연달아 쓰기 때문에
  // INSERT/UPDATE 이벤트가 짧은 시간에 여러 번 들어온다. 매번 즉시 재조회하면 아직 커밋되지
  // 않은 중간 상태를 읽어와서 방금 반영된 최신 상태를 덮어쓸 수 있어, 한 박자 쉬었다가
  // (디바운스) 가장 마지막 호출의 결과만 반영한다.
  const taskFetchSeq = useRef(0);
  const refreshTimer = useRef(null);
  const refreshTasks = useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      const seq = ++taskFetchSeq.current;
      fetchTasks().then((tk) => { if (seq === taskFetchSeq.current) setTasks(tk); }).catch(() => {});
    }, 500);
  }, []);

  useEffect(() => {
    const channel = supabase.channel("cct-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, refreshTasks)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_logs" }, refreshTasks)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => fetchNotifications().then(setNotifications).catch(() => {}))
      .on("postgres_changes", { event: "*", schema: "public", table: "accounts" }, () => fetchAccounts().then(setAccounts).catch(() => {}))
      .on("postgres_changes", { event: "*", schema: "public", table: "sent_links" }, () => fetchSentLinks().then(setSentLinks).catch(() => {}))
      .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, () => fetchCategories().then(setCategories).catch(() => {}))
      .on("postgres_changes", { event: "*", schema: "public", table: "category_items" }, () => fetchCategories().then(setCategories).catch(() => {}))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const actorFrom = useCallback(
    () => currentUser.type === "admin" ? { name: currentUser.name, group: "admin" } : { name: currentUser.name, group: currentUser.group },
    [currentUser]
  );

  const handleCreate = async (form) => {
    const { item } = findItem(categories, form.categoryId, form.itemId);
    try {
      const newTask = await createTask({
        categoryId: form.categoryId, itemId: form.itemId, title: item.name, cycle: item.cycle,
        unitId: form.unitId || currentUser.unitId, role: form.role || currentUser.role, owner: form.owner || currentUser.name,
        priority: form.priority, due: form.due, desc: form.desc,
      }, actorFrom());
      setTasks((ts) => [newTask, ...ts]);
      pushToast("업무가 등록되었습니다");
    } catch (e) { console.error(e); pushToast("업무 등록에 실패했습니다"); }
  };

  const handleUpdateTask = async (id, fields) => {
    try {
      const current = tasks.find((t) => t.id === id);
      const { task, log } = await updateTaskDetails(id, { ...fields, unitId: current.unitId, role: current.role, owner: current.owner }, actorFrom());
      setTasks((ts) => ts.map((t) => t.id === id ? { ...t, priority: task.priority, due: task.due, desc: task.desc, logs: [...t.logs, log] } : t));
      pushToast("업무가 수정되었습니다");
    } catch (e) { console.error(e); pushToast("수정에 실패했습니다"); }
  };

  const handleDeleteTask = async (id) => {
    try {
      await deleteTask(id);
      setTasks((ts) => ts.filter((t) => t.id !== id));
      pushToast("업무가 삭제되었습니다");
    } catch (e) { console.error(e); pushToast("삭제에 실패했습니다"); }
  };

  const handleAddCategory = async ({ name, color }) => {
    try {
      const created = await createCategory({ name, color });
      setCategories((cs) => [...cs, { ...created, items: [] }]);
      pushToast("구분이 추가되었습니다");
      return created;
    } catch (e) { console.error(e); pushToast("구분 추가에 실패했습니다"); throw e; }
  };

  const handleAddCategoryItem = async ({ categoryId, name, cycle }) => {
    try {
      const created = await createCategoryItem({ categoryId, name, cycle });
      setCategories((cs) => cs.map((c) => c.id === categoryId ? { ...c, items: [...c.items, created] } : c));
      pushToast("세부업무가 추가되었습니다");
      return created;
    } catch (e) { console.error(e); pushToast("세부업무 추가에 실패했습니다"); throw e; }
  };

  const handleUpdateStatus = async (id, status) => {
    try {
      const { task, log } = await updateTaskStatus(id, status, actorFrom());
      setTasks((ts) => ts.map((t) => t.id === id ? { ...t, status: task.status, requested: task.requested, logs: [...t.logs, log] } : t));
      if (status === "done") pushToast("업무가 완료 처리되었습니다");
    } catch (e) { console.error(e); pushToast("상태 변경에 실패했습니다"); }
  };

  const handleAddLog = async (id, text) => {
    const actor = actorFrom();
    try {
      const log = await addTaskLog(id, text, actor);
      const clearsRequest = actor.group !== "admin" && actor.group !== "hq";
      setTasks((ts) => ts.map((t) => t.id === id ? { ...t, requested: clearsRequest ? false : t.requested, logs: [...t.logs, log] } : t));
      pushToast(actor.group === "admin" || actor.group === "hq" ? "피드백이 전달되었습니다" : "진행 내용이 공유되었습니다");
    } catch (e) { console.error(e); pushToast("등록에 실패했습니다"); }
  };

  const handleRequestUpdate = async (id) => {
    try {
      const { task, log } = await requestUpdate(id, actorFrom());
      setTasks((ts) => ts.map((t) => t.id === id ? { ...t, requested: task.requested, logs: [...t.logs, log] } : t));
      pushToast("진행상황 요청을 보냈습니다");
    } catch (e) { console.error(e); pushToast("요청 전송에 실패했습니다"); }
  };

  const handleUploadAttachment = async (taskId, file) => {
    try {
      const { attachment, log } = await uploadAttachment(taskId, file, actorFrom());
      setTasks((ts) => ts.map((t) => t.id === taskId ? { ...t, logs: [...t.logs, log] } : t));
      pushToast("파일이 첨부되었습니다");
      return attachment;
    } catch (e) { console.error(e); pushToast("파일 업로드에 실패했습니다"); throw e; }
  };

  const NOTIF_ICON = { delayed: AlertTriangle, due: Clock, assign: Send, done: CheckCircle2, request: Megaphone, status: CheckCircle2, update: MessageSquare, feedback: MessageSquare };
  const NOTIF_COLOR = { delayed: T.delayed, due: T.hold, assign: T.hq, done: T.done, request: T.request, status: T.progress, update: T.branch, feedback: T.hq };

  if (!tokenChecked || !dataLoaded) {
    return (
      <div className="cct-root" style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${T.border}`, minHeight: 320, display: "flex", alignItems: "center", justifyContent: "center", color: T.faint, fontSize: 13.5 }}>
        <style>{FONT}</style>
        불러오는 중...
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="cct-root" style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${T.border}` }}>
        <style>{FONT}</style>
        <LoginScreen accounts={accounts} admins={admins} onLogin={setCurrentUser} />
      </div>
    );
  }

  const visibleNotifications = notifications.filter((n) => isNotificationForViewer(n, currentUser));

  const isAdmin = currentUser.type === "admin";
  const isHqStaff = !isAdmin && currentUser.group === "hq";
  const viewer = isAdmin
    ? { type: "admin", scope: "all", name: currentUser.name, raw: currentUser }
    : { ...currentUser, scope: currentUser.group === "branch" ? "own" : "all", raw: currentUser };

  return (
    <div className="cct-root" style={{ minHeight: 640, background: T.canvas, color: T.ink, position: "relative", borderRadius: 14, overflow: "hidden", border: `1px solid ${T.border}` }}>
      <style>{FONT}</style>

      <div style={{ height: 58, background: T.ink, display: "flex", alignItems: "center", padding: "0 16px", gap: 12, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#fff", fontWeight: 800, fontSize: 15, whiteSpace: "nowrap" }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#5CF0B2", animation: "cct-pulse 2s infinite" }} />
          협업 관제 시스템
        </div>

        {isAdmin && (
          <div style={{ display: "flex", gap: 4, marginLeft: 10 }}>
            {[{ k: "monitor", label: "모니터링", Icon: Gauge }, { k: "accounts", label: "계정관리", Icon: Users }, { k: "links", label: "링크발송", Icon: Link2 }].map((tb) => (
              <button key={tb.k} className="cct-chip" onClick={() => setAdminTab(tb.k)} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 12.5, fontWeight: 700, background: adminTab === tb.k ? "rgba(255,255,255,.14)" : "transparent", color: adminTab === tb.k ? "#fff" : "#9AA1AC",
              }}><tb.Icon size={13} />{tb.label}</button>
            ))}
          </div>
        )}

        <div style={{ flex: 1 }} />

        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderRadius: 9,
          background: isAdmin ? "rgba(124,58,237,.25)" : currentUser.group === "hq" ? "rgba(56,81,214,.25)" : "rgba(224,138,44,.25)",
          color: isAdmin ? "#D7C2FF" : currentUser.group === "hq" ? "#B9C4FF" : "#FFD9A6", fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap",
        }}>
          {isAdmin ? <ShieldCheck size={13} /> : currentUser.group === "hq" ? <Building2 size={13} /> : <Store size={13} />}
          {isAdmin ? `관리자 · ${currentUser.name}` : `${currentUser.unitName} · ${currentUser.role} · ${currentUser.name}`}
        </div>

        <div ref={notifRef} style={{ position: "relative" }}>
          <button className="cct-btn" onClick={() => setNotifOpen((o) => !o)} style={{ border: "none", background: "transparent", color: "#fff", cursor: "pointer", position: "relative", display: "flex", padding: 6 }}>
            <Bell size={19} />
            {visibleNotifications.length > 0 && <span style={{ position: "absolute", top: 2, right: 2, background: T.delayed, color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 999, minWidth: 15, height: 15, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{visibleNotifications.length}</span>}
          </button>
          {notifOpen && (
            <div style={{ position: "absolute", right: 0, top: 40, width: 320, background: "#fff", borderRadius: 12, boxShadow: "0 16px 40px rgba(0,0,0,.18)", border: `1px solid ${T.border}`, zIndex: 110, animation: "cct-in .15s ease-out", overflow: "hidden" }}>
              <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.border}`, fontWeight: 700, fontSize: 13.5 }}>알림</div>
              <div style={{ maxHeight: 320, overflowY: "auto" }}>
                {visibleNotifications.length === 0 && <div style={{ padding: "20px 14px", textAlign: "center", color: T.faint, fontSize: 12.5 }}>알림이 없습니다.</div>}
                {visibleNotifications.map((n) => {
                  const Icon = NOTIF_ICON[n.kind];
                  return (
                    <div key={n.id} style={{ display: "flex", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${T.canvas}` }}>
                      <Icon size={15} color={NOTIF_COLOR[n.kind]} style={{ marginTop: 2, flexShrink: 0 }} />
                      <div><div style={{ fontSize: 12.5, color: T.ink, lineHeight: 1.4 }}>{n.text}</div><div style={{ fontSize: 11, color: T.faint, marginTop: 2 }}>{n.at}</div></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button className="cct-btn" onClick={() => setCurrentUser(null)} title="로그아웃" style={{ border: "none", background: "transparent", color: "#8A8F98", cursor: "pointer", display: "flex" }}><LogOut size={17} /></button>
      </div>

      {isAdmin ? (
        adminTab === "monitor" ? (
          <Dashboard viewer={viewer} tasks={tasks} notifications={visibleNotifications} accounts={accounts} categories={categories} onAddCategory={handleAddCategory} onAddCategoryItem={handleAddCategoryItem} onCreate={handleCreate} onUpdateStatus={handleUpdateStatus} onAddLog={handleAddLog} onRequestUpdate={handleRequestUpdate} onUploadAttachment={handleUploadAttachment} onUpdateTask={handleUpdateTask} onDeleteTask={handleDeleteTask} canRegister={true} canRequest={true} />
        ) : adminTab === "accounts" ? (
          <AccountsManager accounts={accounts} setAccounts={setAccounts} pushToast={pushToast} />
        ) : (
          <LinkSender accounts={accounts} sentLinks={sentLinks} setSentLinks={setSentLinks} pushToast={pushToast} />
        )
      ) : (
        <Dashboard viewer={viewer} tasks={tasks} notifications={visibleNotifications} accounts={accounts} categories={categories} onAddCategory={handleAddCategory} onAddCategoryItem={handleAddCategoryItem} onCreate={handleCreate} onUpdateStatus={handleUpdateStatus} onAddLog={handleAddLog} onRequestUpdate={handleRequestUpdate} onUploadAttachment={handleUploadAttachment} onUpdateTask={handleUpdateTask} onDeleteTask={handleDeleteTask} canRegister={true} canRequest={isHqStaff} />
      )}

      <Toast toasts={toasts} />
    </div>
  );
}
