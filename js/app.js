const PORTRAITS_DIR = "portraits/";
const CYCLE_MIN_MS = 2000;
const CYCLE_MAX_MS = 3000;
const CYCLE_JITTER_MS = 2000; // max random start delay

const timers = {};
const popup = document.getElementById("popup");
let closeTimer = null;

let selectMode = false;
let selectedIds = new Set();
let allPeople = [];

// ── Bootstrap ────────────────────────────────────────────────────
fetch("candidates.json")
  .then((r) => r.json())
  .then(shuffle)
  .then((people) => {
    allPeople = people;
    buildGrid(people);
    restoreFromCookies();
  });

// Fisher-Yates shuffle
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Grid ─────────────────────────────────────────────────────────
function buildGrid(people) {
  const grid = document.getElementById("grid");

  people.forEach((person, i) => {
    const card = createCard(person, i);
    grid.appendChild(card);
    // Staggered CSS entrance animation via custom property
    card.style.setProperty("--i", i);
    // Start photo cycling after a random initial delay
    setTimeout(() => startCycle(i, card), Math.random() * CYCLE_JITTER_MS);
  });

  // "Add person" placeholder
}

function createCard(person, i) {
  const card = document.createElement("div");
  card.className = "card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute(
    "aria-label",
    `${person.name}${person.minister ? ", " + person.minister : ""}`,
  );
  card.dataset.personId = person.id;

  // Photo stage
  const stage = document.createElement("div");
  stage.className = "photo-stage";

  person.photos.forEach((filename, pi) => {
    const img = document.createElement("img");
    img.src = PORTRAITS_DIR + filename;
    img.alt = person.name;
    img.draggable = false;
    if (pi === 0) img.classList.add("active");
    stage.appendChild(img);
  });

  // Name badge overlaid on photo, matching popup style
  const badge = document.createElement("span");
  badge.className = "popup-name-badge";
  badge.textContent = person.name;
  stage.appendChild(badge);

  card.append(stage);

  // Events — hover on desktop, click-to-toggle on touch; all blocked in select mode
  const isTouch = () => window.matchMedia("(hover: none)").matches;

  card.addEventListener("mouseenter", () => {
    if (selectMode) return;
    if (!isTouch()) openPopup(person, card);
  });
  card.addEventListener("mouseleave", (e) => {
    if (selectMode) return;
    if (!isTouch() && !e.relatedTarget?.closest("#popup")) scheduleClose();
  });
  card.addEventListener("click", () => {
    if (selectMode) return;
    if (isTouch()) {
      if (
        popup.classList.contains("open") &&
        popup.dataset.personId === person.id
      ) {
        closePopup();
      } else {
        openPopup(person, card);
      }
    } else {
      openPopup(person, card);
    }
  });
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") openPopup(person, card);
  });

  return card;
}

// ── Photo cycling ─────────────────────────────────────────────────
function startCycle(idx, card) {
  if (timers[idx]) return;
  const imgs = card.querySelectorAll(".photo-stage img");
  let current = 0;

  function step() {
    imgs[current].classList.remove("active");
    current = (current + 1) % imgs.length;
    imgs[current].classList.add("active");
    timers[idx] = setTimeout(
      step,
      CYCLE_MIN_MS + Math.random() * (CYCLE_MAX_MS - CYCLE_MIN_MS),
    );
  }

  timers[idx] = setTimeout(
    step,
    CYCLE_MIN_MS + Math.random() * (CYCLE_MAX_MS - CYCLE_MIN_MS),
  );
}

// ── Popup ─────────────────────────────────────────────────────────
popup.addEventListener("mouseenter", () => clearTimeout(closeTimer));
popup.addEventListener("mouseleave", scheduleClose);
document.getElementById("popupClose").addEventListener("click", closePopup);

function set(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt ?? "";
}
function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}
function rowShow(id, show) {
  const el = document.getElementById(id);
  if (el) el.style.display = show ? "" : "none";
}

function openPopup(person, card) {
  document.body.classList.add("no-scroll");
  document.getElementsByTagName("html")[0].classList.add("no-scroll");
  clearTimeout(closeTimer);
  justOpened = true;

  // Photo
  const photos = person.photos || [];
  document.getElementById("popupImg").src = photos.length
    ? PORTRAITS_DIR + photos[0]
    : "";
  document.getElementById("popupImg").alt = person.name;

  // Name badge on photo (name only)
  set("popupNameBadge", person.name);

  // 2-col rows
  set("piName", person.name);
  set("piAge", person.age);
  set("piHome", person.home);
  rowShow("piRowActivities", !!person.activities);
  set("piActivities", person.activities);

  // Full-width rows
  rowShow("piRowRationale", !!person.rationale);
  set("piRationale", person.rationale);
  rowShow("piRowRecommendation", !!person.recommendation);
  set("piRecommendation", person.recommendation);
  rowShow("piRowMinister", !!person.minister);
  set("piMinister", person.minister);

  // Links
  const links = person.links || {};
  const hasLinks = Object.keys(links).length > 0;
  rowShow("piRowLinks", hasLinks);
  if (hasLinks) {
    setHTML(
      "piLinks",
      Object.entries(links)
        .map(
          ([platform, url]) =>
            `<a href="${url}" target="_blank" rel="noreferrer" class="pi-social-link" title="${platform}">
            <img src="${platform}.svg" alt="${platform} icon" class="social-icon-img" />
          </a>`,
        )
        .join(""),
    );
  }

  popup.classList.add("open");
  popup.dataset.personId = person.id;
  // requestAnimationFrame(() => positionPopup(card)); // Don't position the popup for now, as it is fullscreen on mobile.
}

function positionPopup(card) {
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
  let top, left;
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
}

function scheduleClose() {
  closeTimer = setTimeout(closePopup, 120);
}

function closePopup() {
  document.body.classList.remove("no-scroll");
  document.getElementsByTagName("html")[0].classList.remove("no-scroll");
  popup.classList.remove("open");
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePopup();
});

// Prevent the same click/tap that opens the popup from immediately closing it
let justOpened = false;
document.addEventListener("click", (e) => {
  if (justOpened) {
    justOpened = false;
    return;
  }
  if (!e.target.closest(".card") && !e.target.closest("#popup")) closePopup();
});

// ══════════════════════════════════════════════════════════
// SELECT MODE
// ══════════════════════════════════════════════════════════

const COOKIE_CONSENT_KEY = "hagush_cookie_ok";
const COOKIE_CHOICES_KEY = "hagush_choices";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function setCookie(name, value, maxAge) {
  document.cookie = `${name}=${encodeURIComponent(value)};max-age=${maxAge};path=/;SameSite=Lax`;
}
function getCookie(name) {
  const m = document.cookie.match("(?:^|; )" + name + "=([^;]*)");
  return m ? decodeURIComponent(m[1]) : null;
}

// Copy text to clipboard — works on mobile Safari via execCommand fallback
function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  // execCommand fallback for Safari / non-HTTPS
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText =
    "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand("copy");
  } catch (e) {}
  document.body.removeChild(ta);
  return Promise.resolve();
}

function restoreFromCookies() {
  if (getCookie(COOKIE_CONSENT_KEY) !== "1") return;
  const saved = getCookie(COOKIE_CHOICES_KEY);
  if (saved) {
    try {
      JSON.parse(saved).forEach((id) => selectedIds.add(id));
    } catch (e) {}
  }
  enterSelectMode();
}

const btnSelect = document.getElementById("btnSelect");
const btnShowChoices = document.getElementById("btnShowChoices");
const btnReset = document.getElementById("btnReset");
const cookieOverlay = document.getElementById("cookieOverlay");
const cookieYes = document.getElementById("cookieYes");
const cookieNo = document.getElementById("cookieNo");
const choicesOverlay = document.getElementById("choicesOverlay");
const choicesClose = document.getElementById("choicesClose");
const choicesCopy = document.getElementById("choicesCopy");

btnSelect.addEventListener("click", () => {
  if (selectMode) {
    exitSelectMode();
  } else if (getCookie(COOKIE_CONSENT_KEY) === "1") {
    enterSelectMode();
  } else {
    cookieOverlay.style.display = "flex";
  }
});

cookieYes.addEventListener("click", () => {
  setCookie(COOKIE_CONSENT_KEY, "1", COOKIE_MAX_AGE);
  cookieOverlay.style.display = "none";
  enterSelectMode();
});
cookieNo.addEventListener("click", () => {
  cookieOverlay.style.display = "none";
});
cookieOverlay.addEventListener("click", (e) => {
  if (e.target === cookieOverlay) cookieOverlay.style.display = "none";
});

btnShowChoices.addEventListener("click", openChoicesModal);
btnReset.addEventListener("click", resetChoices);
choicesClose.addEventListener("click", () => {
  choicesOverlay.style.display = "none";
});
choicesOverlay.addEventListener("click", (e) => {
  if (e.target === choicesOverlay) choicesOverlay.style.display = "none";
});

choicesCopy.addEventListener("click", () => {
  const names = [...selectedIds]
    .map((id) => {
      const p = allPeople.find((p) => p.id === id);
      return p ? p.name : null;
    })
    .filter(Boolean)
    .join("\n");
  copyToClipboard(names).then(() => {
    const copied = document.getElementById("choicesCopied");
    copied.style.display = "block";
    setTimeout(() => {
      copied.style.display = "none";
    }, 2000);
  });
});

function enterSelectMode() {
  selectMode = true;
  closePopup();
  btnSelect.textContent = "✕ יציאה מבחירה";
  btnSelect.classList.add("active");
  btnShowChoices.style.display = "";
  btnReset.style.display = "";

  document.querySelectorAll(".card[data-person-id]").forEach((card) => {
    if (card.querySelector(".card-select-btn")) return;
    const id = card.dataset.personId;
    const btn = document.createElement("button");
    btn.className =
      "card-select-btn" + (selectedIds.has(id) ? " selected" : "");
    btn.type = "button";
    btn.setAttribute("aria-label", "בחר מועמד");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSelection(id, btn);
    });
    card.appendChild(btn); // on .card, not .photo-stage, to avoid overflow:hidden clipping
  });
}

function exitSelectMode() {
  selectMode = false;
  btnSelect.textContent = "☑ בחרו מועמדים";
  btnSelect.classList.remove("active");
  btnShowChoices.style.display = "none";
  btnReset.style.display = "none";
  document.querySelectorAll(".card-select-btn").forEach((b) => b.remove());
}

function toggleSelection(id, btn) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
    btn.classList.remove("selected");
  } else {
    selectedIds.add(id);
    btn.classList.add("selected");
  }
  setCookie(
    COOKIE_CHOICES_KEY,
    JSON.stringify([...selectedIds]),
    COOKIE_MAX_AGE,
  );
}

function openChoicesModal() {
  const list = document.getElementById("choicesList");
  const empty = document.getElementById("choicesEmpty");
  const copy = document.getElementById("choicesCopy");
  list.innerHTML = "";
  if (selectedIds.size === 0) {
    empty.style.display = "";
    list.style.display = "none";
    copy.style.display = "none";
  } else {
    empty.style.display = "none";
    copy.style.display = "";
    list.style.display = "";
    [...selectedIds].forEach((id) => {
      const person = allPeople.find((p) => p.id === id);
      if (!person) return;
      const li = document.createElement("li");
      li.textContent = person.name;
      list.appendChild(li);
    });
  }
  document.getElementById("choicesCopied").style.display = "none";
  choicesOverlay.style.display = "flex";
}

function resetChoices() {
  // Clear in-memory selections
  selectedIds.clear();

  // Delete both cookies (max-age=0 expires them immediately)
  setCookie(COOKIE_CONSENT_KEY, "", 0);
  setCookie(COOKIE_CHOICES_KEY, "", 0);

  // Exit select mode and return to initial state
  exitSelectMode();
}

async function submitGForm(e) {
  e.preventDefault();

  const name = document.getElementById("gf-name").value.trim();
  const email = document.getElementById("gf-email").value.trim();
  const phone = document.getElementById("gf-phone").value.trim();
  const updates = document.getElementById("gf-updates").checked;
  const btn = document.getElementById("gf-submit");
  const status = document.getElementById("gf-status");

  // Basic validation
  if (!name || !email || !phone) {
    showStatus("אנא מלאו את כל השדות הדרושים", "error");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showStatus("כתובת המייל אינה תקינה", "error");
    return;
  }

  btn.disabled = true;
  btn.textContent = "שולח...";

  // Build form data matching Google Form field IDs
  const data = new FormData();
  data.append("entry.1687380056", name);
  data.append("entry.1723229259", email);
  data.append("entry.1567947338", phone);
  if (updates) {
    data.append("entry.1129380525", "אשמח לקבל עדכוני ארועים באימייל");
  }
  // Required hidden fields
  data.append("fvv", "1");
  data.append("fbzx", "-2495624912955297433");

  const FORM_URL =
    "https://docs.google.com/forms/u/0/d/e/1FAIpQLScFGx_UOdl6izc_UiE4b4hix-r1CYPfdMHH-b4uXYRw2NiHFA/formResponse";

  try {
    // no-cors: request fires, Google receives it, but browser blocks the response
    // This is expected — we just assume success if no network error
    await fetch(FORM_URL, {
      method: "POST",
      mode: "no-cors",
      body: data,
    });
    // Clear fields
    document.getElementById("gf-name").value = "";
    document.getElementById("gf-email").value = "";
    document.getElementById("gf-phone").value = "";
    document.getElementById("gf-updates").checked = true;
    showStatus("תודה! ההרשמה התקבלה בהצלחה 🎉", "success");
  } catch (err) {
    showStatus("שגיאה בשליחה — אנא נסו שוב", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "להצטרפות";
  }
}

function showStatus(msg, type) {
  const el = document.getElementById("gf-status");
  el.textContent = msg;
  el.className = "gf-status gf-status--" + type;
  el.style.display = "block";
  if (type === "success") {
    setTimeout(() => {
      el.style.display = "none";
    }, 6000);
  }
}
