// Import modal for CSV data QA and referrer matching

import { escapeHtml } from "../../../js/utils/html-escape.js";
import { findReferrerMatches } from "../../utils/referrer-matcher.js";

export const renderImportModal = (step, data) => {
  if (step === 'preview') {
    return renderPreviewStep(data.headers, data.rows, data.pageNum || 1, data.referrers);
  } else if (step === 'matching') {
    return renderMatchingStep(data.referrerMatches, data.rowCount);
  } else if (step === 'confirm') {
    return renderConfirmStep(data.registrations, data.rowCount, data.referrers);
  } else if (step === 'dryrun') {
    return renderDryRunStep(data.report, data.rowCount);
  } else if (step === 'progress') {
    return renderProgressStep(data.done, data.total, data.batchId);
  }
};

const renderPreviewStep = (headers, rows, pageNum = 1, referrers) => {
  // Resolve a CSV referrer value to "name (code)" when there is an exact name
  // match or a strong fuzzy match; otherwise return the raw value.
  const resolveReferrerDisplay = (val) => {
    if (!val || !val.toString().trim() || !referrers) return { text: val, matched: false };
    const exact = Array.from(referrers.entries()).find(([, r]) => r.name === val);
    if (exact) return { text: `${exact[1].name} (${exact[0]})`, matched: true };
    const { matches } = findReferrerMatches(val, referrers);
    const top = matches[0];
    if (top && top.score > 0.85) return { text: `${top.name} (${top.code})`, matched: true };
    return { text: val, matched: false };
  };

  const pageSize = 15;
  const totalPages = Math.ceil(rows.length / pageSize);
  const startIdx = (pageNum - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, rows.length);
  const pageRows = rows.slice(startIdx, endIdx);

  // Reorder: move referrer next to "איך הגעת"
  const reorderedHeaders = [...headers];
  const referrerHeader = 'referrer';
  const afterHeader = 'איך הגעת';
  let afterIdx = -1;

  for (let i = 0; i < reorderedHeaders.length; i++) {
    if (reorderedHeaders[i] === afterHeader) {
      afterIdx = i;
      break;
    }
  }

  if (afterIdx !== -1) {
    // Remove referrer from original position
    const referrerIdx = reorderedHeaders.indexOf(referrerHeader);
    if (referrerIdx !== -1 && referrerIdx !== afterIdx + 1) {
      reorderedHeaders.splice(referrerIdx, 1);
      reorderedHeaders.splice(afterIdx + 1, 0, referrerHeader);
    }
  }

  const headerRow = `<th style="min-width: 40px; text-align: center;">#</th>` + reorderedHeaders
    .map(h => {
      const isReferrer = h.toLowerCase() === 'referrer';
      const width = isReferrer ? '150px' : '120px';
      const style = isReferrer ? `style="min-width: ${width}; font-weight: 600; background: var(--brand-50); color: var(--brand-700);"` : `style="min-width: ${width};"`;
      return `<th ${style}>${escapeHtml(h)}</th>`;
    })
    .join('');

  const dataRows = pageRows
    .map((row, idx) => {
      const lineNum = row._rowIndex || (startIdx + idx + 1);
      const cells = `<td style="min-width: 40px; text-align: center; font-weight: 500; color: var(--n500);">${lineNum}</td>` +
        reorderedHeaders
          .map(header => {
            const val = row[header] || '';
            const isFilled = val && val.toString().trim() !== '';
            const isReferrer = header.toLowerCase() === 'referrer';
            if (isReferrer) {
              const { text, matched } = resolveReferrerDisplay(val);
              const style = `style="min-width: 150px; font-weight: 500; background: ${isFilled ? 'var(--brand-50)' : 'var(--n100)'}; color: ${isFilled ? 'var(--brand-700)' : 'var(--n400)'};"`;
              return `<td ${style}>${escapeHtml(String(text))}${matched ? '' : (isFilled ? ' <span style="color: var(--n400); font-size: 11px;">⚠</span>' : '')}</td>`;
            }
            const style = `style="min-width: 120px;"`;
            return `<td ${style}>${escapeHtml(String(val))}</td>`;
          })
          .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  const recordCount = rows.length;
  const showingText = `Rows ${startIdx + 1}–${endIdx} of ${recordCount}`;
  const prevDisabled = pageNum === 1 ? 'disabled' : '';
  const nextDisabled = pageNum === totalPages ? 'disabled' : '';

  return `
    <div class="import-modal-overlay" id="import-modal-overlay">
      <div class="import-modal-dialog" dir="rtl" style="max-width: 98vw; max-height: 90vh;">
        <div class="import-modal-header">
          <h2>Step 1: Data Preview</h2>
          <button class="import-modal-close" id="import-modal-close">✕</button>
        </div>

        <div class="import-modal-info">
          <p>סה"כ שורות: <strong>${recordCount}</strong> | Columns: <strong>${headers.length}</strong> | ${showingText} | Page ${pageNum}/${totalPages}</p>
        </div>

        <div class="import-modal-table-container" style="overflow-x: auto; flex: 1;">
          <table class="import-data-table">
            <thead>
              <tr>${headerRow}</tr>
            </thead>
            <tbody>
              ${dataRows}
            </tbody>
          </table>
        </div>

        <div class="import-modal-footer" style="justify-content: space-between;">
          <div style="display: flex; gap: 8px;">
            <button id="import-modal-prev-page" class="btn-secondary" ${prevDisabled}>← Previous (15)</button>
            <button id="import-modal-next-page" class="btn-secondary" ${nextDisabled}>Next (15) →</button>
          </div>
          <div style="display: flex; gap: 8px;">
            <button id="import-modal-cancel" class="btn-secondary">ביטול</button>
            <button id="import-modal-next-step" class="btn-primary">Next: Match Referrers →</button>
          </div>
        </div>
      </div>
    </div>
  `;
};

const renderMatchingStep = (referrerMatches, rowCount) => {
  const rows = referrerMatches.map((item, idx) => {
    const isExclusive = item.isExclusive;
    const topMatch = item.matches[0];
    const quality = topMatch ? (topMatch.score > 0.85 ? 'high' : topMatch.score > 0.65 ? 'medium' : 'low') : 'none';
    const qualityColor = isExclusive ? '#90CAF9' : (quality === 'high' ? '#4CAF50' : quality === 'medium' ? '#FFC107' : '#F44336');

    let selectHtml;
    if (isExclusive) {
      // Exact name match: resolve to the referrer code, not the display name
      const exclusiveCode = topMatch ? topMatch.code : item.csvReferrer;
      selectHtml = `<div style="flex: 1; padding: 6px; background: #E3F2FD; border: 1px solid #90CAF9; border-radius: var(--radius-lg); color: #1565C0; font-weight: 500;">✓ ${escapeHtml(topMatch ? `${topMatch.name} (${topMatch.code})` : item.csvReferrer)}</div>
                    <input type="hidden" class="referrer-select" data-csv-referrer="${escapeHtml(item.csvReferrer)}" value="${escapeHtml(exclusiveCode)}" />`;
    } else {
      const matchOptions = item.matches
        .slice(0, 5)
        .map((m) => `<option value="${escapeHtml(m.code)}">${escapeHtml(m.name)} (${escapeHtml(m.code)}) - ${(m.score * 100).toFixed(0)}%</option>`)
        .join('');

      selectHtml = item.matches.length > 0
        ? `<select class="referrer-select" data-csv-referrer="${escapeHtml(item.csvReferrer)}" style="flex: 1; padding: 6px; border: 1px solid var(--n300); border-radius: var(--radius-lg); font: inherit;">
             <option value="">-- Select --</option>
             ${matchOptions}
             <option value="__new__">+ Create New</option>
           </select>`
        : `<input type="text" class="new-referrer-input" placeholder="Create new name" data-csv-referrer="${escapeHtml(item.csvReferrer)}" style="flex: 1; padding: 6px; border: 1px solid var(--n300); border-radius: var(--radius-lg); font: inherit;" />`;
    }

    return `
      <tr data-csv-index="${idx}" style="border-left: 4px solid ${qualityColor};">
        <td style="font-weight: 500;">${escapeHtml(item.csvReferrer || '(empty)')}</td>
        <td>${topMatch ? `${escapeHtml(topMatch.name)} (${escapeHtml(topMatch.code)}) ${quality !== 'high' ? '⚠' : '✓'}` : '—'}</td>
        <td>${selectHtml}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="import-modal-overlay" id="import-modal-overlay">
      <div class="import-modal-dialog" dir="rtl">
        <div class="import-modal-header">
          <h2>Step 2: Match Referrers</h2>
          <button class="import-modal-close" id="import-modal-close">✕</button>
        </div>

        <div class="import-modal-info">
          <p>Mapping ${referrerMatches.length} unique referrers from ${rowCount} registrations</p>
        </div>

        <div class="import-modal-table-container">
          <table class="import-data-table" style="margin: 0;">
            <thead>
              <tr>
                <th style="width: 35%;">CSV Referrer</th>
                <th style="width: 25%;">Suggested Match</th>
                <th style="width: 40%;">Resolution</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>

        <div class="import-modal-footer">
          <button id="import-modal-back-step" class="btn-secondary">← Back</button>
          <button id="import-modal-next-step" class="btn-primary">Next: Confirm →</button>
        </div>
      </div>
    </div>
  `;
};

const renderConfirmStep = (registrations, rowCount, referrers) => {
  const recordRows = registrations.slice(0, 200).map((reg, idx) => {
    const hasReferrer = reg.referrer && reg.referrer.trim();
    const referrerStyle = hasReferrer
      ? 'color: var(--brand-700); font-weight: 500;'
      : 'color: var(--n400); font-style: italic;';

    let referrerDisplay = reg.referrer || '(ללא מפנה)';
    if (hasReferrer && referrers) {
      const matched = referrers.get(reg.referrer);
      if (matched) {
        referrerDisplay = `${matched.name} (${reg.referrer})`;
      }
    }

    return `
      <tr>
        <td style="text-align: center; color: var(--n400); font-size: 11px;">${reg._rowIndex || idx + 1}</td>
        <td>${escapeHtml(reg.firstName)} ${escapeHtml(reg.lastName)}</td>
        <td>${escapeHtml(reg.city || '—')}</td>
        <td style="${referrerStyle}">${escapeHtml(referrerDisplay)}</td>
        <td style="text-align:center;">${reg.registered ? '✓' : '—'}</td>
      </tr>
    `;
  }).join('');

  const truncated = registrations.length > 200
    ? `<tr><td colspan="5" style="text-align:center; color:var(--n400); font-style:italic; padding:8px;">... ועוד ${registrations.length - 200} שורות</td></tr>`
    : '';

  return `
    <div class="import-modal-overlay" id="import-modal-overlay">
      <div class="import-modal-dialog" dir="rtl" style="max-width: 820px;">
        <div class="import-modal-header">
          <h2>Step 3: Confirm Import</h2>
          <button class="import-modal-close" id="import-modal-close">✕</button>
        </div>

        <div class="import-modal-info">
          <p>Ready to import <strong>${rowCount}</strong> registrations — בדוק שהמפנים נכונים לפני הייבוא</p>
        </div>

        <div class="import-modal-table-container" style="flex: 1; overflow-y: auto;">
          <table class="import-data-table" style="font-size: 12px; margin: 0;">
            <thead>
              <tr>
                <th style="width: 40px; text-align:center;">#</th>
                <th>שם</th>
                <th>יישוב</th>
                <th style="background: var(--brand-50); color: var(--brand-700);">מפנה</th>
                <th style="width: 50px; text-align:center;">התפקד</th>
              </tr>
            </thead>
            <tbody>
              ${recordRows}
              ${truncated}
            </tbody>
          </table>
        </div>

        <div class="import-modal-footer" style="flex-direction: column; gap: 12px; align-items: stretch;">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--n600); cursor: pointer;">
            <input type="checkbox" id="import-one-by-one" style="cursor: pointer;" />
            One-by-one insert (slower, shows progress)
          </label>
          <div style="display: flex; gap: 8px; justify-content: space-between;">
            <button id="import-modal-back-step" class="btn-secondary">← תקן התאמות</button>
            <div style="display: flex; gap: 8px;">
              <button id="import-modal-dryrun" class="btn-secondary">Dry Run</button>
              <button id="import-modal-execute" class="btn-primary" style="background-color: #2196F3;">Import Now</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
};

const renderDryRunStep = (report, rowCount) => {
  const sampleRows = report.sample.map(reg => `
    <tr>
      <td>${escapeHtml(reg.firstName)} ${escapeHtml(reg.lastName)}</td>
      <td>${escapeHtml(reg.phone || '—')}</td>
      <td style="direction:ltr; text-align:right;">${escapeHtml(reg.email || '—')}</td>
      <td>${escapeHtml(reg.idNumber || '—')}</td>
      <td>${escapeHtml(reg.city || '—')}</td>
      <td>${escapeHtml(reg.referrer || '—')}</td>
      <td>${reg.registered ? '✓' : '—'}</td>
    </tr>
  `).join('');

  return `
    <div class="import-modal-overlay" id="import-modal-overlay">
      <div class="import-modal-dialog" dir="rtl">
        <div class="import-modal-header">
          <h2>Dry Run Results</h2>
          <button class="import-modal-close" id="import-modal-close">✕</button>
        </div>

        <div class="import-modal-info" style="background: #FFF8E1; border-color: #FFB300;">
          <p>🔍 Dry run only — <strong>nothing was written</strong>. ${report.count} registrations would be imported.</p>
        </div>

        <div style="padding: 0 24px; max-height: 300px; overflow-y: auto;">
          <h4 style="margin: 12px 0 8px; font-size: 13px;">Sample (first 5 rows)</h4>
          <table class="import-data-table" style="font-size: 12px;">
            <thead>
              <tr><th>שם</th><th>טלפון</th><th>אימייל</th><th>ת.ז.</th><th>יישוב</th><th>מפנה</th><th>התפקד</th></tr>
            </thead>
            <tbody>${sampleRows}</tbody>
          </table>
        </div>

        <div class="import-modal-footer">
          <button id="import-modal-back-step" class="btn-secondary">← Back to Confirm</button>
          <button id="import-modal-execute" class="btn-primary" style="background-color: #2196F3;">Import Now</button>
        </div>
      </div>
    </div>
  `;
};

const renderProgressStep = (done, total, batchId) => {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const finished = done >= total;

  return `
    <div class="import-modal-overlay" id="import-modal-overlay">
      <div class="import-modal-dialog" dir="rtl" style="max-width: 480px;">
        <div class="import-modal-header">
          <h2>${finished ? 'Import Complete' : 'Importing...'}</h2>
          ${finished ? `<button class="import-modal-close" id="import-modal-close">✕</button>` : ''}
        </div>

        <div style="padding: 32px 24px; display: flex; flex-direction: column; gap: 16px; align-items: center;">
          <div style="width: 100%; background: var(--n200); border-radius: 999px; height: 12px; overflow: hidden;">
            <div style="width: ${pct}%; background: #2196F3; height: 100%; border-radius: 999px; transition: width 0.2s;"></div>
          </div>
          <p style="margin: 0; font-size: 14px; color: var(--n600);">${done} / ${total} rows (${pct}%)</p>
          ${finished ? `<p style="color: #388E3C; font-weight: 600; margin: 0;">✓ Done — batch ID: <code style="font-size: 11px;">${escapeHtml(batchId)}</code></p>` : ''}
        </div>

        ${finished ? `
        <div class="import-modal-footer">
          <button id="import-modal-close" class="btn-primary">Close</button>
        </div>` : ''}
      </div>
    </div>
  `;
};
