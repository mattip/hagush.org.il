// Initialize referrers page with HTML components.
// This can replace the static referrers/index.html if needed.

import { loginScreen, noAccessScreen } from "../auth-screens.component.js";
import { referrersLayout } from "./layout.component.js";

export const initReferrersPage = () => {
  document.body.innerHTML = `
    ${loginScreen()}
    ${noAccessScreen()}
    ${referrersLayout()}
  `;

  // Dynamically add script tag to boot the referrers page
  const script = document.createElement("script");
  script.type = "module";
  script.src = "referrers/page.js";
  document.body.appendChild(script);
};
