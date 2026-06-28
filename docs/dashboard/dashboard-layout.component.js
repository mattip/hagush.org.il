// Dashboard main layout — header, controls, and content areas.

export const dashboardLayout = () => `
  <div id="dash" class="wrap hidden" style="padding-top:0">
    <div class="band">
      <div class="band-row">
        <div>
          <p class="eyebrow">עכשיו באות! · ניהול</p>
          <div class="title-line">
            <h1 class="page-title" id="dash-title">לוח ניהול</h1>
            <span class="role-badge" id="role-badge">—</span>
          </div>
        </div>
        <div class="controls">
          <a href="referrers/index.html" class="btn">ניהול מפנים</a>
          <button id="refresh-btn" class="btn">רענן נתונים</button>
          <span class="muted" id="updated">—</span>
          <span class="email" id="user-email"></span>
          <button id="logout-btn" class="btn">יציאה</button>
        </div>
      </div>
    </div>

    <div id="loading" class="empty"><span class="spinner"></span> טוען נתונים…</div>

    <div id="content" class="hidden">
      <!-- KPI row -->
      <div class="grid4" id="kpi-row" style="margin-top:50px"></div>
      <!-- Collapsible sections -->
      <div id="sections" style="margin-top:24px"></div>
    </div>
  </div>
`;
