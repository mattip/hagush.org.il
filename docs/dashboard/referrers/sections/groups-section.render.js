// Groups section — list of referrer groups with edit inline forms.

import { escapeHtml } from "../../../js/utils/html-escape.js";
import { chevron } from "../../chevron.component.js";

const NUMBER_FORMATTER = new Intl.NumberFormat("he-IL");

export const renderGroupsSection = (
  groups,
  isAdmin,
  groupCounts = new Map(),
  referrers = new Map()
) => {
  const groupArray = [...groups.values()].filter((g) => g.active);

  const groupRows = groupArray
    .map((group) => {
      const count = groupCounts.get(group.id) || 0;
      const groupMembers = [...referrers.values()].filter(
        (r) => r.groupId === group.id && r.active
      );
      const memberNames = groupMembers.map((m) => m.name).join(", ");
      const memberCount = groupMembers.length;

      const editAction = isAdmin
        ? `<td>
            <button data-action="edit-group" data-group-id="${escapeHtml(group.id)}" aria-expanded="false" style="margin-right: 8px;">
              ערוך
            </button>
            <button data-action="delete-group" data-group-id="${escapeHtml(group.id)}" style="color: #d32f2f;">
              מחק
            </button>
           </td>`
        : "";

      const tooltipText = memberNames || "אין מפנים";
      const dataRow = `<tr data-group-id="${escapeHtml(group.id)}">
        <td>${escapeHtml(group.name)}</td>
        <td class="num">${NUMBER_FORMATTER.format(count)}</td>
        <td class="num" style="cursor: help; font-size: 12px;" title="${tooltipText}">${NUMBER_FORMATTER.format(memberCount)}</td>
        ${editAction}
      </tr>`;

      const editRow = isAdmin
        ? `<tr data-action="resolve-row" data-group-id="${escapeHtml(group.id)}" id="edit-group-${escapeHtml(group.id)}" hidden>
            <td colspan="4" style="padding: 0;">
              <form data-action="resolve-form" data-group-id="${escapeHtml(group.id)}">
                <input name="name" placeholder="שם קבוצה" required autocomplete="off"
                  value="${escapeHtml(group.name)}" />
                <button type="submit">שמור</button>
                <button type="button" data-action="resolve-cancel">ביטול</button>
              </form>
            </td>
          </tr>`
        : "";

      return dataRow + editRow;
    })
    .join("");

  const colCount = isAdmin ? 4 : 3;
  const body =
    groupRows || `<tr><td colspan="${colCount}"><div class="empty">אין קבוצות</div></td></tr>`;
  const actionHeader = isAdmin ? `<th></th>` : "";

  return `<details open>
    <summary>
      <span class="sum-title">קבוצות</span>
      <span class="sum-meta">${NUMBER_FORMATTER.format(groupArray.length)} קבוצות ${chevron()}</span>
    </summary>
    <div class="panel">
      <div style="max-height: 420px; overflow-y: auto; border: 1px solid var(--n200); border-radius: var(--radius-lg);">
        <table style="width: 100%;">
          <thead style="position: sticky; top: 0; background: var(--n100);">
            <tr><th>שם</th><th>הרשמות</th><th>מפנים</th>${actionHeader}</tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      ${isAdmin ? `<p class="panel-footer"><button type="button" id="add-group-btn" class="btn">+ הוסף קבוצה</button></p>` : ""}
    </div>
  </details>`;
};
