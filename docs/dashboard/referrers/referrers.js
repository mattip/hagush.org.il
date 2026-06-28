// Referrer types (JSDoc only). API calls live in referrers.api.js.

/**
 * A single referrer (person). The Firestore doc ID equals `code`.
 *
 * @typedef {Object} Referrer
 * @property {string}               code     - Stable referrer code ("18", "clm-123"). Also the doc ID.
 * @property {string}               name     - Display name.
 * @property {boolean}              active
 * @property {'individual'|'organizer'} type - 'organizer' = person who also leads a group.
 * @property {string|null}          groupId  - FK to referrer_groups/{groupId}, or null.
 */

/**
 * A named group that owns multiple individual referrers.
 *
 * @typedef {Object} ReferrerGroup
 * @property {string}  id     - Firestore doc ID (stable slug or auto-ID).
 * @property {string}  name   - Display name.
 * @property {boolean} active
 */

/**
 * One row in the per-referrer table, ready for rendering.
 *
 * @typedef {Object} ReferrerAggregateRow
 * @property {string}      code
 * @property {string}      name
 * @property {number}      count
 * @property {string|null} groupId
 * @property {string|null} groupName
 * @property {'individual'|'organizer'} type
 * @property {boolean}     isKnown  - false when referrer code has no dimension entry.
 */

/**
 * One row in the per-group summary table.
 *
 * @typedef {Object} GroupAggregateRow
 * @property {string}                 groupId
 * @property {string}                 groupName
 * @property {number}                 totalCount
 * @property {ReferrerAggregateRow[]} members    - Individual rows that belong to this group.
 */
