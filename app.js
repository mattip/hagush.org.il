const PORTRAITS_DIR = 'portraits/';
const CYCLE_MIN_MS  = 900;
const CYCLE_MAX_MS  = 1400;
const CYCLE_JITTER_MS = 2000; // max random start delay

const timers = {};
const popup  = document.getElementById('popup');
let closeTimer = null;

// ── Bootstrap ────────────────────────────────────────────────────
fetch('candidates.json')
  .then(r => r.json())
  .then(buildGrid);

// ── Grid ─────────────────────────────────────────────────────────
function buildGrid(people) {
  const grid = document.getElementById('grid');

  people.forEach((person, i) => {
    const card = createCard(person, i);
    grid.appendChild(card);
    // Staggered CSS entrance animation via custom property
    card.style.setProperty('--i', i);
    // Start photo cycling after a random initial delay
    setTimeout(() => startCycle(i, card), Math.random() * CYCLE_JITTER_MS);
  });

  // "Add person" placeholder
  const add = document.createElement('button');
  add.className = 'add-card';
  add.innerHTML = '<div class="add-icon">＋</div><span>הוספת חבר/ת צוות</span>';
  add.onclick = () => alert('הוסיפו רשומה נוספת ל-people.json כדי להוסיף אדם.');
  grid.appendChild(add);
}

function createCard(person, i) {
  const card = document.createElement('div');
  card.className = 'card';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `${person.name}${person.minister ? ", " + person.minister : ""}`);

  // Photo stage
  const stage = document.createElement('div');
  stage.className = 'photo-stage';

  person.photos.forEach((filename, pi) => {
    const img = document.createElement('img');
    img.src = PORTRAITS_DIR + filename;
    img.alt = person.name;
    img.draggable = false;
    if (pi === 0) img.classList.add('active');
    stage.appendChild(img);
  });

  // Dot indicators
  const dots = document.createElement('div');
  dots.className = 'pose-dots';
  person.photos.forEach((_, pi) => {
    const dot = document.createElement('div');
    dot.className = 'dot' + (pi === 0 ? ' active' : '');
    dots.appendChild(dot);
  });
  stage.appendChild(dots);

  // Name badge overlaid on photo, matching popup style
  const badge = document.createElement('span');
  badge.className = 'popup-name-badge';
  badge.textContent = person.name;
  stage.appendChild(badge);

  card.append(stage);

  // Events
  card.addEventListener('mouseenter', () => openPopup(person, card));
  card.addEventListener('click',      () => openPopup(person, card));
  card.addEventListener('mouseleave', e => {
    if (!e.relatedTarget?.closest('#popup')) scheduleClose();
  });
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') openPopup(person, card);
  });

  return card;
}

// ── Photo cycling ─────────────────────────────────────────────────
function startCycle(idx, card) {
  if (timers[idx]) return;
  const imgs = card.querySelectorAll('.photo-stage img');
  const dots = card.querySelectorAll('.dot');
  let current = 0;

  function step() {
    imgs[current].classList.remove('active');
    dots[current]?.classList.remove('active');
    current = (current + 1) % imgs.length;
    imgs[current].classList.add('active');
    dots[current]?.classList.add('active');
    timers[idx] = setTimeout(step, CYCLE_MIN_MS + Math.random() * (CYCLE_MAX_MS - CYCLE_MIN_MS));
  }

  timers[idx] = setTimeout(step, CYCLE_MIN_MS + Math.random() * (CYCLE_MAX_MS - CYCLE_MIN_MS));
}

// ── Popup ─────────────────────────────────────────────────────────
popup.addEventListener('mouseenter', () => clearTimeout(closeTimer));
popup.addEventListener('mouseleave', scheduleClose);
document.getElementById('popupClose').addEventListener('click', closePopup);

// ── Social icon — IG SVG placeholder for all platforms ──────────
const SOCIAL_SVG = '<svg class="ig-icon" preserveAspectRatio="xMidYMid meet" data-bbox="0.148 0 133.109 133.074" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 134 134" role="presentation" aria-hidden="true"> <g> <path fill="url(#ig-grad1)" d="M66.724 0C38.938 0 30.81.029 29.232.16c-5.703.474-9.25 1.372-13.116 3.296-2.98 1.48-5.329 3.194-7.648 5.598C4.245 13.438 1.686 18.83.76 25.24.31 28.353.178 28.988.152 44.884c-.01 5.3 0 12.273 0 21.627 0 27.763.03 35.881.163 37.458.461 5.549 1.331 9.039 3.174 12.858 3.522 7.309 10.247 12.797 18.171 14.844 2.744.706 5.774 1.095 9.664 1.28 1.648.071 18.448.123 35.257.123 16.81 0 33.62-.021 35.227-.103 4.504-.212 7.12-.563 10.012-1.31a27.88 27.88 0 0 0 18.171-14.875c1.807-3.726 2.723-7.35 3.138-12.609.09-1.147.128-19.428.128-37.684 0-18.259-.041-36.506-.131-37.652-.42-5.344-1.336-8.938-3.201-12.736-1.531-3.109-3.23-5.43-5.697-7.805-4.403-4.205-9.787-6.764-16.205-7.69-3.109-.45-3.729-.582-19.637-.61z"></path> <path fill="url(#ig-grad2)" d="M66.724 0C38.938 0 30.81.029 29.232.16c-5.703.474-9.25 1.372-13.116 3.296-2.98 1.48-5.329 3.194-7.648 5.598C4.245 13.438 1.686 18.83.76 25.24.31 28.353.178 28.988.152 44.884c-.01 5.3 0 12.273 0 21.627 0 27.763.03 35.881.163 37.458.461 5.549 1.331 9.039 3.174 12.858 3.522 7.309 10.247 12.797 18.171 14.844 2.744.706 5.774 1.095 9.664 1.28 1.648.071 18.448.123 35.257.123 16.81 0 33.62-.021 35.227-.103 4.504-.212 7.12-.563 10.012-1.31a27.88 27.88 0 0 0 18.171-14.875c1.807-3.726 2.723-7.35 3.138-12.609.09-1.147.128-19.428.128-37.684 0-18.259-.041-36.506-.131-37.652-.42-5.344-1.336-8.938-3.201-12.736-1.531-3.109-3.23-5.43-5.697-7.805-4.403-4.205-9.787-6.764-16.205-7.69-3.109-.45-3.729-.582-19.637-.61z"></path> <path fill="#ffffff" d="M66.693 17.403c-13.345 0-15.02.059-20.262.297-5.231.24-8.802 1.068-11.926 2.283-3.232 1.255-5.974 2.934-8.705 5.666-2.733 2.732-4.412 5.473-5.671 8.704-1.219 3.126-2.048 6.697-2.283 11.927-.234 5.241-.295 6.917-.295 20.262s.06 15.015.297 20.257c.24 5.231 1.069 8.802 2.283 11.926 1.256 3.232 2.935 5.974 5.667 8.705 2.73 2.733 5.472 4.417 8.702 5.672 3.126 1.215 6.698 2.043 11.928 2.283 5.242.238 6.916.296 20.26.296 13.346 0 15.016-.058 20.257-.296 5.232-.24 8.806-1.068 11.933-2.283 3.231-1.255 5.968-2.939 8.699-5.672 2.733-2.731 4.412-5.473 5.671-8.704 1.208-3.125 2.037-6.697 2.283-11.926.235-5.242.297-6.912.297-20.258s-.062-15.02-.297-20.261c-.246-5.231-1.075-8.802-2.283-11.927-1.259-3.232-2.938-5.973-5.671-8.704-2.734-2.734-5.467-4.413-8.702-5.667-3.133-1.215-6.706-2.043-11.937-2.283-5.241-.238-6.91-.297-20.26-.297zm-4.408 8.856c1.308-.002 2.768 0 4.408 0 13.12 0 14.675.047 19.856.282 4.791.22 7.391 1.02 9.124 1.692 2.293.891 3.928 1.956 5.646 3.676 1.72 1.72 2.785 3.358 3.678 5.65.672 1.73 1.474 4.331 1.692 9.122.235 5.18.287 6.736.287 19.85s-.052 14.67-.287 19.85c-.219 4.791-1.02 7.392-1.692 9.122-.891 2.293-1.958 3.926-3.678 5.645s-3.352 2.784-5.646 3.675c-1.73.675-4.333 1.474-9.124 1.693-5.18.235-6.736.287-19.856.287s-14.676-.052-19.856-.287c-4.791-.221-7.392-1.022-9.125-1.694-2.293-.891-3.931-1.956-5.65-3.676s-2.785-3.353-3.678-5.647c-.673-1.73-1.474-4.33-1.692-9.122-.236-5.18-.283-6.736-.283-19.858s.047-14.67.283-19.85c.219-4.791 1.02-7.392 1.692-9.124.89-2.293 1.957-3.93 3.677-5.65s3.358-2.785 5.651-3.678c1.732-.676 4.334-1.474 9.125-1.694 4.533-.205 6.29-.266 15.448-.277zm30.638 8.159a5.897 5.897 0 1 0 5.897 5.894 5.9 5.9 0 0 0-5.897-5.896zm-26.23 6.89c-13.936 0-25.235 11.298-25.235 25.234s11.299 25.23 25.235 25.23 25.232-11.294 25.232-25.23-11.297-25.235-25.233-25.235m0 8.855c9.046 0 16.38 7.333 16.38 16.38 0 9.045-7.334 16.38-16.38 16.38-9.047 0-16.38-7.335-16.38-16.38 0-9.047 7.333-16.38 16.38-16.38"></path> <defs fill="none"> <radialGradient gradientTransform="scale(122.697 131.886)rotate(-90 .688 .399)" gradientUnits="userSpaceOnUse" r="1" cy="0" cx="0" id="ig-grad1"> <stop stop-color="#FFDD55"></stop> <stop stop-color="#FFDD55" offset=".1"></stop> <stop stop-color="#FF543E" offset=".5"></stop> <stop stop-color="#C837AB" offset="1"></stop> </radialGradient> <radialGradient gradientTransform="rotate(78.678 -16.923 -8.719)scale(58.9541 243.072)" gradientUnits="userSpaceOnUse" r="1" cy="0" cx="0" id="ig-grad2"> <stop stop-color="#3771C8"></stop> <stop stop-color="#3771C8" offset=".128"></stop> <stop stop-opacity="0" stop-color="#6600FF" offset="1"></stop> </radialGradient> </defs> </g> </svg>';

function set(id, txt)      { const el = document.getElementById(id); if (el) el.textContent = txt ?? ''; }
function setHTML(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }
function rowShow(id, show) { const el = document.getElementById(id); if (el) el.style.display = show ? '' : 'none'; }

function openPopup(person, card) {
  clearTimeout(closeTimer);

  // Photo
  const photos = person.photos || [];
  document.getElementById('popupImg').src = photos.length ? PORTRAITS_DIR + photos[0] : '';
  document.getElementById('popupImg').alt = person.name;

  // Name badge on photo (name only)
  set('popupNameBadge', person.name);

  // 2-col rows
  set('piName',  person.name);
  set('piAge',   person.age);
  set('piHome',  person.home);
  rowShow('piRowActivities',     !!person.activities);
  set('piActivities',            person.activities);

  // Full-width rows
  rowShow('piRowRationale',      !!person.rationale);
  set('piRationale',             person.rationale);
  rowShow('piRowRecommendation', !!person.recommendation);
  set('piRecommendation',        person.recommendation);
  rowShow('piRowMinister',       !!person.minister);
  set('piMinister',              person.minister);

  // Links
  const links = person.links || {};
  const hasLinks = Object.keys(links).length > 0;
  rowShow('piRowLinks', hasLinks);
  if (hasLinks) {
    setHTML('piLinks',
      Object.entries(links).map(([platform, url]) =>
        `<a href="${url}" target="_blank" rel="noreferrer" class="pi-social-link" title="${platform}">${SOCIAL_SVG}</a>`
      ).join('')
    );
  }

  popup.classList.add('open');
  requestAnimationFrame(() => positionPopup(card));
}

function positionPopup(card) {
  const GAP = 12;
  const cr  = card.getBoundingClientRect();
  const pw  = popup.offsetWidth;
  const ph  = popup.offsetHeight;
  const vw  = window.innerWidth;
  const vh  = window.innerHeight;

  popup.classList.remove('arrow-top', 'arrow-bottom', 'arrow-left', 'arrow-right');

  let top, left;

  if (cr.right + GAP + pw <= vw - 8) {          // right
    left = cr.right + GAP;
    top  = cr.top + (cr.height - ph) / 2;
    popup.classList.add('arrow-left');
  } else if (cr.left - GAP - pw >= 8) {          // left
    left = cr.left - GAP - pw;
    top  = cr.top + (cr.height - ph) / 2;
    popup.classList.add('arrow-right');
  } else if (cr.bottom + GAP + ph <= vh - 8) {   // below
    top  = cr.bottom + GAP;
    left = cr.left + (cr.width - pw) / 2;
    popup.classList.add('arrow-top');
  } else {                                        // above
    top  = cr.top - GAP - ph;
    left = cr.left + (cr.width - pw) / 2;
    popup.classList.add('arrow-bottom');
  }

  popup.style.top  = Math.max(8, Math.min(top,  vh - ph - 8)) + 'px';
  popup.style.left = Math.max(8, Math.min(left, vw - pw - 8)) + 'px';
}

function scheduleClose() {
  closeTimer = setTimeout(closePopup, 120);
}

function closePopup() {
  popup.classList.remove('open');
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closePopup(); });
document.addEventListener('click',   e => {
  if (!e.target.closest('.card') && !e.target.closest('#popup')) closePopup();
});
