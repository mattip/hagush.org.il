// Page/device/channel context detection

import { getUserAgent, getUrlParams, getPathname, getReferrer } from "./browser.js";

/**
 * Get current page path.
 * @returns {string} Path (e.g., "/", "/candidates", "/ask_nava_r.html")
 */
const getPageName = () => getPathname().replace(/index\.html$/, "") || "/";

/**
 * Detect device class from user agent.
 * @returns {string} "Mobile" or "Desktop"
 */
const getDeviceClass = () => {
  const ua = getUserAgent();
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? "Mobile" : "Desktop";
};

/**
 * Check if user agent is a bot/crawler.
 * @returns {boolean}
 */
const isBot = () => {
  const ua = getUserAgent();
  return /bot|crawl|spider|slurp|headless|preview|facebookexternalhit/i.test(ua);
};

/**
 * Get traffic medium (QR code vs web).
 * @returns {string} "qr" or "web"
 */
const getMedium = () => {
  const params = getUrlParams();
  const medium = (params.get("m") || params.get("utm_medium") || "").toLowerCase();
  return medium === "qr" ? "qr" : "web";
};

/**
 * Get traffic channel (utm_source or referrer hostname).
 * @returns {string} utm_source, referrer hostname, or "direct" (max 200 chars)
 */
const getChannel = () => {
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

export { getPageName, getDeviceClass, isBot, getMedium, getChannel };
