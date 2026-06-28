// Rendering — HTML generation only.
// No data fetching, no auth, no global state.
// All functions receive their data as arguments.

import { escapeHtml } from "../js/utils/html-escape.js";
import { formatRelativeTime, toDate } from "../js/utils/format.js";
import { getById, createHelpTooltip } from "../js/utils/dom.js";
import { chevron as createChevron } from "./chevron.component.js";

const RECENT_ROWS_LIMIT = 50;

const NUMBER_FORMATTER = new Intl.NumberFormat("he-IL");

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

const renderReferrerSection = (registrations, referrers) => {
  // Count registrations per referrer code
  const counts = new Map();
  for (const reg of registrations) {
    const code = reg.referrer || "";
    counts.set(code, (counts.get(code) || 0) + 1);
  }

  const rows = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => {
      const name = referrers.get(code)?.name || code || "—";
      return `<tr>
        <td class="num">${escapeHtml(code || "—")}</td>
        <td>${escapeHtml(name)}</td>
        <td class="num">${NUMBER_FORMATTER.format(count)}</td>
      </tr>`;
    })
    .join("");

  const body = rows || `<tr><td colspan="3"><div class="empty">אין נתוני הפניה</div></td></tr>`;

  return `<details open>
    <summary>
      <span class="sum-title">הפניות</span>
      <span class="sum-meta">${NUMBER_FORMATTER.format(counts.size)} מפנים ${createChevron()}</span>
    </summary>
    <div class="panel">
      <table>
        <thead>
          <tr><th>קוד</th><th>שם</th><th>הרשמות</th></tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </details>`;
};

export const render = ({ registrations, referrers, userRole }) => {
  const showEmail = userRole === "admin";

  // Enrich registrations with resolved referrer name
  const enriched = registrations.map((reg) => ({
    ...reg,
    referrerName: referrers.get(reg.referrer)?.name || "",
  }));

  const lastRegistration = enriched
    .map((reg) => toDate(reg.createdAt))
    .filter(Boolean)
    .sort((a, b) => b - a)[0];

  getById("kpi-row").innerHTML = createStatCard(
    "הרשמות",
    NUMBER_FORMATTER.format(enriched.length),
    false,
    `אחרון: ${lastRegistration ? formatRelativeTime(lastRegistration) : "—"}`,
    "סך ההרשמות שהתקבלו דרך הטופס."
  );

  getById("sections").innerHTML = [
    renderReferrerSection(enriched, referrers),
    renderRecentSubmissionsSection(enriched, showEmail),
  ].join("");
};
