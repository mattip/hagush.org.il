// Popup positioning and visibility utilities

/**
 * Lock body scroll and hide scrollbar (for modals).
 * @param {HTMLElement} popup - The popup element
 */
const lockBodyScroll = (_popup) => {
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.paddingRight = `${scrollbarWidth}px`;
  document.body.style.top = `-${window.scrollY}px`;
  document.body.classList.add("no-scroll");
  document.getElementsByTagName("html")[0].classList.add("no-scroll");
};

/**
 * Unlock body scroll and restore scrollbar.
 */
const unlockBodyScroll = () => {
  const scrollY = parseInt(document.body.style.top || "0") * -1;
  document.body.style.top = "";
  document.body.style.paddingRight = "";
  document.body.classList.remove("no-scroll");
  document.getElementsByTagName("html")[0].classList.remove("no-scroll");
  window.scrollTo(0, scrollY);
};

/**
 * Position popup relative to card (arrow positioning for desktop).
 * Falls back to fullscreen on mobile.
 *
 * IMPORTANT: popup must be rendered (not display:none) before calling this —
 * offsetWidth/offsetHeight will be 0 otherwise and positioning will be wrong.
 * Use visibility:hidden + opacity:0 to hide the popup before it is positioned,
 * then reveal it after this function returns.
 *
 * @param {HTMLElement} popup - Popup element
 * @param {HTMLElement} card - Card to position relative to
 */
const positionPopup = (popup, card) => {
  const GAP = 12;
  const cr = card.getBoundingClientRect();
  const pw = popup.offsetWidth;
  const ph = popup.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  popup.classList.remove(
    "arrow-top",
    "arrow-bottom",
    "arrow-left",
    "arrow-right",
  );

  let top;
  let left;

  if (cr.right + GAP + pw <= vw - 8) {
    // right
    left = cr.right + GAP;
    top = cr.top + (cr.height - ph) / 2;
    popup.classList.add("arrow-left");
  } else if (cr.left - GAP - pw >= 8) {
    // left
    left = cr.left - GAP - pw;
    top = cr.top + (cr.height - ph) / 2;
    popup.classList.add("arrow-right");
  } else if (cr.bottom + GAP + ph <= vh - 8) {
    // below
    top = cr.bottom + GAP;
    left = cr.left + (cr.width - pw) / 2;
    popup.classList.add("arrow-top");
  } else {
    // above
    top = cr.top - GAP - ph;
    left = cr.left + (cr.width - pw) / 2;
    popup.classList.add("arrow-bottom");
  }

  popup.style.top = Math.max(8, Math.min(top, vh - ph - 8)) + "px";
  popup.style.left = Math.max(8, Math.min(left, vw - pw - 8)) + "px";
};

export { lockBodyScroll, unlockBodyScroll, positionPopup };
