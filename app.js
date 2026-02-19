const PORTRAITS_DIR = 'portraits/';
const CYCLE_MIN_MS  = 900;
const CYCLE_MAX_MS  = 1400;
const CYCLE_JITTER_MS = 2000; // max random start delay

const timers = {};
const popup  = document.getElementById('popup');
let closeTimer = null;

// ── Bootstrap ────────────────────────────────────────────────────
fetch('people.json')
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
  card.setAttribute('aria-label', `${person.name}, ${person.role}`);

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

  // Name / role label
  const label = document.createElement('div');
  label.className = 'card-label';
  label.innerHTML = `<div class="card-name">${person.name}</div>
                     <div class="card-role">${person.role}</div>`;

  card.append(stage, label);

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

function openPopup(person, card) {
  clearTimeout(closeTimer);

  document.getElementById('popupImg').src    = PORTRAITS_DIR + person.photos[0];
  document.getElementById('popupImg').alt    = person.name;
  document.getElementById('popupName').textContent = person.name;
  document.getElementById('popupRole').textContent = person.role;
  document.getElementById('popupBio').textContent  = person.bio;
  document.getElementById('popupTags').innerHTML   =
    person.tags.map(t => `<span class="tag">${t}</span>`).join('');

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
