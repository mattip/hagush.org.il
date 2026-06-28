// Initialize dashboard page with HTML components.
// This can replace the static index.html if needed.

import { loginScreen, noAccessScreen } from "./auth-screens.component.js";
import { dashboardLayout } from "./dashboard-layout.component.js";

export const initDashboardPage = () => {
  document.body.innerHTML = `
    ${loginScreen()}
    ${noAccessScreen()}
    ${dashboardLayout()}
  `;

  // Dynamically add script tag to boot the dashboard
  const script = document.createElement("script");
  script.type = "module";
  script.src = "dashboard-app.js";
  document.body.appendChild(script);
};
