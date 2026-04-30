/**
 * @file types.js
 * JSDoc typedef declarations for core domain shapes consumed by views and API modules.
 * This file is not executed; it is read by tsc --checkJs for type inference.
 *
 * Import a typedef in a module with:
 *   (at)typedef {import('./types.js').Card} Card
 */

// ── Shared primitives ─────────────────────────────────────────────────────────

/**
 * @typedef {'again'|'hard'|'good'|'easy'} Rating
 */

/**
 * @typedef {'basic'|'cloze'|'image_occlusion'} CardType
 */

/**
 * @typedef {'Active'|'Archived'} CardStatus
 */

/**
 * @typedef {'Factual'|'Mechanism'|'Clinical Reasoning'|'Anatomy'|'Pathology'} ContentType
 */

// ── Geometry ──────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} OcclusionRegion
 * @property {string} id
 * @property {string} label
 * @property {'rect'|'polygon'} type
 * @property {number} [x]       - Fractional 0 to 1, rect only
 * @property {number} [y]
 * @property {number} [width]
 * @property {number} [height]
 * @property {Array<{x: number, y: number}>} [points] - Fractional, polygon only
 */

// ── Card (merged view object) ─────────────────────────────────────────────────

/**
 * In-memory shape that views consume.
 * Merged from Flashcard + CardState Base44 entities.
 *
 * @typedef {Object} Card
 *
 * Identity:
 * @property {string} id           - Stable client-generated UUID (clientId in storage).
 * @property {string} deck         - Deck name string.
 *
 * Content:
 * @property {string} front
 * @property {string} back
 * @property {string} [elaboration]
 * @property {string} [source]
 * @property {string} [anchor]
 * @property {string[]} tags
 * @property {CardType} cardType
 * @property {ContentType} contentType
 * @property {boolean} stakes_flag
 * @property {boolean} [ai_edited]
 * @property {string|null} prerequisite_card_id
 * @property {string[]} [connects_to]
 *
 * Scheduling (from CardState):
 * @property {number|null} stability
 * @property {number|null} difficulty
 * @property {number} interval
 * @property {string|null} nextReview - YYYY-MM-DD or null for new cards
 * @property {string|null} lastReview
 * @property {number} reviewCount
 * @property {number} lapses
 * @property {Array<{date: string, rating: Rating}>} ratingHistory
 * @property {CardStatus} status
 *
 * Cloze fields (when cardType === 'cloze'):
 * @property {string} [clozeText]
 * @property {number} [clozeIndex]
 *
 * Image occlusion fields (when cardType === 'image_occlusion'):
 * @property {string} [imageUrl]
 * @property {OcclusionRegion[]} [occlusionRegions]
 * @property {string} [occlusionRegionId]
 */

// ── Base44 entity shapes (raw, before merge) ──────────────────────────────────

/**
 * Base44 Flashcard entity. Contains content fields.
 * Scheduling fields here are the legacy pre-migration location; prefer CardState.
 *
 * @typedef {Object} Flashcard
 * @property {string} id        - Base44 entity ID
 * @property {string} clientId  - App-generated stable UUID
 * @property {string} front
 * @property {string} back
 * @property {string} deck
 * @property {CardType} cardType
 * @property {ContentType} contentType
 * @property {string[]} tags
 * @property {CardStatus} status
 * @property {boolean} stakes_flag
 * @property {string} [elaboration]
 * @property {string} [source]
 * @property {string} [anchor]
 * @property {boolean} [ai_edited]
 * @property {string|null} [prerequisite_card_id]
 * @property {string[]} [connects_to]
 * @property {string} [clozeText]
 * @property {number} [clozeIndex]
 * @property {string} [imageUrl]
 * @property {OcclusionRegion[]} [occlusionRegions]
 * @property {string} [occlusionRegionId]
 */

/**
 * Base44 CardState entity. Contains FSRS scheduling fields, keyed by cardClientId.
 *
 * @typedef {Object} CardState
 * @property {string} id           - Base44 entity ID
 * @property {string} cardClientId - FK to Flashcard.clientId
 * @property {number|null} stability
 * @property {number|null} difficulty
 * @property {number} interval
 * @property {string|null} nextReview
 * @property {string|null} lastReview
 * @property {number} reviewCount
 * @property {number} lapses
 * @property {Array<{date: string, rating: Rating}>} ratingHistory
 */

/**
 * Base44 Deck entity.
 *
 * @typedef {Object} Deck
 * @property {string} id
 * @property {string} title
 * @property {number} [cardCount]
 * @property {string} [parentDeck]
 */

/**
 * Base44 SessionLog entity. One record per completed review session.
 *
 * @typedef {Object} SessionLog
 * @property {string} id
 * @property {string} date        - YYYY-MM-DD
 * @property {number} reviewed
 * @property {number} failed
 * @property {number} newAdded
 * @property {string} [frictionNote]
 * @property {number} [intensity_score]
 * @property {'complete'|'partial'} [status]
 */

/**
 * Base44 User entity (minimal shape used by the app).
 *
 * @typedef {Object} User
 * @property {string} id
 * @property {string} [email]
 * @property {string} [first_name]
 */

// ── Anki import shapes ────────────────────────────────────────────────────────

/**
 * Parsed Anki note produced by parseApkg/convertToNidusCards.
 *
 * @typedef {Object} AnkiNote
 * @property {string} noteId
 * @property {CardType} cardType
 * @property {string} deckName
 * @property {string[]} fields
 * @property {string[]} tags
 * @property {{ name: string, flds: string[], type: number }} model
 * @property {Array<{ cardId: string, deckId: string, ord: number }>} noteCards
 */

// ── AI assist shapes ──────────────────────────────────────────────────────────

/**
 * Input to requestAIEdit.
 *
 * @typedef {Object} AiRequest
 * @property {string} prompt
 * @property {Pick<Card, 'front'|'back'|'deck'|'tags'>} card
 */

/**
 * Validated output of requestAIEdit.
 *
 * @typedef {Object} AiResponse
 * @property {{ front: string, back: string }} proposed
 * @property {boolean} isClinical
 */

export {}
