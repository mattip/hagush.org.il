// DOM element references for the referrers page.

import { getById } from "../../js/utils/dom.js";

export const REFERRER_PAGE = {
  loginBtn:      getById("login-btn"),
  logoutBtn:     getById("logout-btn"),
  naLogout:      getById("na-logout"),
  loginScreen:   getById("login"),
  naScreen:      getById("noaccess"),
  dashScreen:    getById("dash"),
  loadingEl:     getById("loading"),
  contentEl:     getById("content"),
  naEmail:       getById("na-email"),
  roleBadge:     getById("role-badge"),
  userEmail:     getById("user-email"),
  refreshBtn:    getById("refresh-btn"),
  updatedEl:     getById("updated"),
  loginErr:      getById("login-err"),
  referrersRoot: getById("referrers-root"),
};
