import { HagushTracker } from "./tracker.js";
import { shuffleWithPinning } from "./utils/shuffle.js";
import { copyToClipboard } from "./utils/clipboard.js";
import { setCookie, getCookie } from "./utils/cookie.js";
import { setText, setHtml, rowShow, isTouch } from "./utils/element.js";
import { startCycle } from "./utils/photo-cycle.js";
import { linkRecommendation } from "./utils/html-escape.js";
import { lockBodyScroll, unlockBodyScroll } from "./utils/popup.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PORTRAITS_DIR = "portraits/";
const CYCLE_MIN_MS = 1000;
const CYCLE_MAX_MS = 2000;
const CYCLE_JITTER_MS = 1000;
const PINNED_IDS = ["gilad_k", "efrat_r", "naama_l"];
const PINNED_WINDOW = 6;
const PROMO_SLOT = 11;

const EVENT_URL = "https://script.google.com/macros/s/AKfycbyPXkZWptHieBiqSfaCJGwgVQTJKZreRJONKmGyDtKZ5z3iio56rtjaE3G_TdXgYWRW/exec";
const EVENT_TOKEN = "NachshavBaot2026";

const COOKIE_CONSENT_KEY = "hagush_cookie_ok";
const COOKIE_CHOICES_KEY = "hagush_choices";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

const timers = {};
const popup = document.getElementById("popup");
// document.currentScript is null in ES modules — read the attribute via selector instead.
const POPUPS_ENABLED =
  document.querySelector('script[src*="app.js"]')?.dataset.popups !== "false";

let closeTimer = null;
let selectMode = false;
const selectedIds = new Set();
let allPeople = [];
let popupHistory = [];
let justOpened = false;

const eventDedup = {}; // track recent events to prevent double-fires

// ── Interview badge: has the interview date+time passed? ─────────
function isInterviewPast(person) {
  if (!person.interview_day || !person.interview_time) return false;
  // interview_day format: "שני, 22.6" → extract DD.M
  const dayMatch = person.interview_day.match(/(\d{1,2})\.(\d{1,2})/);
  if (!dayMatch) return false;
  const day = parseInt(dayMatch[1], 10);
  const month = parseInt(dayMatch[2], 10) - 1; // JS months are 0-based
  const [hh, mm] = person.interview_time.split(":").map(Number);
  const year = new Date().getFullYear();
  const interviewDate = new Date(year, month, day, hh, mm);
  return Date.now() > interviewDate.getTime();
}

// ── Tooltip: show "עוד מידע" hint until user clicks a card ──────
const hasClickedCard = false; // eslint-disable-line no-unused-vars

// ─────────────────────────────────────────────────────────────────────────────
// Candidate open event tracking
// ─────────────────────────────────────────────────────────────────────────────

const logCandidateOpen = (person, via) => {
  if (!person?.id) return;
  const key = person.id + "|" + (via || "card");
  const now = Date.now();
  if (eventDedup[key] && now - eventDedup[key] < 1000) return;
  eventDedup[key] = now;

  try {
    const ids = HagushTracker.getIds();
    fetch(EVENT_URL, {
      method: "POST",
      mode: "no-cors",
      keepalive: true,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        _token: EVENT_TOKEN,
        formType: "event",
        event: "candidate_open",
        candidateId: person.id,
        candidateName: person.name || "",
        via: via || "card",
        ts: new Date().toISOString(),
        sessionId: ids.sessionId,
        dailyId: ids.dailyId,
      }),
    });
  } catch (e) {
    /* analytics must never break the popup */
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Grid building
// ─────────────────────────────────────────────────────────────────────────────

const createCardPhoto = (person, firstPhoto) => {
  const stage = document.createElement("div");
  stage.className = "photo-stage";

  person.photos.forEach((filename, pi) => {
    const img = document.createElement("img");
    img.src = PORTRAITS_DIR + filename;
    img.alt = person.name;
    img.draggable = false;
    img.loading = "lazy";
    if (pi === firstPhoto) img.classList.add("active");
    stage.appendChild(img);
  });

  const badge = document.createElement("span");
  badge.className = "popup-name-badge";
  badge.textContent = person.name;
  stage.appendChild(badge);

  // Interview badge — round "שואלות" icon for candidates whose interview has passed
  if (isInterviewPast(person)) {
    const iBadge = document.createElement("div");
    iBadge.className = "interview-badge";
    iBadge.title = "עכשיו שואלות!";
    stage.appendChild(iBadge);
  }

  return stage;
};

const createCardElement = (person) => {
  const card = document.createElement("div");
  card.className = "card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute(
    "aria-label",
    `${person.name}${person.minister ? ", " + person.minister : ""}`,
  );
  card.dataset.personId = person.id;
  return card;
};

const attachCardListeners = (card, person) => {
  card.addEventListener("click", () => {
    if (selectMode) return;
    if (!POPUPS_ENABLED) return;
    if (isTouch()) {
      const isOpen = popup.classList.contains("open");
      const isSamePerson = popup.dataset.personId === person.id;
      if (isOpen && isSamePerson) {
        closePopup();
      } else {
        openPopup(person, card);
      }
    } else {
      openPopup(person, card);
    }
  });

  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      openPopup(person, card, true, "keyboard");
    }
  });
};

const createCard = (person) => {
  const firstPhoto = Math.floor(Math.random() * person.photos.length);
  const card = createCardElement(person);
  const photoStage = createCardPhoto(person, firstPhoto);

  card.appendChild(photoStage);
  attachCardListeners(card, person);

  return { card, firstPhoto };
};

const createPromoCard = () => {
  const card = document.createElement("div");
  card.className = "card promo-card";

  const imgSection = document.createElement("div");
  imgSection.className = "promo-card-image";

  const badge = document.createElement("img");
  badge.src = "images/badge_ask.png";
  badge.alt = "עכשיו שואלות!";
  badge.loading = "lazy";
  imgSection.append(badge);

  const textSection = document.createElement("div");
  textSection.className = "text";

  const title = document.createElement("h3");
  title.textContent = "עכשיו שואלות!";

  const body = document.createElement("p");
  body.className = "muted";
  body.textContent = "זה הזמן ללמוד על המועמדים.ות, להכיר אותם ולשאול אותם.ן את השאלות הקשות!";

  const linkPara = document.createElement("p");
  const link = document.createElement("a");
  link.href = "https://chat.whatsapp.com/KYjojL9gh7g5fTQxEzB1HA";
  link.className = "link";
  link.textContent = 'הצטרפו לקבוצת הוואטסאפ "עכשיו שואלות"';
  linkPara.append(link);

  textSection.append(title, body, linkPara);
  card.append(imgSection, textSection);
  return card;
};

const buildGrid = (people) => {
  const grid = document.getElementById("grid");
  let visualIdx = 0;

  people.forEach((person, i) => {
    if (i === PROMO_SLOT) {
      const promoCard = createPromoCard();
      promoCard.style.setProperty("--i", visualIdx++);
      grid.appendChild(promoCard);
    }
    const { card, firstPhoto } = createCard(person);
    card.style.setProperty("--i", visualIdx++);
    grid.appendChild(card);
    setTimeout(
      () => startCycle(i, card, firstPhoto, timers, CYCLE_MIN_MS, CYCLE_MAX_MS),
      Math.random() * CYCLE_JITTER_MS,
    );
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Popup management
// ─────────────────────────────────────────────────────────────────────────────

const openPopup = (person, card, pushHistory = true, via = "card") => {
  const photos = person.photos || [];
  if (!photos.length) return;

  logCandidateOpen(person, via);
  lockBodyScroll(popup);
  document.querySelector(".popup-info").scrollTop = 0;
  clearTimeout(closeTimer);
  justOpened = true;

  if (pushHistory && popup.classList.contains("open")) {
    const prevId = popup.dataset.personId;
    const prevPerson = allPeople.find((p) => p.id === prevId);
    const prevCard = document.querySelector(
      `.card[data-person-id="${prevId}"]`,
    );
    if (prevPerson) popupHistory.push({ person: prevPerson, card: prevCard });
  }

  document.getElementById("popupBack").style.display =
    popupHistory.length > 0 ? "" : "none";

  setText("popupNameBadge", person.name);
  setText("piName", person.name);
  rowShow("piRowAge", !!person.age);
  setText("piAge", person.age);
  rowShow("piRowHome", !!person.home);
  setText("piHome", person.home);
  rowShow("piRowActivities", !!person.activities);
  setText("piActivities", person.activities);
  rowShow("piRowRationale", !!person.rationale);
  setText("piRationale", person.rationale);
  rowShow("piRowRecommendation", !!person.recommendation);

  if (person.recommendation) {
    setHtml("piRecommendation", linkRecommendation(person.recommendation, allPeople));
  }

  rowShow("piRowMinister", !!person.minister);
  setText("piMinister", person.minister);

  const links = person.links || {};
  const hasLinks = Object.keys(links).length > 0;
  rowShow("piRowLinks", hasLinks);

  if (hasLinks) {
    setHtml(
      "piLinks",
      Object.entries(links)
        .sort(([a], [b]) => (a === "homepage" ? -1 : b === "homepage" ? 1 : 0))
        .map(([platform, url]) =>
          platform === "homepage"
            ? `<a href="${url}" target="_blank" rel="noreferrer" class="pi-homepage-link">לאתר שלי</a>`
            : `<a href="${url}" target="_blank" rel="noreferrer" class="pi-social-link" title="${platform}">
            <img src="${platform}.svg" alt="${platform} icon" class="social-icon-img" />
          </a>`,
        )
        .join(""),
    );
  }

  const popupImg = document.getElementById("popupImg");
  popupImg.src = PORTRAITS_DIR + photos[photos.length - 1];
  popupImg.loading = "eager";
  popupImg.alt = person.name;

  popup.classList.add("open");
  popup.dataset.personId = person.id;
};

const closePopup = () => {
  unlockBodyScroll();
  popup.classList.remove("open");
  popupHistory = [];
  document.getElementById("popupBack").style.display = "none";
};

const popupGoBack = () => {
  const prev = popupHistory.pop();
  if (!prev) return;
  openPopup(prev.person, prev.card, false, "back");
};

const scheduleClose = () => { // eslint-disable-line no-unused-vars
  closeTimer = setTimeout(closePopup, 120);
};

// ─────────────────────────────────────────────────────────────────────────────
// URL synchronization
// ─────────────────────────────────────────────────────────────────────────────

const syncPopupToUrl = () => {
  if (!allPeople.length) return;

  const params = new URLSearchParams(window.location.search);
  const idParam = params.get("id");
  const nameParam = params.get("name");

  if (!(idParam || nameParam)) {
    if (popup.classList.contains("open")) {
      closePopup();
    }
    return;
  }

  const match = allPeople.find((p) =>
    idParam ? p.id === idParam : p.name === nameParam,
  );

  if (!match) return;

  if (popup.classList.contains("open") && popup.dataset.personId === match.id) {
    return;
  }

  openPopup(match, document.body, false, "deeplink");
};

// ─────────────────────────────────────────────────────────────────────────────
// Select mode (candidate selection)
// ─────────────────────────────────────────────────────────────────────────────

const toggleSelection = (id, btn) => {
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
};

const enterSelectMode = () => {
  selectMode = true;
  closePopup();

  const btnSelect = document.getElementById("btnSelect");
  btnSelect.textContent = "✕ יציאה מבחירה";
  btnSelect.classList.add("active");
  document.getElementById("btnShowChoices").style.display = "";
  document.getElementById("btnReset").style.display = "";

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
    card.appendChild(btn);
  });
};

const exitSelectMode = () => {
  selectMode = false;
  const btnSelect = document.getElementById("btnSelect");
  btnSelect.textContent = btnSelect.dataset.originalText || "שמרו רשימה";
  btnSelect.classList.remove("active");
  document.getElementById("btnShowChoices").style.display = "none";
  document.getElementById("btnReset").style.display = "none";
  document.querySelectorAll(".card-select-btn").forEach((b) => b.remove());
};

const openChoicesModal = () => {
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
  document.getElementById("choicesOverlay").style.display = "flex";
};

const resetChoices = () => {
  selectedIds.clear();
  setCookie(COOKIE_CONSENT_KEY, "", 0);
  setCookie(COOKIE_CHOICES_KEY, "", 0);
  exitSelectMode();
};

const restoreFromCookies = () => {
  if (getCookie(COOKIE_CONSENT_KEY) !== "1") return;
  const saved = getCookie(COOKIE_CHOICES_KEY);
  if (saved) {
    try {
      JSON.parse(saved).forEach((id) => selectedIds.add(id));
    } catch (e) {
      /* invalid JSON */
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Pin button
// ─────────────────────────────────────────────────────────────────────────────

const setupPinButton = () => {
  const pinBtn = document.getElementById("popupPin");
  const pinToast = document.getElementById("popupPinToast");
  if (!pinBtn) return;

  let toastTimer;
  pinBtn.addEventListener("click", () => {
    const id = popup.dataset.personId;
    if (!id) return;
    const url = `${location.origin}/candidates/${encodeURIComponent(id)}.html`;
    copyToClipboard(url).then(() => {
      clearTimeout(toastTimer);
      pinToast.classList.add("show");
      toastTimer = setTimeout(() => pinToast.classList.remove("show"), 2000);
    });
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Recommendation name linking (click delegation)
// ─────────────────────────────────────────────────────────────────────────────

const setupRecommendationLinks = () => {
  document.getElementById("popup").addEventListener("click", (e) => {
    const link = e.target.closest(".pi-rec-link");
    if (!link) return;
    e.preventDefault();
    e.stopPropagation();

    const targetId = link.dataset.personId;
    const targetPerson = allPeople.find((p) => p.id === targetId);
    if (!targetPerson) return;

    const targetCard = document.querySelector(
      `.card[data-person-id="${targetId}"]`,
    );
    if (targetCard) {
      targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => openPopup(targetPerson, targetCard, true, "recommendation"), 350);
    } else {
      openPopup(targetPerson, document.body, true, "recommendation");
    }
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Event listeners setup
// ─────────────────────────────────────────────────────────────────────────────

const setupPopupControls = () => {
  document.getElementById("popupClose").addEventListener("click", closePopup);
  document.getElementById("popupBack").addEventListener("click", popupGoBack);
};

const setupSelectModeControls = () => {
  const btnSelect = document.getElementById("btnSelect");
  const btnShowChoices = document.getElementById("btnShowChoices");
  const btnReset = document.getElementById("btnReset");
  const cookieOverlay = document.getElementById("cookieOverlay");
  const cookieYes = document.getElementById("cookieYes");
  const cookieNo = document.getElementById("cookieNo");
  const choicesOverlay = document.getElementById("choicesOverlay");
  const choicesClose = document.getElementById("choicesClose");
  const choicesCopy = document.getElementById("choicesCopy");

  btnSelect.dataset.originalText = btnSelect.textContent;

  btnSelect.addEventListener("click", () => {
    if (selectMode) {
      exitSelectMode();
    } else if (isTouch() || getCookie(COOKIE_CONSENT_KEY) === "1") {
      setCookie(COOKIE_CONSENT_KEY, "1", COOKIE_MAX_AGE);
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
};

const setupKeyboardAndClickHandlers = () => {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePopup();
  });

  document.addEventListener("click", (e) => {
    if (justOpened) {
      justOpened = false;
      return;
    }
    if (!e.target.closest(".card") && !e.target.closest("#popup")) {
      closePopup();
    }
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

const bootstrap = () => {
  fetch("candidates.json")
    .then((r) => r.json())
    .then((people) => people.filter((p) => !p.hidden))
    .then((people) => shuffleWithPinning(people, PINNED_IDS, PINNED_WINDOW))
    .then((people) => {
      allPeople = people;
      buildGrid(people);
      restoreFromCookies();
      syncPopupToUrl();

      window.addEventListener("popstate", () => {
        syncPopupToUrl();
      });

      window.addEventListener("pageshow", (e) => {
        if (e.persisted) syncPopupToUrl();
      });
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────────────────────

setupPopupControls();
setupRecommendationLinks();
setupPinButton();
setupSelectModeControls();
setupKeyboardAndClickHandlers();
bootstrap();
