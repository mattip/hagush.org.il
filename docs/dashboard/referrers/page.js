// Referrer management page entry point.
// Auth + role gating live in auth-gate.js; this module owns the referrer page's
// own chrome, data loading, and the inline resolve form (admin only).

import { escapeHtml } from "../../js/utils/html-escape.js";
import { formatRelativeTime } from "../../js/utils/format.js";
import { getById, show, hide } from "../../js/utils/dom.js";
import { SEL } from "../dashboard-selectors.js";
import {
  transformSubmissionToRegistration,
  fetchJoinFormSubmissions,
} from "../data.js";
import { renderReferrers } from "../dashboard.render.js";
import {
  fetchReferrers,
  fetchReferrerGroups,
  aggregateRegistrationsByReferrer,
  saveReferrer,
  saveGroup,
} from "./referrers.js";
import { initAuthGate } from "../auth/auth-gate.js";

// State set once the user is authorized.
let db = null;
let userIdentity = null;
let currentGroups = new Map(); // latest groups, for name→id resolution on save

// ─────────────────────────────────────────────────────────────────────────────
// Data loading
// ─────────────────────────────────────────────────────────────────────────────

const loadData = async () => {
  if (!userIdentity) return;
  show(getById(SEL.dashboard.loading));
  hide(getById(SEL.dashboard.content));

  try {
    const [submissionsRaw, referrers, groups] = await Promise.all([
      fetchJoinFormSubmissions(db),
      fetchReferrers(db),
      fetchReferrerGroups(db),
    ]);

    currentGroups = groups;

    // Calculate counts
    const registrations = submissionsRaw.map((raw) =>
      transformSubmissionToRegistration(raw)
    );
    const referrerCounts = new Map();
    const groupCounts = new Map();

    for (const reg of registrations) {
      const code = reg.referrer || "";
      if (code) {
        referrerCounts.set(code, (referrerCounts.get(code) || 0) + 1);
      }
      const ref = referrers.get(code);
      if (ref?.groupId) {
        groupCounts.set(ref.groupId, (groupCounts.get(ref.groupId) || 0) + 1);
      }
    }

    renderReferrers({ referrers, groups, groupCounts, referrerCounts, userRole: userIdentity.role });
    getById(SEL.dashboard.updated).textContent = "עודכן " + formatRelativeTime(new Date());
    hide(getById(SEL.dashboard.loading));
    show(getById(SEL.dashboard.content));
  } catch (e) {
    console.error(e);
    getById(SEL.dashboard.loading).innerHTML =
      '<div class="empty">שגיאה בטעינת הנתונים: ' +
      escapeHtml(e?.code || e?.message || e) +
      "</div>";
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Resolve unknown referrer codes (admin only)
// ─────────────────────────────────────────────────────────────────────────────

const initializeReferrerResolve = () => {
  if (userIdentity?.role !== "admin") return;

  // Single delegated listener on #referrers-root handles all resolve interactions
  // regardless of how many times the table re-renders.
  getById(SEL.referrers.root).addEventListener("click", (e) => {
    // Toggle expand for referrer edit
    const btn = e.target.closest('[data-action="resolve"]');
    if (btn) {
      const code    = btn.dataset.code;
      const formRow = document.getElementById(`resolve-${code}`);
      if (!formRow) return;
      const open = !formRow.hidden;
      formRow.hidden = open;
      btn.setAttribute("aria-expanded", String(!open));
      if (!open) formRow.querySelector("[name=name]")?.focus();
      return;
    }

    // Toggle expand for group edit
    const groupBtn = e.target.closest('[data-action="edit-group"]');
    if (groupBtn) {
      const groupId = groupBtn.dataset.groupId;
      const formRow = document.getElementById(`edit-group-${groupId}`);
      if (!formRow) return;
      const open = !formRow.hidden;
      formRow.hidden = open;
      groupBtn.setAttribute("aria-expanded", String(!open));
      if (!open) formRow.querySelector("[name=name]")?.focus();
      return;
    }

    // Cancel
    const cancel = e.target.closest('[data-action="resolve-cancel"]');
    if (cancel) {
      const formRow = cancel.closest('[data-action="resolve-row"]');
      if (!formRow) return;
      formRow.hidden = true;
      const code = formRow.id.replace("resolve-", "").replace("edit-group-", "");
      document.querySelector(
        `[data-action="resolve"][data-code="${CSS.escape(code)}"], [data-action="edit-group"][data-group-id="${CSS.escape(code)}"]`
      )?.setAttribute("aria-expanded", "false");
      return;
    }

    // Add group button
    if (e.target.closest(SEL.referrers.addGroupBtn)) {
      e.preventDefault();
      const groupName = prompt("שם הקבוצה:");
      if (!groupName?.trim()) return;

      saveGroup(db, { name: groupName.trim() }).then(() => {
        loadData();
      }).catch((err) => {
        alert(`שגיאה: ${err?.message || err}`);
      });
      return;
    }
  });

  getById(SEL.referrers.root).addEventListener("submit", async (e) => {
    const form = e.target.closest('[data-action="resolve-form"]');
    if (!form) return;
    e.preventDefault();

    const submitBtn = form.querySelector("[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "שומר…";

    try {
      // Handle referrer edit
      if (form.dataset.code) {
        const code      = form.dataset.code;
        const name      = form.elements.name.value.trim();
        const groupName = form.elements.group.value.trim();
        const type      = form.elements.type.value;

        // Resolve the typed group name to an existing group, or create a new one.
        let groupId = null;
        if (groupName) {
          const existing = [...currentGroups.values()].find(
            (g) => g.name.trim().toLowerCase() === groupName.toLowerCase()
          );
          groupId = existing ? existing.id : await saveGroup(db, { name: groupName });
        }

        await saveReferrer(db, { code, name, groupId, type });
      }
      // Handle group edit
      else if (form.dataset.groupId) {
        const groupId = form.dataset.groupId;
        const name = form.elements.name.value.trim();

        const { doc, setDoc } = await import(
          "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
        );
        await setDoc(doc(db, "referrer_groups", groupId), { name, active: true }, { merge: true });
      }

      await loadData(); // re-fetch everything
    } catch (err) {
      console.error("save failed", err);
      submitBtn.disabled = false;
      submitBtn.textContent = "שמור";
      const errEl = form.querySelector(".resolve-err") || (() => {
        const el = document.createElement("span");
        el.className = "resolve-err";
        form.appendChild(el);
        return el;
      })();
      errEl.textContent = `שגיאה: ${err?.code || err?.message || err}`;
    }
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Bulk seed import (handled by dedicated module)
// ─────────────────────────────────────────────────────────────────────────────

const reloadData = async () => {
  try {
    const [submissionsRaw, referrers, groups] = await Promise.all([
      fetchJoinFormSubmissions(db),
      fetchReferrers(db),
      fetchReferrerGroups(db),
    ]);

    currentGroups = groups;

    const registrations = submissionsRaw.map((raw) =>
      transformSubmissionToRegistration(raw)
    );
    const referrerCounts = new Map();
    const groupCounts = new Map();

    for (const reg of registrations) {
      const code = reg.referrer || "";
      if (code) {
        referrerCounts.set(code, (referrerCounts.get(code) || 0) + 1);
      }
      const ref = referrers.get(code);
      if (ref?.groupId) {
        groupCounts.set(ref.groupId, (groupCounts.get(ref.groupId) || 0) + 1);
      }
    }

    renderReferrers({ referrers, groups, groupCounts, referrerCounts, userRole: userIdentity.role });
    getById(SEL.dashboard.updated).textContent = "עודכן " + formatRelativeTime(new Date());
    initializeReferrerSearch();
  } catch (err) {
    console.error("Reload failed", err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Search filter
// ─────────────────────────────────────────────────────────────────────────────

const initializeReferrerSearch = () => {
  const searchInput = getById(SEL.referrers.search);

  if (!searchInput) {
    setTimeout(initializeReferrerSearch, 300);
    return;
  }

  const performSearch = () => {
    const q = (searchInput.value || "").toLowerCase().trim();
    const allDataRows = document.querySelectorAll("tr[data-ref-code]");

    allDataRows.forEach((row) => {
      const code = row.getAttribute("data-ref-code") || "";
      const cells = row.querySelectorAll("td");

      if (cells.length < 3) return;

      const name = cells[1]?.textContent?.toLowerCase() || "";
      const group = cells[2]?.textContent?.toLowerCase() || "";
      const codeLC = code.toLowerCase();

      const matches =
        !q ||
        codeLC.includes(q) ||
        name.includes(q) ||
        group.includes(q);

      row.style.display = matches ? "" : "none";
    });
  };

  searchInput.addEventListener("input", performSearch);
};

// ─────────────────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────────────────

initAuthGate({
  onReady: (ctx) => {
    db = ctx.db;
    userIdentity = ctx.userIdentity;
    try {
      getById(SEL.dashboard.refreshBtn).addEventListener("click", loadData);
      initializeReferrerResolve();
    } catch (e) {
      console.error("referrer page init failed", e);
      getById(SEL.dashboard.loading).innerHTML =
        '<div class="empty">שגיאת אתחול: ' + escapeHtml(e?.message || e) + "</div>";
      return;
    }
    loadData();
    // Initialize search after loadData renders the form
    setTimeout(initializeReferrerSearch, 500);
  },
});
