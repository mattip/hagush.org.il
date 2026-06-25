// Page/device/channel context detection

import { getUserAgent, getUrlParams, getPathname, getReferrer } from "../browser.js";

/**
 * Get current page path.
 * @returns {string} Path (e.g., "/", "/candidates", "/ask_nava_r.html")
 */
export const getPageName = () => getPathname().replace(/index\.html$/, "") || "/";

/**
 * Detect device class from user agent.
 * @returns {string} "Mobile" or "Desktop"
 */
export const getDeviceClass = () => {
  const ua = getUserAgent();
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? "Mobile" : "Desktop";
};

/**
 * Check if user agent is a bot/crawler.
 * @returns {boolean}
 */
export const isBot = () => {
  const ua = getUserAgent();
  return /bot|crawl|spider|slurp|headless|preview|facebookexternalhit/i.test(ua);
};

/**
 * Get traffic channel (utm_source or referrer hostname).
 * @returns {string} utm_source, referrer hostname, or "direct" (max 200 chars)
 */
export const getChannel = () => {
  const params = getUrlParams();
  const utm = params.get("utm_source");
  if (utm) return utm.slice(0, 200);

  try {
    const ref = getReferrer();
    return ref ? new URL(ref).hostname.slice(0, 200) : "direct";
  } catch (e) {
    return "direct";
  }
};
