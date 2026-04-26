/**
 * Remote storage adapter — wraps Base44 entities with the flat card/deck/log
 * interface used by the app.
 *
 * ID management:
 *   The app generates its own stable clientIds (genId). Base44 assigns its own
 *   entity IDs on create. We store clientId as a field in the entity and keep
 *   an in-memory map (clientId → entityId) so the two ID spaces stay decoupled.
 *
 * Concurrency:
 *   syncCards is serialised via syncLock so concurrent calls never race against
 *   entityIdMap. ensureDeck caches the in-flight promise so two simultaneous
 *   calls for the same deck name only fire one create.
 */

import { base44 } from "@/api/base44Client"

// ── In-memory state (rebuilt on each loadAll call) ────────────────────────────
let entityIdMap  = new Map()  // clientId  → Base44 entity id
let cardSnapshot = new Map()  // clientId  → last-synced card object (for diffing)
let deckNameToId = new Map()  // deckTitle → Base44 Deck entity id
let deckPending  = new Map()  // deckTitle → in-flight Deck.create Promise
let deckCountCache = new Map()  // deckTitle → current card_count

// Serialises concurrent syncCards calls so they never race against entityIdMap
let syncLock = Promise.resolve()

// ── Deck helpers ──────────────────────────────────────────────────────────────

/**
 * Ensure a deck exists in Base44; returns its entity id.
 * Concurrent calls with the same name share a single in-flight promise so only
 * one Deck.create fires regardless of how many callers race.
 */
export const ensureDeck = async (name) => {
  if (deckNameToId.has(name)) return deckNameToId.get(name)
  if (deckPending.has(name))  return deckPending.get(name)
  const p = base44.entities.Deck.create({ title: name })
    .then(entity => {
      deckNameToId.set(name, entity.id)
      deckPending.delete(name)
      return entity.id
    })
    .catch(err => {
      deckPending.delete(name)
      throw err
    })
  deckPending.set(name, p)
  return p
}

// ── Entity ↔ app object mapping ───────────────────────────────────────────────

const idToName = () => new Map([...deckNameToId.entries()].map(([n, id]) => [id, n]))

const toAppCard = (entity) => ({
  id:          entity.clientId || entity.id,
  front:       entity.front        || "",
  back:        entity.back         || "",
  contentType: entity.contentType  || "Factual",
  deck:        idToName().get(entity.deckId) || "General",
  elaboration: entity.elaboration  || "",
  status:      entity.status       || "Active",
  nextReview:  entity.nextReview   || null,
  interval:    entity.interval     || 1,
  reviewCount: entity.reviewCount  || 0,
  stability:   entity.stability    ?? null,
  difficulty:  entity.difficulty   ?? null,
  lapses:      entity.lapses       || 0,
  lastReview:  entity.lastReview   || null,
  createdAt:   entity.created_date || null,
  ratingHistory: entity.ratingHistory || [],
})

const toEntityData = (card, deckId) => ({
  clientId:    card.id,
  deckId,
  front:       card.front,
  back:        card.back,
  contentType: card.contentType || "Factual",
  elaboration: card.elaboration || "",
  status:      card.status      || "Active",
  nextReview:  card.nextReview  || null,
  interval:    card.interval    || 1,
  reviewCount: card.reviewCount || 0,
  stability:   card.stability   ?? null,
  difficulty:  card.difficulty  ?? null,
  lapses:      card.lapses      || 0,
  lastReview:  card.lastReview  || null,
  ratingHistory: (card.ratingHistory || []).slice(-50),
})

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Load everything from Base44 on app startup.
 * Returns { cards, deckNames, log }.
 */
export const loadAll = async () => {
  // Reset all maps and the sync lock
  entityIdMap.clear()
  cardSnapshot.clear()
  deckNameToId.clear()
  deckPending.clear()
  deckCountCache.clear()
  syncLock = Promise.resolve()

  const [deckEntities, cardEntities, logEntities] = await Promise.all([
    base44.entities.Deck.list(),
    base44.entities.Flashcard.list(),
    base44.entities.SessionLog.list(),
  ])

  // Build deck lookup maps
  deckCountCache.clear()
  for (const d of deckEntities) {
    deckNameToId.set(d.title, d.id)
    deckCountCache.set(d.title, d.card_count || 0)
  }

  // Map cards
  const cards = cardEntities.map(e => {
    const card = toAppCard(e)
    entityIdMap.set(card.id, e.id)
    cardSnapshot.set(card.id, { ...card })
    return card
  })

  // Map log — sort by session date descending in JS (safer than relying on
  // created_date which mis-sorts batch-imported entries with old date values)
  const log = logEntities
    .map(e => ({
      date:         e.date         || new Date().toISOString(),
      reviewed:     e.reviewed     || 0,
      failed:       e.failed       || 0,
      newAdded:     e.newAdded     || 0,
      frictionNote: e.frictionNote || "",
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  const deckNames = deckEntities.map(d => d.title)

  return { cards, deckNames, log }
}

/**
 * Diff updatedCards against the last-synced snapshot and push only the
 * changes (creates / updates / deletes) to Base44.
 *
 * Calls are serialised via syncLock so a rapid sequence of calls (e.g. rating
 * several cards quickly) won't race against entityIdMap.
 */
export const syncCards = (updatedCards) => {
  syncLock = syncLock.then(() => _doSync(updatedCards))
  return syncLock
}

const _doSync = async (updatedCards) => {
  // Pre-ensure all deck entities exist (concurrent-safe via deckPending cache)
  const uniqueDecks = [...new Set(updatedCards.map(c => c.deck))]
  await Promise.all(uniqueDecks.map(ensureDeck))

  const newMap = new Map(updatedCards.map(c => [c.id, c]))

  // Collect operations
  const deleteOps = []
  for (const [clientId, entityId] of entityIdMap) {
    if (!newMap.has(clientId)) deleteOps.push({ clientId, entityId })
  }

  const createOps = []
  const updateOps = []
  for (const [clientId, card] of newMap) {
    const deckId = deckNameToId.get(card.deck)
    if (!entityIdMap.has(clientId)) {
      createOps.push({ card, deckId })
    } else {
      const snap = cardSnapshot.get(clientId)
      if (JSON.stringify(snap) !== JSON.stringify(card)) {
        updateOps.push({ entityId: entityIdMap.get(clientId), card, deckId })
      }
    }
  }

  // Execute all in parallel
  await Promise.all([
    ...deleteOps.map(({ clientId, entityId }) =>
      base44.entities.Flashcard.delete(entityId).then(() => {
        entityIdMap.delete(clientId)
        cardSnapshot.delete(clientId)
      })
    ),
    ...createOps.map(({ card, deckId }) =>
      base44.entities.Flashcard.create(toEntityData(card, deckId)).then(entity => {
        entityIdMap.set(card.id, entity.id)
        cardSnapshot.set(card.id, { ...card })
      })
    ),
    ...updateOps.map(({ entityId, card, deckId }) =>
      base44.entities.Flashcard.update(entityId, toEntityData(card, deckId)).then(() => {
        cardSnapshot.set(card.id, { ...card })
      })
    ),
  ])
}

/**
 * Append a completed session entry to Base44. Returns the created entity.
 */
export const appendLog = async (entry) => {
  const entity = await base44.entities.SessionLog.create({
    date:           entry.date,
    reviewed:       entry.reviewed       || 0,
    failed:         entry.failed         || 0,
    newAdded:       entry.newAdded       || 0,
    frictionNote:   entry.frictionNote   || "",
    intensity_score: entry.intensity_score || 0,
  })
  return entity
}

/**
 * Update an existing session log entry.
 */
export const updateLog = async (entityId, updates) => {
  await base44.entities.SessionLog.update(entityId, updates)
}

/**
 * Adjust a deck's card_count by delta (+1 or -1). Maintains the in-memory cache
 * and writes to the Deck entity.
 */
export const adjustDeckCount = async (deckTitle, delta) => {
  if (!deckTitle || !deckNameToId.has(deckTitle)) return
  const current = deckCountCache.get(deckTitle) || 0
  const next = Math.max(0, current + delta)
  deckCountCache.set(deckTitle, next)
  const deckId = deckNameToId.get(deckTitle)
  await base44.entities.Deck.update(deckId, { card_count: next })
}

/**
 * Recalculate and write the exact card_count for a deck based on all Active cards.
 */
export const recalculateDeckCount = async (deckTitle, allCards) => {
  if (!deckTitle || !deckNameToId.has(deckTitle)) return
  const count = allCards.filter(c => c.deck === deckTitle && c.status === "Active").length
  deckCountCache.set(deckTitle, count)
  const deckId = deckNameToId.get(deckTitle)
  await base44.entities.Deck.update(deckId, { card_count: count })
}
