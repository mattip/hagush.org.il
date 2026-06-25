// backoffice.js — admin management UI (admin-only). Isolated; rules-gated writes.
// Tabs: influencers, groups, roles (permissions), registration flags.
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, orderBy, limit,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c]));
const rid = (p) => p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let DB = null, wired = false, groupsCache = [], DEMO_BO = false;

const MOCK = {
  groups: [
    { id: "default", name: "כללי (ברירת מחדל)", referrerCode: null, active: true },
    { id: "tzfi", name: "צפי שומר", referrerCode: "11", active: true },
  ],
  influencers: [
    { id: "infl_1", name: "נופר בן צור", referrerCode: "1", groupId: "default", active: true },
    { id: "infl_11", name: "צפי שומר", referrerCode: "tzipi", groupId: "grp_tzipi", active: true },
    { id: "infl_17", name: "טל קורנט", referrerCode: "17", groupId: "default", active: true },
  ],
  roles: [
    { id: "fromlior@gmail.com", role: "admin", scope: "full", groupId: null, influencerId: null, active: true },
    { id: "matti.picus@gmail.com", role: "admin", scope: "full", groupId: null, influencerId: null, active: true },
  ],
  registrations: [
    { id: "r1", name: "נ׳ בן צור", phoneLast3: "567", isTest: false, isDuplicate: false },
    { id: "r2", name: "בדיקה", phoneLast3: "000", isTest: true, isDuplicate: false },
  ],
};

export function openBackoffice(db, demo = false) {
  DB = db; DEMO_BO = demo;
  $("content").classList.add("hidden");
  $("backoffice").classList.remove("hidden");
  if (!wired) {
    wired = true;
    $("bo-back").addEventListener("click", closeBackoffice);
    document.querySelectorAll(".bo-tab").forEach((t) =>
      t.addEventListener("click", () => selectTab(t.dataset.tab)));
  }
  selectTab("influencers");
}
function closeBackoffice() {
  $("backoffice").classList.add("hidden");
  $("content").classList.remove("hidden");
}
function selectTab(name) {
  document.querySelectorAll(".bo-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  msg("");
  loadTab(name);
}
function msg(text, kind) { const m = $("bo-msg"); m.textContent = text || ""; m.className = "bo-msg" + (kind ? " " + kind : ""); }
function busy() { $("bo-body").innerHTML = '<div class="empty"><span class="spinner"></span></div>'; }
async function fetchAll(name) {
  if (DEMO_BO) return (MOCK[name] || []).map((x) => ({ ...x }));
  const snap = await getDocs(collection(DB, name));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function loadTab(name) {
  busy();
  try {
    if (name === "influencers") return renderInfluencers();
    if (name === "groups") return renderGroups();
    if (name === "roles") return renderRoles();
    if (name === "flags") return renderFlags();
  } catch (e) {
    console.error(e); msg("שגיאה בטעינה: " + (e?.code || e?.message || e), "err");
    $("bo-body").innerHTML = "";
  }
}

// ── Influencers ─────────────────────────────────────────────────────────────
async function renderInfluencers() {
  const [infl, groups] = await Promise.all([fetchAll("influencers"), fetchAll("groups")]);
  groupsCache = groups;
  const gOpts = (sel) => groups.map((g) => `<option value="${esc(g.id)}" ${g.id === sel ? "selected" : ""}>${esc(g.name || g.id)}</option>`).join("");
  const row = (x) => `<tr data-id="${esc(x.id)}">
    <td><input class="bo-input" data-f="name" value="${esc(x.name || "")}"></td>
    <td><input class="bo-input" data-f="referrerCode" style="max-width:90px" value="${esc(x.referrerCode ?? "")}"></td>
    <td><select class="bo-input" data-f="groupId">${gOpts(x.groupId)}</select></td>
    <td><label class="switch"><input type="checkbox" data-f="active" ${x.active !== false ? "checked" : ""}> פעיל</label></td>
    <td><button class="bo-save" data-act="save-infl">שמירה</button> <button class="bo-del" data-act="del-infl">מחיקה</button></td>
  </tr>`;
  $("bo-body").innerHTML = `<div class="bo-card"><table>
    <thead><tr><th>שם</th><th>קוד מפנה</th><th>קבוצה</th><th>סטטוס</th><th></th></tr></thead>
    <tbody>
      ${infl.sort((a,b)=>(a.name||"").localeCompare(b.name||"","he")).map(row).join("")}
      <tr class="bo-addrow" data-id="">
        <td><input class="bo-input" data-f="name" placeholder="שם חדש"></td>
        <td><input class="bo-input" data-f="referrerCode" style="max-width:90px" placeholder="קוד"></td>
        <td><select class="bo-input" data-f="groupId">${gOpts(null)}</select></td>
        <td><label class="switch"><input type="checkbox" data-f="active" checked> פעיל</label></td>
        <td><button class="bo-save" data-act="add-infl">הוספה</button></td>
      </tr>
    </tbody></table></div>`;
  bind();
}

// ── Groups ──────────────────────────────────────────────────────────────────
async function renderGroups() {
  const groups = await fetchAll("groups");
  const row = (x) => `<tr data-id="${esc(x.id)}">
    <td><input class="bo-input" data-f="name" value="${esc(x.name || "")}"></td>
    <td><input class="bo-input" data-f="referrerCode" style="max-width:90px" value="${esc(x.referrerCode ?? "")}"></td>
    <td><label class="switch"><input type="checkbox" data-f="active" ${x.active !== false ? "checked" : ""}> פעיל</label></td>
    <td><button class="bo-save" data-act="save-grp">שמירה</button> <button class="bo-del" data-act="del-grp">מחיקה</button></td>
  </tr>`;
  $("bo-body").innerHTML = `<div class="bo-card"><table>
    <thead><tr><th>שם קבוצה</th><th>קוד מפנה</th><th>סטטוס</th><th></th></tr></thead>
    <tbody>
      ${groups.sort((a,b)=>(a.name||"").localeCompare(b.name||"","he")).map(row).join("")}
      <tr class="bo-addrow" data-id="">
        <td><input class="bo-input" data-f="name" placeholder="קבוצה חדשה"></td>
        <td><input class="bo-input" data-f="referrerCode" style="max-width:90px" placeholder="קוד"></td>
        <td><label class="switch"><input type="checkbox" data-f="active" checked> פעיל</label></td>
        <td><button class="bo-save" data-act="add-grp">הוספה</button></td>
      </tr>
    </tbody></table></div>`;
  bind();
}

// ── Roles (permissions) ─────────────────────────────────────────────────────
async function renderRoles() {
  const [roles, groups, infl] = await Promise.all([fetchAll("roles"), fetchAll("groups"), fetchAll("influencers")]);
  const roleSel = (v) => ["admin","manager","influencer"].map((r)=>`<option value="${r}" ${r===v?"selected":""}>${r}</option>`).join("");
  const scopeSel = (v) => ["full","group"].map((s)=>`<option value="${s}" ${s===v?"selected":""}>${s}</option>`).join("");
  const gSel = (v) => `<option value="">—</option>` + groups.map((g)=>`<option value="${esc(g.id)}" ${g.id===v?"selected":""}>${esc(g.name||g.id)}</option>`).join("");
  const iSel = (v) => `<option value="">—</option>` + infl.map((i)=>`<option value="${esc(i.id)}" ${i.id===v?"selected":""}>${esc(i.name||i.id)}</option>`).join("");
  const row = (x) => `<tr data-id="${esc(x.id)}">
    <td>${esc(x.id)}</td>
    <td><select class="bo-input" data-f="role" style="max-width:130px">${roleSel(x.role)}</select></td>
    <td><select class="bo-input" data-f="scope" style="max-width:100px">${scopeSel(x.scope||"full")}</select></td>
    <td><select class="bo-input" data-f="groupId" style="max-width:150px">${gSel(x.groupId)}</select></td>
    <td><select class="bo-input" data-f="influencerId" style="max-width:150px">${iSel(x.influencerId)}</select></td>
    <td><label class="switch"><input type="checkbox" data-f="active" ${x.active!==false?"checked":""}> פעיל</label></td>
    <td><button class="bo-save" data-act="save-role">שמירה</button> <button class="bo-del" data-act="del-role">מחיקה</button></td>
  </tr>`;
  $("bo-body").innerHTML = `<div class="bo-card"><table>
    <thead><tr><th>אימייל</th><th>תפקיד</th><th>היקף</th><th>קבוצה</th><th>מוביל</th><th>סטטוס</th><th></th></tr></thead>
    <tbody>
      ${roles.sort((a,b)=>a.id.localeCompare(b.id)).map(row).join("")}
      <tr class="bo-addrow" data-id="">
        <td><input class="bo-input" data-f="email" placeholder="email@gmail.com" style="max-width:210px"></td>
        <td><select class="bo-input" data-f="role" style="max-width:130px">${roleSel("manager")}</select></td>
        <td><select class="bo-input" data-f="scope" style="max-width:100px">${scopeSel("full")}</select></td>
        <td><select class="bo-input" data-f="groupId" style="max-width:150px">${gSel("")}</select></td>
        <td><select class="bo-input" data-f="influencerId" style="max-width:150px">${iSel("")}</select></td>
        <td><label class="switch"><input type="checkbox" data-f="active" checked> פעיל</label></td>
        <td><button class="bo-save" data-act="add-role">הוספה</button></td>
      </tr>
    </tbody></table></div>
    <p class="sub" style="margin-top:8px">אימייל הוא מזהה המסמך. שינוי אימייל = הרשאה חדשה.</p>`;
  bind();
}

// ── Registration flags ──────────────────────────────────────────────────────
async function renderFlags() {
  let regs;
  if (DEMO_BO) { regs = MOCK.registrations.map((x) => ({ ...x })); }
  else {
    const snap = await getDocs(query(collection(DB, "registrations"), orderBy("createdAt", "desc"), limit(100)));
    regs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  const row = (x) => `<tr data-id="${esc(x.id)}">
    <td>${esc(x.name || "—")}</td><td class="num">…${esc(x.phoneLast3 || "")}</td>
    <td><label class="switch"><input type="checkbox" data-f="isTest" ${x.isTest?"checked":""}> בדיקה</label></td>
    <td><label class="switch"><input type="checkbox" data-f="isDuplicate" ${x.isDuplicate?"checked":""}> כפילות</label></td>
    <td><button class="bo-save" data-act="save-flag">שמירה</button></td>
  </tr>`;
  $("bo-body").innerHTML = `<div class="bo-card"><table>
    <thead><tr><th>שם</th><th>טלפון</th><th>בדיקה</th><th>כפילות</th><th></th></tr></thead>
    <tbody>${regs.length ? regs.map(row).join("") : '<tr><td colspan="5"><div class="empty">אין הרשמות</div></td></tr>'}</tbody>
  </table></div><p class="sub" style="margin-top:8px">50 ההרשמות האחרונות. סימון בדיקה/כפילות בלבד — שאר השדות אינם ניתנים לעריכה.</p>`;
  bind();
}

// ── Row helpers + actions ────────────────────────────────────────────────────
function readRow(tr) {
  const o = {};
  tr.querySelectorAll("[data-f]").forEach((el) => {
    o[el.dataset.f] = el.type === "checkbox" ? el.checked : el.value.trim();
  });
  return o;
}
function bind() {
  $("bo-body").querySelectorAll("button[data-act]").forEach((b) =>
    b.addEventListener("click", () => handle(b)));
}
async function handle(btn) {
  const tr = btn.closest("tr");
  const id = tr.dataset.id;
  const v = readRow(tr);
  btn.disabled = true; msg("שומר…");
  try {
    switch (btn.dataset.act) {
      case "add-infl":
        if (!v.name) throw new Error("שם חובה");
        await setDoc(doc(DB, "influencers", rid("infl")), { name: v.name, referrerCode: v.referrerCode || null, groupId: v.groupId || "default", active: v.active, createdAt: new Date() });
        break;
      case "save-infl":
        await setDoc(doc(DB, "influencers", id), { name: v.name, referrerCode: v.referrerCode || null, groupId: v.groupId || "default", active: v.active }, { merge: true });
        break;
      case "del-infl": await deleteDoc(doc(DB, "influencers", id)); break;
      case "add-grp":
        if (!v.name) throw new Error("שם חובה");
        await setDoc(doc(DB, "groups", rid("grp")), { name: v.name, referrerCode: v.referrerCode || null, active: v.active, createdAt: new Date() });
        break;
      case "save-grp":
        await setDoc(doc(DB, "groups", id), { name: v.name, referrerCode: v.referrerCode || null, active: v.active }, { merge: true });
        break;
      case "del-grp": await deleteDoc(doc(DB, "groups", id)); break;
      case "add-role":
        if (!v.email) throw new Error("אימייל חובה");
        await setDoc(doc(DB, "roles", v.email), { role: v.role, scope: v.scope, groupId: v.groupId || null, influencerId: v.influencerId || null, active: v.active });
        break;
      case "save-role":
        await setDoc(doc(DB, "roles", id), { role: v.role, scope: v.scope, groupId: v.groupId || null, influencerId: v.influencerId || null, active: v.active }, { merge: true });
        break;
      case "del-role": await deleteDoc(doc(DB, "roles", id)); break;
      case "save-flag":
        await updateDoc(doc(DB, "registrations", id), { isTest: v.isTest, isDuplicate: v.isDuplicate });
        break;
    }
    msg("נשמר ✓", "ok");
    if (btn.dataset.act.startsWith("add") || btn.dataset.act.startsWith("del")) {
      const tab = document.querySelector(".bo-tab.active")?.dataset.tab;
      if (tab) loadTab(tab);   // refresh list after add/delete
    }
  } catch (e) {
    console.error(e); msg("שגיאה: " + (e?.code || e?.message || e), "err");
  } finally {
    btn.disabled = false;
  }
}
