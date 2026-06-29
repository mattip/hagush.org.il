// Referrers list section rendering

import { sortByCode } from "../utils.js";
import { escapeHtml } from "../../../../js/utils/html-escape.js";

export const renderReferrersListSection = (
  referrers,
  { isAdmin, groups, referrerCounts }
) => {
  if (!referrers || referrers.size === 0) {
    return '<div style="padding: 20px; text-align: center;">אין מפנים</div>';
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
      return `
        <tr data-ref-code="${safeCode}">
          <td>${safeCode}</td>
          <td>${safeName}</td>
          <td>${ref.type === "organizer" ? "מנהל·ת" : "פרטי"}</td>
          <td>${safeGroup}</td>
          <td>${count}</td>
          ${isAdmin ? `<td>
            <button data-action="edit" data-code="${safeCode}" style="margin-right: 8px;">ערוך</button>
            <button data-action="delete" data-code="${safeCode}" style="color: #d32f2f;">מחק</button>
          </td>` : ""}
        </tr>
      `;
    })
    .join("");

  const groupOptions = Array.from(groups?.values() || [])
    .filter(g => g.active)
    .map(g => `<option value="${g.id}">${g.name}</option>`)
    .join("");

  const addButton = isAdmin ? `<p style="margin-top: 12px;"><button type="button" id="add-referrer-btn" class="btn">+ הוסף מפנה</button></p>` : "";

  return `
    <section style="margin: 20px 0;">
      <h2>רשימת מפנים</h2>
      <table style="width: 100%; border-collapse: collapse;">
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
      ${addButton}
      <div id="referrer-group-options" style="display: none;">
        ${groupOptions}
      </div>
    </section>
  `;
};
