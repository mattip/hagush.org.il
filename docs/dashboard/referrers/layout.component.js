// Referrer management page layout — header, controls, and content areas.

export const referrersLayout = () => `
  <div id="dash" class="wrap hidden" style="padding-top:0">
    <div class="band">
      <div class="band-row">
        <div>
          <p class="eyebrow"><a href="../index.html" class="back-link">← לוח ניהול</a></p>
          <div class="title-line">
            <h1 class="page-title" id="dash-title">ניהול מפנים</h1>
            <span class="role-badge" id="role-badge">—</span>
          </div>
        </div>
        <div class="controls">
          <button id="refresh-btn" class="btn">רענן נתונים</button>
          <span class="muted" id="updated">—</span>
          <span class="email" id="user-email"></span>
          <button id="logout-btn" class="btn">יציאה</button>
        </div>
      </div>
    </div>

    <div id="loading" class="empty"><span class="spinner"></span> טוען נתונים…</div>

    <div id="content" class="hidden">
      <div id="referrers-root" style="margin-top:24px"></div>
    </div>
  </div>
`;
