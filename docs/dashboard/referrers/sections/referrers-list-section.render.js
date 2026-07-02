// Referrers list section rendering

import { sortByCode } from "../utils.js";
import { escapeHtml } from "../../../../js/utils/html-escape.js";

export const renderReferrersListSection = (
  referrers,
  { isAdmin, groups, referrerCounts }
) => {
  if (!referrers || referrers.size === 0) {
    return '<div class="empty">אין מפנים</div>';
  }

  const rows = Array.from(referrers.values())
    .filter((ref) => ref.active)
    .map((ref) => {
      const count = referrerCounts?.get(ref.code) || 0;
      const groupName = ref.groupId ? groups?.get(ref.groupId)?.name || "—" : "—";
      return { ref, count, groupName };
    })
    .sort((a, b) => sortByCode(a.ref.code, b.ref.code))
    .map(({ ref, count, groupName }) => {
      const safeCode = escapeHtml(ref.code);
      const safeName = escapeHtml(ref.name);
      const safeGroup = escapeHtml(groupName);
      const typeLabel = ref.type === "organizer" ? "מנהל·ת" : "פרטי";
      return `
        <tr data-ref-code="${safeCode}">
          <td>${safeCode}</td>
          <td>${safeName}</td>
          <td><span class="chip brand">${typeLabel}</span></td>
          <td>${safeGroup}</td>
          <td class="num">${count}</td>
          ${isAdmin ? `<td>
            <button class="btn" data-action="edit" data-code="${safeCode}">ערוך</button>
            <button class="bo-del" data-action="delete" data-code="${safeCode}">מחק</button>
          </td>` : ""}
        </tr>
      `;
    })
    .join("");

  const groupOptions = Array.from(groups?.values() || [])
    .filter(g => g.active)
    .map(g => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`)
    .join("");

  const addButton = isAdmin
    ? `<div style="padding:12px 0 4px"><button type="button" id="add-referrer-btn" class="btn">+ הוסף מפנה</button></div>`
    : "";

  return `
    <section style="margin-bottom:32px">
      <p class="section-h">רשימת מפנים</p>
      <div class="bo-card">
        <div class="panel" style="border-radius:var(--radius-xl)">
          <table>
            <thead>
              <tr>
                <th>קוד</th>
                <th>שם</th>
                <th>סוג</th>
                <th>קבוצה</th>
                <th>הרשמות</th>
                ${isAdmin ? "<th>פעולות</th>" : ""}
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
        ${addButton}
      </div>
      <div id="referrer-group-options" class="hidden">
        ${groupOptions}
      </div>
    </section>
  `;
};
