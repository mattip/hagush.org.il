// Photo carousel cycling utilities

/**
 * Start a photo carousel cycle (rotates images at random intervals).
 * @param {number} idx - Index for tracking this timer
 * @param {HTMLElement} card - Card element containing .photo-stage img
 * @param {number} firstPhoto - Starting photo index
 * @param {Object} timers - Timer tracking object (mutated)
 * @param {number} cycleMin - Minimum cycle time (ms)
 * @param {number} cycleMax - Maximum cycle time (ms)
 */
const startCycle = (idx, card, firstPhoto, timers, cycleMin, cycleMax) => {
  if (timers[idx]) return;

  const imgs = card.querySelectorAll(".photo-stage img");
  const dir = Math.random() < 0.5 ? 1 : -1;
  let current = firstPhoto;

  const step = () => {
    imgs[current].classList.remove("active");
    current = (current + dir + imgs.length) % imgs.length;
    imgs[current].classList.add("active");
    timers[idx] = setTimeout(step, cycleMin + Math.random() * (cycleMax - cycleMin));
  };

  timers[idx] = setTimeout(step, cycleMin + Math.random() * (cycleMax - cycleMin));
};

/**
 * Stop a photo carousel cycle.
 * @param {number} idx - Index of the cycle to stop
 * @param {Object} timers - Timer tracking object (mutated)
 */
const stopCycle = (idx, timers) => {
  if (timers[idx]) {
    clearTimeout(timers[idx]);
    delete timers[idx];
  }
};

export { startCycle, stopCycle };
