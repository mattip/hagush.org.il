// Array shuffling and pinning utilities

/**
 * Fisher-Yates shuffle with pinned IDs in first window.
 * Ensures specified IDs appear in the first N slots.
 * @param {Array} arr - Array to shuffle
 * @param {Array<string>} pinnedIds - IDs that must appear first
 * @param {number} pinnedWindow - How many leading slots to spread pinned IDs across
 * @returns {Array} Shuffled array with pinned items in leading positions
 */
const shuffleWithPinning = (arr, pinnedIds, pinnedWindow) => {
  const pinned = arr.filter((p) => pinnedIds.includes(p.id));
  const unpinned = arr.filter((p) => !pinnedIds.includes(p.id));

  // Shuffle pinned
  for (let i = pinned.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pinned[i], pinned[j]] = [pinned[j], pinned[i]];
  }

  // Shuffle unpinned
  for (let i = unpinned.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unpinned[i], unpinned[j]] = [unpinned[j], unpinned[i]];
  }

  // Pick random slots within [0, pinnedWindow) for the pinned ids
  const windowSize = Math.min(pinnedWindow, pinned.length + unpinned.length);
  const slots = Array.from({ length: windowSize }, (_, i) => i);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const pinnedSlots = new Set(slots.slice(0, pinned.length));

  // Interleave pinned and unpinned into result
  const result = new Array(arr.length);
  let pi = 0;
  let ui = 0;
  for (let i = 0; i < arr.length; i++) {
    if (i < windowSize && pinnedSlots.has(i)) {
      result[i] = pinned[pi++];
    } else {
      result[i] = unpinned[ui++];
    }
  }
  return result;
};

export { shuffleWithPinning };
