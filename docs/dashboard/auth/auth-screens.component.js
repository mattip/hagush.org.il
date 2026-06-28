// Auth screen components — login and access denied.

export const loginScreen = () => `
  <div id="login" class="login">
    <div class="login-card">
      <h1>דשבורד עכשיו באות!</h1>
      <p class="sub">כניסת מנהלים</p>
      <button id="login-btn" class="login-btn">כניסה עם Google</button>
      <p id="login-err" class="login-err"></p>
    </div>
  </div>
`;

export const noAccessScreen = () => `
  <div id="noaccess" class="login hidden">
    <div class="login-card">
      <h1>אין הרשאה</h1>
      <p class="sub">החשבון <span id="na-email"></span> אינו מורשה לצפות בלוח. פנו למנהל המערכת.</p>
      <button id="na-logout" class="login-btn">התנתקות</button>
    </div>
  </div>
`;
