// Rendering — HTML generation only.
// No data fetching, no auth, no global state.
// All functions receive their data as arguments.

import { escapeHtml } from "../js/utils/html-escape.js";
import { formatRelativeTime, toDate } from "../js/utils/format.js";
import { getById, createHelpTooltip } from "../js/utils/dom.js";

const RECENT_ROWS_LIMIT = 50;

const NUMBER_FORMATTER = new Intl.NumberFormat("he-IL");

const createChevron = () =>
  '<svg class="chev" viewBox="0 0 20 20" fill="none"><path d="M6 8l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const createStatCard = (label, value, accent, subtext, helpText) =>
  `<div class="stat ${accent ? "accent" : ""}">
    <p class="label">${escapeHtml(label)} ${helpText ? createHelpTooltip(helpText) : ""}</p>
    <p class="value">${value}</p>
    ${subtext ? `<p class="sub">${subtext}</p>` : ""}
  </div>`;

const createPartyChips = (reg) => {
  const chips = [];

  if (reg.partyRegistered === true)
    chips.push('<span class="chip green">סימנ/ה שכבר התפקד/ה</span>');
  else if (reg.partyRegistered === false)
    chips.push('<span class="chip amber">סימנ/ה שלא התפקד/ה</span>');

  if (reg.status === "duplicate")
    chips.push('<span class="chip rose">חשד לכפילות</span>');
  else if (reg.status === "test")
    chips.push('<span class="chip violet">בדיקה</span>');
  else if (reg.status === "suspicious")
    chips.push('<span class="chip amber">חשוד</span>');

  return chips.join(" ") || '<span class="muted">—</span>';
};

const renderSubmissionsTable = (registrations, showEmail) => {
  const rows = registrations
    .slice()
    .sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0))
    .slice(0, RECENT_ROWS_LIMIT);

  if (!rows.length) {
    const colSpan = showEmail ? 6 : 5;
    return `<tr><td colspan="${colSpan}"><div class="empty">אין הרשמות בטווח שנבחר</div></td></tr>`;
  }

  return rows.map((reg) => {
    const emailCell = showEmail
      ? `<td class="muted">${escapeHtml(reg.email || "—")}</td>`
      : "";
    return `<tr>
      <td>${escapeHtml(reg.name || "—")}</td>
      <td class="num">${escapeHtml(reg.phoneMasked || "")}</td>
      ${emailCell}
      <td class="muted">${escapeHtml(reg.referrerName || reg.referrer || "—")}</td>
      <td>${createPartyChips(reg)}</td>
      <td class="muted">${formatRelativeTime(toDate(reg.createdAt))}</td>
    </tr>`;
  }).join("");
};

const renderRecentSubmissionsSection = (registrations, showEmail) => {
  const emailHeader = showEmail ? "<th>אימייל</th>" : "";

  return `<details open>
    <summary>
      <span class="sum-title">הרשמות אחרונות</span>
      <span class="sum-meta">${NUMBER_FORMATTER.format(registrations.length)} סה״כ ${createChevron()}</span>
    </summary>
    <div class="panel">
      <table>
        <thead>
          <tr>
            <th>שם</th>
            <th>טלפון</th>
            ${emailHeader}
            <th>מפנה</th>
            <th>התפקדות למפלגה</th>
            <th>נרשם/ה</th>
          </tr>
        </thead>
        <tbody>${renderSubmissionsTable(registrations, showEmail)}</tbody>
      </table>
    </div>
  </details>`;
};

/**
 * @param {import('./referrers.js').ReferrerAggregation} aggregation
 * @param {{ isAdmin: boolean, groups: Map<string, import('./referrers.js').ReferrerGroup> }} ctx
 */
const renderReferrerSection = (aggregation, ctx) => {
  const { individualRows, groupRows, directCount, unknownCount } = aggregation;
  const { isAdmin, groups } = ctx;
  const knownCount = individualRows.filter((r) => r.isKnown).length;

  const groupSummary = groupRows.length
    ? `<table class="group-summary">
        <thead><tr><th>קבוצה</th><th>הרשמות</th><th>מפנים</th></tr></thead>
        <tbody>
          ${groupRows.map((g) => `<tr>
            <td>${escapeHtml(g.groupName)}</td>
            <td class="num">${NUMBER_FORMATTER.format(g.totalCount)}</td>
            <td class="muted">${g.members.map((m) => escapeHtml(m.name)).join(", ")}</td>
          </tr>`).join("")}
        </tbody>
      </table>`
    : "";

  // Datalist of existing group names powers the inline combobox: an admin can
  // pick an existing group or type a new name (which is created on save).
  const groupDatalist = isAdmin
    ? `<datalist id="referrer-groups">${
        [...groups.values()]
          .filter((g) => g.active)
          .map((g) => `<option value="${escapeHtml(g.name)}"></option>`)
          .join("")
      }</datalist>`
    : "";

  const referrerRows = individualRows
    .map((row) => {
      const editAction = isAdmin
        ? `<td>
            <button class="resolve-btn" data-code="${escapeHtml(row.code)}" aria-expanded="false">
              ${row.isKnown ? "ערוך" : "+ הוסף"}
            </button>
           </td>`
        : "";

      const codeCell   = `<td class="num">${escapeHtml(row.code || "—")}</td>`;
      const nameCell   = `<td>${escapeHtml(row.name)}</td>`;
      const groupCell  = `<td class="muted">${escapeHtml(row.groupName || "—")}</td>`;
      const countCell  = `<td class="num">${NUMBER_FORMATTER.format(row.count)}</td>`;

      const dataRow = `<tr${row.isKnown ? "" : ' class="muted"'} data-ref-code="${escapeHtml(row.code)}">
        ${codeCell}${nameCell}${groupCell}${countCell}${editAction}
      </tr>`;

      // Inline edit form — hidden by default, toggled by the button above.
      // Pre-filled for known referrers; empty name placeholder for unknown codes.
      const editRow = isAdmin
        ? `<tr class="resolve-row" id="resolve-${escapeHtml(row.code)}" hidden>
            <td colspan="5" style="padding: 0;">
              <form class="resolve-form" data-code="${escapeHtml(row.code)}">
                <input name="name" placeholder="שם מפנה" required autocomplete="off"
                  value="${row.isKnown ? escapeHtml(row.name) : ""}" />
                <input name="group" list="referrer-groups" placeholder="קבוצה (לא חובה)" autocomplete="off"
                  value="${escapeHtml(row.groupName || "")}" />
                <select name="type">
                  <option value="individual"${row.type === "organizer" ? "" : " selected"}>מפנה</option>
                  <option value="organizer"${row.type === "organizer" ? " selected" : ""}>מוביל·ת קבוצה</option>
                </select>
                <button type="submit">שמור</button>
                <button type="button" class="resolve-cancel">ביטול</button>
              </form>
            </td>
          </tr>`
        : "";

      return dataRow + editRow;
    })
    .join("");

  const colCount = isAdmin ? 5 : 4;
  const body = referrerRows
    || `<tr><td colspan="${colCount}"><div class="empty">אין נתוני הפניה</div></td></tr>`;

  const footerChips = [
    directCount  ? `<span class="chip">${NUMBER_FORMATTER.format(directCount)} ישיר (ללא מפנה)</span>`  : "",
    unknownCount ? `<span class="chip amber">${NUMBER_FORMATTER.format(unknownCount)} קוד לא מזוהה</span>` : "",
  ].filter(Boolean).join(" ");

  const actionHeader = isAdmin ? `<th></th>` : "";

  return `<details open>
    <summary>
      <span class="sum-title">הפניות</span>
      <span class="sum-meta">${NUMBER_FORMATTER.format(knownCount)} מפנים ${createChevron()}</span>
    </summary>
    <div class="panel">
      ${groupDatalist}
      ${groupSummary}
      <table>
        <thead>
          <tr><th>קוד</th><th>שם</th><th>קבוצה</th><th>הרשמות</th>${actionHeader}</tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
      ${footerChips ? `<p class="panel-footer">${footerChips}</p>` : ""}
    </div>
  </details>`;
};

/**
 * Renders the main dashboard: KPI row + recent submissions.
 * The referrer management UI lives on its own page — see renderReferrers.
 *
 * @param {{
 *   registrations: import('./data.js').Registration[],
 *   userRole:      string,
 * }} params
 */
export const render = ({ registrations, userRole }) => {
  const showEmail = userRole === "admin";

  const lastRegistration = registrations
    .map((reg) => toDate(reg.createdAt))
    .filter(Boolean)
    .sort((a, b) => b - a)[0];

  getById("kpi-row").innerHTML = createStatCard(
    "הרשמות",
    NUMBER_FORMATTER.format(registrations.length),
    false,
    `אחרון: ${lastRegistration ? formatRelativeTime(lastRegistration) : "—"}`,
    "סך ההרשמות שהתקבלו דרך הטופס."
  );

  getById("sections").innerHTML = renderRecentSubmissionsSection(registrations, showEmail);
};

/**
 * Renders the referrer management page into #referrers-root.
 *
 * @param {{
 *   referrerAggregation: import('./referrers.js').ReferrerAggregation,
 *   groups:              Map<string, import('./referrers.js').ReferrerGroup>,
 *   userRole:            string,
 * }} params
 */
export const renderReferrers = ({ referrerAggregation, groups, userRole }) => {
  const isAdmin = userRole === "admin";
  getById("referrers-root").innerHTML = renderReferrerSection(referrerAggregation, { isAdmin, groups });
};
