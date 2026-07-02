// Referrer management page - minimal standalone version

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  getDoc,
  doc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "../../js/utils/firebase-config.js";
import { escapeHtml } from "../../js/utils/html-escape.js";
import { formatRelativeTime } from "../../js/utils/format.js";
import { show, hide } from "../../js/utils/dom.js";
import {
  fetchReferrers,
  fetchReferrerGroups,
  saveReferrer,
  saveGroup,
  deleteReferrer,
  deleteGroup,
} from "./referrers.api.js";
import {
  transformSubmissionToRegistration,
  fetchJoinFormSubmissions,
} from "../data.js";
import { renderReferrers } from "./render.js";
import { REFERRER_PAGE } from "./referrers.selectors.js";
import { ROLE_LABELS } from "../roles.js";

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

let userIdentity = null;

REFERRER_PAGE.loginBtn?.addEventListener("click", async () => {
  REFERRER_PAGE.loginBtn.disabled = true;
  REFERRER_PAGE.loginErr.textContent = "";
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    if (err?.code !== "auth/cancelled-popup-request") {
      REFERRER_PAGE.loginErr.textContent = "שגיאה בכניסה: " + (err?.code || err);
    }
  } finally {
    REFERRER_PAGE.loginBtn.disabled = false;
  }
});

REFERRER_PAGE.logoutBtn?.addEventListener("click", () => signOut(auth));
REFERRER_PAGE.naLogout?.addEventListener("click", () => signOut(auth));

// ─────────────────────────────────────────────────────────────────────────────
// Data Loading
// ─────────────────────────────────────────────────────────────────────────────

const loadData = async () => {
  if (!userIdentity) return;

  try {
    show(REFERRER_PAGE.loadingEl);
    hide(REFERRER_PAGE.contentEl);

    const [submissionsRaw, referrers, groups] = await Promise.all([
      fetchJoinFormSubmissions(db),
      fetchReferrers(db),
      fetchReferrerGroups(db),
    ]);

    const registrations = submissionsRaw.map(transformSubmissionToRegistration);
    const referrerCounts = new Map();
    const groupCounts = new Map();

    for (const reg of registrations) {
      const code = reg.referrer || "";
      if (!code) continue;
      referrerCounts.set(code, (referrerCounts.get(code) || 0) + 1);
      const ref = referrers.get(code);
      if (ref?.groupId) {
        groupCounts.set(ref.groupId, (groupCounts.get(ref.groupId) || 0) + 1);
      }
    }

    renderReferrers({
      referrers,
      groups,
      groupCounts,
      referrerCounts,
      userRole: userIdentity.role,
    });

    REFERRER_PAGE.updatedEl.textContent = "עודכן " + formatRelativeTime(new Date());

    hide(REFERRER_PAGE.loadingEl);
    show(REFERRER_PAGE.contentEl);
  } catch (e) {
    console.error("Load failed:", e);
    REFERRER_PAGE.loadingEl.innerHTML = '<div class="empty">שגיאה בטעינת הנתונים: ' + escapeHtml(e?.message || e) + "</div>";
  }
};

REFERRER_PAGE.refreshBtn?.addEventListener("click", loadData);

// ─────────────────────────────────────────────────────────────────────────────
// Event Handlers
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener("click", async (e) => {
  const addReferrerBtn = e.target.closest("#add-referrer-btn");
  if (addReferrerBtn) {
    e.preventDefault();

    const table = REFERRER_PAGE.referrersRoot?.querySelector("table tbody");
    if (!table) return;

    const tempId = `new-referrer-${Date.now()}`;
    const newRow = document.createElement("tr");
    newRow.setAttribute("data-action", "resolve-row");
    newRow.setAttribute("data-code", tempId);
    newRow.innerHTML = `
      <td colspan="6" style="padding: 0;">
        <form data-action="resolve-form-new-referrer" data-code="${tempId}" style="display: flex; gap: 8px; padding: 8px;">
          <input name="code" placeholder="קוד" required autocomplete="off" style="flex: 1;" autofocus />
          <input name="name" placeholder="שם" required autocomplete="off" style="flex: 2;" />
          <button type="submit" style="min-width: 80px;">שמור</button>
          <button type="button" data-action="resolve-cancel" style="min-width: 80px;">ביטול</button>
        </form>
      </td>
    `;

    table.insertBefore(newRow, table.firstChild);
    newRow.querySelector("[name=code]")?.focus();
    return;
  }

  const addGroupBtn = e.target.closest("#add-group-btn");
  if (addGroupBtn) {
    e.preventDefault();

    const groupsSection = addGroupBtn.closest(".panel");
    if (!groupsSection) return;

    const table = groupsSection.querySelector("table tbody");
    if (!table) return;

    const tempId = `new-group-${Date.now()}`;
    const newRow = document.createElement("tr");
    newRow.setAttribute("data-action", "resolve-row");
    newRow.setAttribute("data-group-id", tempId);
    newRow.innerHTML = `
      <td colspan="4" style="padding: 0;">
        <form data-action="resolve-form" data-group-id="${tempId}" data-is-new="true">
          <input name="name" placeholder="שם קבוצה" required autocomplete="off" autofocus />
          <button type="submit">שמור</button>
          <button type="button" data-action="resolve-cancel">ביטול</button>
        </form>
      </td>
    `;

    table.insertBefore(newRow, table.firstChild);
    newRow.querySelector("[name=name]")?.focus();
    return;
  }

  const editBtn = e.target.closest('[data-action="edit"]');
  if (editBtn) {
    e.preventDefault();
    const code = editBtn.dataset.code;
    const row = editBtn.closest("tr");

    const cells = row?.querySelectorAll("td") || [];
    const name = cells[1]?.textContent || "";
    const type = cells[2]?.textContent?.includes("מנהל") ? "organizer" : "individual";
    const groupName = cells[3]?.textContent || "";

    const groupOptionsEl = REFERRER_PAGE.referrersRoot?.querySelector("#referrer-group-options");
    const groupOptions = groupOptionsEl?.innerHTML || "";
    let currentGroupId = "";
    if (groupName && groupName !== "—") {
      const allOptions = groupOptionsEl?.querySelectorAll("option") || [];
      for (const option of allOptions) {
        if (option.textContent.trim() === groupName.trim()) {
          currentGroupId = option.value;
          break;
        }
      }
    }

    let editRow = document.getElementById(`edit-referrer-${code}`);
    if (!editRow) {
      editRow = document.createElement("tr");
      editRow.id = `edit-referrer-${code}`;
      editRow.setAttribute("data-action", "resolve-row");
      editRow.setAttribute("data-code", code);
      editRow.innerHTML = `
        <td colspan="6" style="padding: 0;">
          <form data-action="resolve-form-referrer" data-code="${escapeHtml(code)}" style="display: flex; gap: 8px; padding: 8px;">
            <input name="name" placeholder="שם" required autocomplete="off" value="${escapeHtml(name)}" style="flex: 2;" />
            <select name="type" style="flex: 1;">
              <option value="individual" ${type === "individual" ? "selected" : ""}>פרטי</option>
              <option value="organizer" ${type === "organizer" ? "selected" : ""}>מנהל·ת</option>
            </select>
            <select name="groupId" style="flex: 1;">
              <option value="">ללא קבוצה</option>
              ${groupOptions}
            </select>
            <button type="submit" style="min-width: 80px;">שמור</button>
            <button type="button" data-action="resolve-cancel" style="min-width: 80px;">ביטול</button>
          </form>
        </td>
      `;
      row?.parentNode.insertBefore(editRow, row.nextSibling);

      const groupSelect = editRow.querySelector("[name=groupId]");
      if (currentGroupId) groupSelect.value = currentGroupId;
    }

    editRow.hidden = false;
    editRow.querySelector("[name=name]")?.focus();
    return;
  }

  const deleteBtn = e.target.closest('[data-action="delete"]');
  if (deleteBtn) {
    e.preventDefault();
    const code = deleteBtn.dataset.code;
    if (!confirm(`האם אתה בטוח שברצונך למחוק את המפנה ${code}?`)) return;

    try {
      deleteBtn.disabled = true;
      await deleteReferrer(db, code);
      loadData();
    } catch (err) {
      alert(`שגיאה: ${err?.message || err}`);
      deleteBtn.disabled = false;
    }
    return;
  }

  const deleteGroupBtn = e.target.closest('[data-action="delete-group"]');
  if (deleteGroupBtn) {
    e.preventDefault();
    const groupId = deleteGroupBtn.dataset.groupId;
    if (!confirm("האם אתה בטוח שברצונך למחוק את הקבוצה?")) return;

    try {
      deleteGroupBtn.disabled = true;
      await deleteGroup(db, groupId);
      loadData();
    } catch (err) {
      alert(`שגיאה: ${err?.message || err}`);
      deleteGroupBtn.disabled = false;
    }
    return;
  }

  const editGroupBtn = e.target.closest('[data-action="edit-group"]');
  if (editGroupBtn) {
    e.preventDefault();
    const groupId = editGroupBtn.dataset.groupId;
    const formRow = document.getElementById(`edit-group-${groupId}`);
    if (!formRow) return;
    const open = !formRow.hidden;
    formRow.hidden = open;
    editGroupBtn.setAttribute("aria-expanded", String(!open));
    if (!open) formRow.querySelector("[name=name]")?.focus();
    return;
  }

  const cancelBtn = e.target.closest('[data-action="resolve-cancel"]');
  if (cancelBtn) {
    e.preventDefault();
    const formRow = cancelBtn.closest('[data-action="resolve-row"]');
    if (formRow) {
      formRow.hidden = true;
      const groupId = formRow.dataset.groupId;
      const btn = REFERRER_PAGE.referrersRoot?.querySelector(
        `[data-action="edit-group"][data-group-id="${groupId}"]`
      );
      if (btn) btn.setAttribute("aria-expanded", "false");
    }
    return;
  }
});

// Form submission - groups and referrers
document.addEventListener("submit", async (e) => {
  const form = e.target;
  e.preventDefault();

  if (form.dataset.action === "resolve-form-new-referrer") {
    const code = form.querySelector("[name=code]")?.value;
    const name = form.querySelector("[name=name]")?.value;
    if (!code?.trim() || !name?.trim()) return;

    const row = form.closest("tr");
    try {
      await saveReferrer(db, {
        code: code.trim(),
        name: name.trim(),
        type: "individual",
        groupId: null,
        isNew: true,
      });
      row?.remove();
      loadData();
    } catch (err) {
      alert(`שגיאה: ${err?.message || err}`);
      row?.remove();
    }
    return;
  }

  if (form.dataset.action === "resolve-form-referrer") {
    const code = form.dataset.code;
    const name = form.querySelector("[name=name]")?.value;
    const type = form.querySelector("[name=type]")?.value || "individual";
    const groupId = form.querySelector("[name=groupId]")?.value || null;
    if (!name?.trim()) return;

    try {
      await saveReferrer(db, {
        code,
        name: name.trim(),
        type,
        groupId: groupId || null,
      });
      loadData();
    } catch (err) {
      alert(`שגיאה: ${err?.message || err}`);
    }
    return;
  }

  if (form.dataset.action === "resolve-form") {
    const name = form.querySelector("[name=name]")?.value;
    if (!name?.trim()) return;

    const isNew = form.dataset.isNew === "true";
    const groupId = form.dataset.groupId;
    const row = form.closest("tr");

    try {
      if (isNew) {
        await saveGroup(db, { name: name.trim() });
      } else {
        await updateDoc(doc(db, "referrer_groups", groupId), { name: name.trim() });
      }
      row?.remove();
      loadData();
    } catch (err) {
      alert(`שגיאה: ${err?.message || err}`);
      if (isNew) row?.remove();
    }
    return;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth State
// ─────────────────────────────────────────────────────────────────────────────

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    hide(REFERRER_PAGE.dashScreen);
    hide(REFERRER_PAGE.naScreen);
    show(REFERRER_PAGE.loginScreen);
    return;
  }

  let roleData = null;
  try {
    const snapshot = await getDoc(doc(db, "roles", user.email));
    if (snapshot.exists()) roleData = snapshot.data();
  } catch (e) {
    console.error("role read failed", e);
  }

  if (!roleData || roleData.active !== true) {
    REFERRER_PAGE.naEmail.textContent = user.email;
    hide(REFERRER_PAGE.loginScreen);
    hide(REFERRER_PAGE.dashScreen);
    show(REFERRER_PAGE.naScreen);
    return;
  }

  userIdentity = {
    email: user.email,
    role: roleData.role,
  };

  if (REFERRER_PAGE.roleBadge) REFERRER_PAGE.roleBadge.textContent = ROLE_LABELS[userIdentity.role] || userIdentity.role;
  if (REFERRER_PAGE.userEmail) REFERRER_PAGE.userEmail.textContent = userIdentity.email;

  hide(REFERRER_PAGE.loginScreen);
  hide(REFERRER_PAGE.naScreen);
  show(REFERRER_PAGE.dashScreen);

  loadData();
});
