// backoffice.js — admin management UI (admin-only). Isolated; rules-gated writes.
// Tabs: influencers, groups, roles (permissions), registration flags.

import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { escapeHtml, getPhoneLast3 } from "../js/utils/format.js";
import { generateRequestId } from "../js/utils/id-gen.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_OPTIONS = ["admin", "manager", "influencer"];
const SCOPE_OPTIONS = ["full", "group"];
const LIMIT_SUBMISSIONS = 100;

const MOCK_DATA = {
  groups: [
    {
      id: "default",
      name: "כללי (ברירת מחדל)",
      referrerCode: null,
      active: true,
    },
    { id: "grp_tzipi", name: "צפי שומר", referrerCode: "11", active: true },
  ],
  influencers: [
    {
      id: "infl_1",
      name: "נופר בן צור",
      referrerCode: "1",
      groupId: "default",
      active: true,
    },
    {
      id: "infl_11",
      name: "צפי שומר",
      referrerCode: "tzipi",
      groupId: "grp_tzipi",
      active: true,
    },
    {
      id: "infl_17",
      name: "טל קורנט",
      referrerCode: "17",
      groupId: "default",
      active: true,
    },
  ],
  roles: [
    {
      id: "fromlior@gmail.com",
      role: "admin",
      scope: "full",
      groupId: null,
      influencerId: null,
      active: true,
    },
    {
      id: "matti.picus@gmail.com",
      role: "admin",
      scope: "full",
      groupId: null,
      influencerId: null,
      active: true,
    },
  ],
  registrations: [
    { id: "r1", name: "נ׳ בן צור", phoneLast3: "567", isTest: false, isDuplicate: false },
    { id: "r2", name: "בדיקה", phoneLast3: "000", isTest: true, isDuplicate: false },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// DOM shortcuts
// ─────────────────────────────────────────────────────────────────────────────

const getById = (id) => document.getElementById(id);

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let firebaseDb = null;
let isWired = false;
let groupsCache = [];
let isDemoMode = false;

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

export const openBackoffice = (db, demo = false) => {
  firebaseDb = db;
  isDemoMode = demo;

  getById("content").classList.add("hidden");
  getById("backoffice").classList.remove("hidden");

  if (!isWired) {
    isWired = true;
    getById("bo-back").addEventListener("click", closeBackoffice);
    document.querySelectorAll(".bo-tab").forEach((tabElement) =>
      tabElement.addEventListener("click", () =>
        selectTab(tabElement.dataset.tab)
      )
    );
  }

  selectTab("influencers");
};

// ─────────────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────────────

const closeBackoffice = () => {
  getById("backoffice").classList.add("hidden");
  getById("content").classList.remove("hidden");
};

const selectTab = (tabName) => {
  document.querySelectorAll(".bo-tab").forEach((tabElement) =>
    tabElement.classList.toggle("active", tabElement.dataset.tab === tabName)
  );
  setMessage("");
  loadTab(tabName);
};

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────────────

const setMessage = (text, kind) => {
  const messageElement = getById("bo-msg");
  messageElement.textContent = text || "";
  messageElement.className = "bo-msg" + (kind ? " " + kind : "");
};

const showLoading = () => {
  getById("bo-body").innerHTML =
    '<div class="empty"><span class="spinner"></span></div>';
};

// ─────────────────────────────────────────────────────────────────────────────
// Data fetching
// ─────────────────────────────────────────────────────────────────────────────

const fetchAllDocuments = async (collectionName) => {
  if (isDemoMode) {
    return (MOCK_DATA[collectionName] || []).map((doc) => ({ ...doc }));
  }

  const snapshot = await getDocs(collection(firebaseDb, collectionName));
  return snapshot.docs.map((docSnapshot) => ({
    id: docSnapshot.id,
    ...docSnapshot.data(),
  }));
};

// ─────────────────────────────────────────────────────────────────────────────
// Tab loading dispatcher
// ─────────────────────────────────────────────────────────────────────────────

const loadTab = async (tabName) => {
  showLoading();

  try {
    if (tabName === "influencers") return renderInfluencers();
    if (tabName === "groups") return renderGroups();
    if (tabName === "roles") return renderRoles();
    if (tabName === "flags") return renderFlags();
  } catch (error) {
    console.error(error);
    setMessage(
      "שגיאה בטעינה: " + (error?.code || error?.message || error),
      "err"
    );
    getById("bo-body").innerHTML = "";
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Influencers tab
// ─────────────────────────────────────────────────────────────────────────────

const renderInfluencers = async () => {
  const [influencers, groups] = await Promise.all([
    fetchAllDocuments("influencers"),
    fetchAllDocuments("groups"),
  ]);

  groupsCache = groups;

  const renderGroupOptions = (selectedGroupId) =>
    groups
      .map(
        (group) =>
          `<option value="${escapeHtml(group.id)}" ${group.id === selectedGroupId ? "selected" : ""}>${escapeHtml(group.name || group.id)}</option>`
      )
      .join("");

  const renderInfluencerRow = (influencer) => `<tr data-id="${escapeHtml(influencer.id)}">
    <td><input class="bo-input" data-f="name" value="${escapeHtml(influencer.name || "")}"></td>
    <td><input class="bo-input" data-f="referrerCode" style="max-width:90px" value="${escapeHtml(influencer.referrerCode ?? "")}"></td>
    <td><select class="bo-input" data-f="groupId">${renderGroupOptions(influencer.groupId)}</select></td>
    <td><label class="switch"><input type="checkbox" data-f="active" ${influencer.active !== false ? "checked" : ""}> פעיל</label></td>
    <td><button class="bo-save" data-act="save-infl">שמירה</button> <button class="bo-del" data-act="del-infl">מחיקה</button></td>
  </tr>`;

  const influencersHtml = `<div class="bo-card"><table>
    <thead><tr><th>שם</th><th>קוד מפנה</th><th>קבוצה</th><th>סטטוס</th><th></th></tr></thead>
    <tbody>
      ${influencers.sort((a, b) => (a.name || "").localeCompare(b.name || "", "he")).map(renderInfluencerRow).join("")}
      <tr class="bo-addrow" data-id="">
        <td><input class="bo-input" data-f="name" placeholder="שם חדש"></td>
        <td><input class="bo-input" data-f="referrerCode" style="max-width:90px" placeholder="קוד"></td>
        <td><select class="bo-input" data-f="groupId">${renderGroupOptions(null)}</select></td>
        <td><label class="switch"><input type="checkbox" data-f="active" checked> פעיל</label></td>
        <td><button class="bo-save" data-act="add-infl">הוספה</button></td>
      </tr>
    </tbody></table></div>`;

  getById("bo-body").innerHTML = influencersHtml;
  bindRowActions();
};

// ─────────────────────────────────────────────────────────────────────────────
// Groups tab
// ─────────────────────────────────────────────────────────────────────────────

const renderGroups = async () => {
  const groups = await fetchAllDocuments("groups");

  const renderGroupRow = (group) => `<tr data-id="${escapeHtml(group.id)}">
    <td><input class="bo-input" data-f="name" value="${escapeHtml(group.name || "")}"></td>
    <td><input class="bo-input" data-f="referrerCode" style="max-width:90px" value="${escapeHtml(group.referrerCode ?? "")}"></td>
    <td><label class="switch"><input type="checkbox" data-f="active" ${group.active !== false ? "checked" : ""}> פעיל</label></td>
    <td><button class="bo-save" data-act="save-grp">שמירה</button> <button class="bo-del" data-act="del-grp">מחיקה</button></td>
  </tr>`;

  const groupsHtml = `<div class="bo-card"><table>
    <thead><tr><th>שם קבוצה</th><th>קוד מפנה</th><th>סטטוס</th><th></th></tr></thead>
    <tbody>
      ${groups.sort((a, b) => (a.name || "").localeCompare(b.name || "", "he")).map(renderGroupRow).join("")}
      <tr class="bo-addrow" data-id="">
        <td><input class="bo-input" data-f="name" placeholder="קבוצה חדשה"></td>
        <td><input class="bo-input" data-f="referrerCode" style="max-width:90px" placeholder="קוד"></td>
        <td><label class="switch"><input type="checkbox" data-f="active" checked> פעיל</label></td>
        <td><button class="bo-save" data-act="add-grp">הוספה</button></td>
      </tr>
    </tbody></table></div>`;

  getById("bo-body").innerHTML = groupsHtml;
  bindRowActions();
};

// ─────────────────────────────────────────────────────────────────────────────
// Roles tab
// ─────────────────────────────────────────────────────────────────────────────

const renderRoles = async () => {
  const [roles, groups, influencers] = await Promise.all([
    fetchAllDocuments("roles"),
    fetchAllDocuments("groups"),
    fetchAllDocuments("influencers"),
  ]);

  const renderRoleOptions = (selectedRole) =>
    ROLE_OPTIONS.map(
      (role) =>
        `<option value="${role}" ${role === selectedRole ? "selected" : ""}>${role}</option>`
    ).join("");

  const renderScopeOptions = (selectedScope) =>
    SCOPE_OPTIONS.map(
      (scope) =>
        `<option value="${scope}" ${scope === selectedScope ? "selected" : ""}>${scope}</option>`
    ).join("");

  const renderGroupOptions = (selectedGroupId) =>
    `<option value="">—</option>` +
    groups
      .map(
        (group) =>
          `<option value="${escapeHtml(group.id)}" ${group.id === selectedGroupId ? "selected" : ""}>${escapeHtml(group.name || group.id)}</option>`
      )
      .join("");

  const renderInfluencerOptions = (selectedInfluencerId) =>
    `<option value="">—</option>` +
    influencers
      .map(
        (influencer) =>
          `<option value="${escapeHtml(influencer.id)}" ${influencer.id === selectedInfluencerId ? "selected" : ""}>${escapeHtml(influencer.name || influencer.id)}</option>`
      )
      .join("");

  const renderRoleRow = (role) => `<tr data-id="${escapeHtml(role.id)}">
    <td>${escapeHtml(role.id)}</td>
    <td><select class="bo-input" data-f="role" style="max-width:130px">${renderRoleOptions(role.role)}</select></td>
    <td><select class="bo-input" data-f="scope" style="max-width:100px">${renderScopeOptions(role.scope || "full")}</select></td>
    <td><select class="bo-input" data-f="groupId" style="max-width:150px">${renderGroupOptions(role.groupId)}</select></td>
    <td><select class="bo-input" data-f="influencerId" style="max-width:150px">${renderInfluencerOptions(role.influencerId)}</select></td>
    <td><label class="switch"><input type="checkbox" data-f="active" ${role.active !== false ? "checked" : ""}> פעיל</label></td>
    <td><button class="bo-save" data-act="save-role">שמירה</button> <button class="bo-del" data-act="del-role">מחיקה</button></td>
  </tr>`;

  const rolesHtml = `<div class="bo-card"><table>
    <thead><tr><th>אימייל</th><th>תפקיד</th><th>היקף</th><th>קבוצה</th><th>מוביל</th><th>סטטוס</th><th></th></tr></thead>
    <tbody>
      ${roles.sort((a, b) => a.id.localeCompare(b.id)).map(renderRoleRow).join("")}
      <tr class="bo-addrow" data-id="">
        <td><input class="bo-input" data-f="email" placeholder="email@gmail.com" style="max-width:210px"></td>
        <td><select class="bo-input" data-f="role" style="max-width:130px">${renderRoleOptions("manager")}</select></td>
        <td><select class="bo-input" data-f="scope" style="max-width:100px">${renderScopeOptions("full")}</select></td>
        <td><select class="bo-input" data-f="groupId" style="max-width:150px">${renderGroupOptions("")}</select></td>
        <td><select class="bo-input" data-f="influencerId" style="max-width:150px">${renderInfluencerOptions("")}</select></td>
        <td><label class="switch"><input type="checkbox" data-f="active" checked> פעיל</label></td>
        <td><button class="bo-save" data-act="add-role">הוספה</button></td>
      </tr>
    </tbody></table></div>
    <p class="sub" style="margin-top:8px">אימייל הוא מזהה המסמך. שינוי אימייל = הרשאה חדשה.</p>`;

  getById("bo-body").innerHTML = rolesHtml;
  bindRowActions();
};

// ─────────────────────────────────────────────────────────────────────────────
// Submission flags tab (read-only + moderation)
// ─────────────────────────────────────────────────────────────────────────────

const renderFlags = async () => {
  let submissions;
  let flags = {};

  if (isDemoMode) {
    submissions = MOCK_DATA.registrations.map((reg) => ({ ...reg }));
  } else {
    const [submissionSnapshot, flagSnapshot] = await Promise.all([
      getDocs(
        query(
          collection(firebaseDb, "join_form"),
          orderBy("ts", "desc"),
          limit(LIMIT_SUBMISSIONS)
        )
      ),
      getDocs(collection(firebaseDb, "submission_flags")),
    ]);

    submissions = submissionSnapshot.docs.map((docSnapshot) => ({
      id: docSnapshot.id,
      ...docSnapshot.data(),
    }));

    flagSnapshot.forEach((docSnapshot) => {
      flags[docSnapshot.id] = docSnapshot.data() || {};
    });
  }

  const getFullName = (submission) =>
    submission.name ||
    ((submission.firstName || "") + " " + (submission.lastName || "")).trim() ||
    "—";

  const getPhoneLast3Display = (submission) =>
    submission.phoneLast3 || getPhoneLast3(submission.phone);

  const getPartyStatusDisplay = (submission) => {
    if (submission.registered === "yes") return "כן";
    if (submission.registered === "no") return "לא";
    return submission.partyRegistered ? "כן" : "—";
  };

  const isDuplicate = (submission) =>
    isDemoMode
      ? !!submission.isDuplicate
      : !!(flags[submission.id] || {}).isDuplicate;

  const isTest = (submission) =>
    isDemoMode ? !!submission.isTest : !!(flags[submission.id] || {}).isTest;

  const renderFlagRow = (submission) => `<tr data-id="${escapeHtml(submission.id)}">
    <td>${escapeHtml(getFullName(submission))}</td>
    <td class="num">…${escapeHtml(getPhoneLast3Display(submission))}</td>
    <td>${escapeHtml(getPartyStatusDisplay(submission))}</td>
    <td class="muted">${escapeHtml(submission.source || "—")}</td>
    <td><label class="switch"><input type="checkbox" data-f="isDuplicate" ${isDuplicate(submission) ? "checked" : ""}> כפילות</label></td>
    <td><label class="switch"><input type="checkbox" data-f="isTest" ${isTest(submission) ? "checked" : ""}> בדיקה</label></td>
    <td><button class="bo-save" data-act="save-flag">שמירה</button></td>
  </tr>`;

  const flagsHtml = `<div class="bo-card"><table>
    <thead><tr><th>שם</th><th>טלפון</th><th>התפקדות</th><th>מקור</th><th>כפילות</th><th>בדיקה</th><th></th></tr></thead>
    <tbody>${submissions.length ? submissions.map(renderFlagRow).join("") : '<tr><td colspan="7"><div class="empty">אין הרשמות</div></td></tr>'}</tbody>
  </table></div><p class="sub" style="margin-top:8px">100 ההרשמות האחרונות מתוך join_form. סימון כפילות/בדיקה נשמר בנפרד (submission_flags) ומסונן מהלוח לפי כפתורי הסינון.</p>`;

  getById("bo-body").innerHTML = flagsHtml;
  bindRowActions();
};

// ─────────────────────────────────────────────────────────────────────────────
// Row manipulation
// ─────────────────────────────────────────────────────────────────────────────

const readRowFields = (tableRow) => {
  const fields = {};
  tableRow.querySelectorAll("[data-f]").forEach((inputElement) => {
    const fieldName = inputElement.dataset.f;
    fields[fieldName] =
      inputElement.type === "checkbox"
        ? inputElement.checked
        : inputElement.value.trim();
  });
  return fields;
};

const bindRowActions = () => {
  getById("bo-body")
    .querySelectorAll("button[data-act]")
    .forEach((button) =>
      button.addEventListener("click", () => handleAction(button))
    );
};

const handleAction = async (button) => {
  const tableRow = button.closest("tr");
  const rowId = tableRow.dataset.id;
  const fields = readRowFields(tableRow);

  button.disabled = true;
  setMessage("שומר…");

  if (isDemoMode) {
    setMessage("נשמר ✓ (תצוגת דמו — לא נכתב)", "ok");
    button.disabled = false;
    return;
  }

  try {
    const action = button.dataset.act;

    if (action === "add-infl") {
      if (!fields.name) throw new Error("שם חובה");
      await setDoc(doc(firebaseDb, "influencers", generateRequestId("infl")), {
        name: fields.name,
        referrerCode: fields.referrerCode || null,
        groupId: fields.groupId || "default",
        active: fields.active,
        createdAt: new Date(),
      });
    } else if (action === "save-infl") {
      await setDoc(
        doc(firebaseDb, "influencers", rowId),
        {
          name: fields.name,
          referrerCode: fields.referrerCode || null,
          groupId: fields.groupId || "default",
          active: fields.active,
        },
        { merge: true }
      );
    } else if (action === "del-infl") {
      await deleteDoc(doc(firebaseDb, "influencers", rowId));
    } else if (action === "add-grp") {
      if (!fields.name) throw new Error("שם חובה");
      await setDoc(doc(firebaseDb, "groups", generateRequestId("grp")), {
        name: fields.name,
        referrerCode: fields.referrerCode || null,
        active: fields.active,
        createdAt: new Date(),
      });
    } else if (action === "save-grp") {
      await setDoc(
        doc(firebaseDb, "groups", rowId),
        {
          name: fields.name,
          referrerCode: fields.referrerCode || null,
          active: fields.active,
        },
        { merge: true }
      );
    } else if (action === "del-grp") {
      await deleteDoc(doc(firebaseDb, "groups", rowId));
    } else if (action === "add-role") {
      if (!fields.email) throw new Error("אימייל חובה");
      const normalizedEmail = fields.email.toLowerCase(); // Google tokens are lowercase
      await setDoc(doc(firebaseDb, "roles", normalizedEmail), {
        role: fields.role,
        scope: fields.scope,
        groupId: fields.groupId || null,
        influencerId: fields.influencerId || null,
        active: fields.active,
      });
    } else if (action === "save-role") {
      await setDoc(
        doc(firebaseDb, "roles", rowId),
        {
          role: fields.role,
          scope: fields.scope,
          groupId: fields.groupId || null,
          influencerId: fields.influencerId || null,
          active: fields.active,
        },
        { merge: true }
      );
    } else if (action === "del-role") {
      await deleteDoc(doc(firebaseDb, "roles", rowId));
    } else if (action === "save-flag") {
      await setDoc(
        doc(firebaseDb, "submission_flags", rowId),
        {
          isTest: !!fields.isTest,
          isDuplicate: !!fields.isDuplicate,
          updatedAt: new Date(),
        },
        { merge: true }
      );
    }

    setMessage("נשמר ✓", "ok");

    // Refresh list after add/delete
    if (action.startsWith("add") || action.startsWith("del")) {
      const activeTab = document.querySelector(".bo-tab.active")?.dataset.tab;
      if (activeTab) loadTab(activeTab);
    }
  } catch (error) {
    console.error(error);
    setMessage(
      "שגיאה: " + (error?.code || error?.message || error),
      "err"
    );
  } finally {
    button.disabled = false;
  }
};
