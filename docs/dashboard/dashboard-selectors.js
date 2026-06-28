// Dashboard selector constants and query helpers.
// Centralizes all selectors to reduce magic strings and enable easier DOM refactoring.

export const SEL = {
  // IDs
  dashboard: {
    // Auth screens
    login: "#login",
    noaccess: "#noaccess",
    dash: "#dash",
    loginBtn: "#login-btn",
    loginErr: "#login-err",
    naEmail: "#na-email",
    naLogout: "#na-logout",
    logoutBtn: "#logout-btn",
    roleBadge: "#role-badge",
    userEmail: "#user-email",
    // Dashboard content
    dashTitle: "#dash-title",
    refreshBtn: "#refresh-btn",
    kpiRow: "#kpi-row",
    sections: "#sections",
    loading: "#loading",
    content: "#content",
    updated: "#updated",
  },

  referrers: {
    root: "#referrers-root",
    search: "#referrers-search",
    addGroupBtn: "#add-group-btn",
    groupDatalist: "#referrer-groups",
  },

  seed: {
    form: "#seed-form",
    input: "#seed-input",
    previewBtn: "#seed-preview-btn",
    status: "#seed-status",
    preview: "#seed-preview",
    previewCount: "#seed-preview-count",
    previewTotal: "#seed-preview-total",
    previewTable: "#seed-preview-table",
    selectAll: "#seed-select-all",
    importBtn: "#seed-import-btn",
    cancelPreviewBtn: "#seed-cancel-preview-btn",
  },

  // Data attributes and class selectors for dynamic content
  resolveBtn: '[data-action="resolve"]',
  resolveForm: '[data-action="resolve-form"]',
  resolveCancel: '[data-action="resolve-cancel"]',
  resolveRow: '[data-action="resolve-row"]',
  editGroupBtn: '[data-action="edit-group"]',
  referrerRow: '[data-ref-code]',
  groupRow: '[data-group-id]',

  // Specific data attribute getters
  getResolveBtn: (code) => `[data-action="resolve"][data-code="${code}"]`,
  getEditGroupBtn: (groupId) => `[data-action="edit-group"][data-group-id="${groupId}"]`,
  getResolveRow: (code) => `[data-action="resolve-row"][data-code="${code}"]`,
  getEditGroupRow: (groupId) => `[data-action="resolve-row"][data-group-id="${groupId}"]`,
  getReferrerRow: (code) => `[data-ref-code="${code}"]`,
  getGroupRow: (groupId) => `[data-group-id="${groupId}"]`,
};

// Query helpers
export const queryId = (selector) => document.getElementById(selector);
export const query = (selector) => document.querySelector(selector);
export const queryAll = (selector) => document.querySelectorAll(selector);

export const queryElement = (parent, selector) =>
  parent?.querySelector(selector);

export const queryElements = (parent, selector) =>
  parent?.querySelectorAll(selector);
