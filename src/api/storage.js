/**
 * Remote storage adapter: wraps Base44 entities with the flat card/deck/log
 * interface used by the app.
 *
 * ID management:
 *   The app generates its own stable clientIds (genId). Base44 assigns its own
 *   entity IDs on create. We store clientId as a field in the entity and keep
 *   an in-memory map (clientId to entityId) so the two ID spaces stay decoupled.
 *
 * Concurrency:
 *   syncCards is serialised via syncLock so concurrent calls never race against
 *   entityIdMap. ensureDeck caches the in-flight promise so two simultaneous
 *   calls for the same deck name only fire one create.
 *
 * CardState:
 *   FSRS scheduling state (stability, difficulty, interval, nextReview, etc.)
 *   is stored in the CardState entity, keyed by cardClientId. On load, CardState
 *   records are merged into the in-memory card objects. If no CardState exists
 *   for a card (pre-migration), the app falls back to reading scheduling fields
 *   directly from the Flashcard entity (backward compatibility shim).
 *   Use syncCardState(clientId, stateFields) to persist scheduling changes.
 *   Use syncCardStates(updatedCards) to batch-persist all scheduling fields.
 */

import { base44 } from "@/api/base44Client"

// ── In-memory state (rebuilt on each loadAll call) ────────────────────────────
let entityIdMap  = new Map()  // clientId  to Base44 entity id
let cardSnapshot = new Map()  // clientId  to last-synced card object (for diffing)
let deckNameToId = new Map()  // deckTitle to Base44 Deck entity id
let deckPending  = new Map()  // deckTitle to in-flight Deck.create Promise
let deckCountCache = new Map()  // deckTitle to current card_count
let deckParentMapMemo = new Map()  // childDeckTitle to parentDeckTitle (from parentDeckId)

// CardState maps (populated in loadAll from CardState entity)
let cardStateMap         = new Map()  // clientId to CardState app object
let cardStateEntityIdMap = new Map()  // clientId to CardState entity id
let cardStateSnapshot    = new Map()  // clientId to last-synced CardState (for diffing)

// UserSchedulerParams (at most one record per user)
let userSchedulerParams   = null  // the params object or null
let userSchedulerParamsId = null  // Base44 entity id for updates

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

// ── Entity to app object mapping ───────────────────────────────────────────────

const idToName = () => new Map([...deckNameToId.entries()].map(([n, id]) => [id, n]))

/**
 * Convert a CardState entity to the scheduling fields object used in-memory.
 */
const toAppCardState = (entity) => ({
  stability:          entity.stability          ?? null,
  difficulty:         entity.difficulty         ?? null,
  interval:           entity.interval           ?? 1,
  nextReview:         entity.nextReview          || null,
  lastReview:         entity.lastReview          || null,
  reviewCount:        entity.reviewCount         ?? 0,
  lapses:             entity.lapses              ?? 0,
  ratingHistory:      entity.ratingHistory       || [],
  suspended:          entity.suspended           || false,
  buriedUntil:        entity.buriedUntil         || null,
  clozeIndex:         entity.clozeIndex          ?? null,
  sourceCardClientId: entity.sourceCardClientId  || null,
})

const toAppCard = (entity) => {
  const clientId = entity.clientId || entity.id

  // Content fields only: scheduling state is merged from CardState below.
  const cardFields = {
    id:          clientId,
    front:       entity.front        || "",
    back:        entity.back         || "",
    contentType: entity.contentType  || "Factual",
    deck:        idToName().get(entity.deckId) || "General",
    elaboration: entity.elaboration  || "",
    status:      entity.status       || "Active",
    createdAt:   entity.created_date || null,
    tags:                 entity.tags                 || [],
    anchor:               entity.anchor               || null,
    source:               entity.source               || null,
    stakes_flag:          entity.stakes_flag          || false,
    connects_to:          entity.connects_to          || [],
    prerequisite_card_id: entity.prerequisite_card_id || null,
    cardType:             entity.cardType             || "basic",
    clozeText:            entity.clozeText             || null,
    clozeIndex:           entity.clozeIndex            ?? null,
    imageUrl:             entity.imageUrl              || null,
    occlusionRegions:     entity.occlusionRegions      || null,
    occlusionRegionId:    entity.occlusionRegionId     || null,
  }

  // Backward-compat shim: use CardState if available, else fall back to Flashcard fields.
  const state = cardStateMap.get(clientId) || {
    stability:    entity.stability    ?? null,
    difficulty:   entity.difficulty   ?? null,
    interval:     entity.interval     ?? 1,
    nextReview:   entity.nextReview    || null,
    lastReview:   entity.lastReview    || null,
    reviewCount:  entity.reviewCount   ?? 0,
    lapses:       entity.lapses        ?? 0,
    ratingHistory: entity.ratingHistory || [],
    suspended:    false,
    buriedUntil:  null,
  }

  return { ...cardFields, ...state }
}

const toEntityData = (card, deckId) => ({
  // Content fields only. Scheduling fields (stability, difficulty, interval,
  // nextReview, lastReview, reviewCount, lapses, ratingHistory) are now written
  // via syncCardState to the CardState entity. Writing them here caused redundant
  // writes on every card save. Removed per deferred item 4 (Session 5).
  clientId:    card.id,
  deckId,
  front:       card.front,
  back:        card.back,
  contentType: card.contentType || "Factual",
  elaboration: card.elaboration || "",
  status:      card.status      || "Active",
  tags:                 card.tags                 || [],
  anchor:               card.anchor               || null,
  source:               card.source               || null,
  stakes_flag:          card.stakes_flag          || false,
  connects_to:          card.connects_to          || [],
  prerequisite_card_id: card.prerequisite_card_id || null,
  cardType:             card.cardType             || "basic",
  clozeText:            card.clozeText             || null,
  clozeIndex:           card.clozeIndex            ?? null,
  imageUrl:             card.imageUrl              || null,
  occlusionRegions:     card.occlusionRegions      || null,
  occlusionRegionId:    card.occlusionRegionId     || null,
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
  deckParentMapMemo.clear()
  cardStateMap.clear()
  cardStateEntityIdMap.clear()
  cardStateSnapshot.clear()
  userSchedulerParams = null
  userSchedulerParamsId = null
  syncLock = Promise.resolve()

  // Load CardState first so toAppCard can merge it
  const cardStateEntities = await base44.entities.CardState.list().catch(() => [])
  for (const cs of cardStateEntities) {
    cardStateMap.set(cs.cardClientId, toAppCardState(cs))
    cardStateEntityIdMap.set(cs.cardClientId, cs.id)
    cardStateSnapshot.set(cs.cardClientId, toAppCardState(cs))
  }

  const [deckEntities, cardEntities, logEntities] = await Promise.all([
    base44.entities.Deck.list(),
    base44.entities.Flashcard.list(),
    base44.entities.SessionLog.list(),
  ])

  // Build deck lookup maps; parentDeckId is available on deck entities after migration.
  deckCountCache.clear()
  for (const d of deckEntities) {
    deckNameToId.set(d.title, d.id)
    deckCountCache.set(d.title, d.card_count || 0)
  }

  // Build deckParentMap from parentDeckId relationships (post-migration).
  // Maps childTitle to parentTitle so buildDeckTree can render indentation.
  const deckIdToTitle = new Map(deckEntities.map(d => [d.id, d.title]))
  for (const d of deckEntities) {
    if (d.parentDeckId) {
      const parentTitle = deckIdToTitle.get(d.parentDeckId)
      if (parentTitle) deckParentMapMemo.set(d.title, parentTitle)
    }
  }

  // Map cards (CardState already loaded so toAppCard will merge it)
  const cards = cardEntities.map(e => {
    const card = toAppCard(e)
    entityIdMap.set(card.id, e.id)
    cardSnapshot.set(card.id, { ...card })
    return card
  })

  // Map log: sort by session date descending in JS (safer than relying on
  // created_date which mis-sorts batch-imported entries with old date values)
  const log = logEntities
    .map(e => ({
      id:           e.id,
      date:         e.date         || new Date().toISOString(),
      reviewed:     e.reviewed     || 0,
      failed:       e.failed       || 0,
      newAdded:     e.newAdded     || 0,
      frictionNote: e.frictionNote || "",
      intensity_score: e.intensity_score ?? 0,
      status:       e.status       || "complete",
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  const deckNames = deckEntities.map(d => d.title)

  // Load UserSchedulerParams (at most one record)
  const paramRecords = await base44.entities.UserSchedulerParams.list().catch(() => [])
  if (paramRecords.length > 0) {
    userSchedulerParams   = paramRecords[0]
    userSchedulerParamsId = paramRecords[0].id
  }

  return { cards, deckNames, log, deckParentMap: new Map(deckParentMapMemo) }
}

/**
 * Diff updatedCards against the last-synced snapshot and push only the
 * content-field changes (creates / updates / deletes) to Base44.
 * Scheduling fields are handled by syncCardState / syncCardStates.
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
      // Compare content fields only (exclude scheduling fields handled by CardState)
      const snapContent = snap ? toEntityData(snap, snap._deckId) : null
      const cardContent = toEntityData(card, deckId)
      if (!snapContent || JSON.stringify(snapContent) !== JSON.stringify(cardContent)) {
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

  // Update deckCountCache for any deck that had creates or deletes
  const affectedDecks = new Set([
    ...createOps.map(({card}) => card.deck),
    ...deleteOps.map(({ clientId }) => {
      const snap = cardSnapshot.get(clientId)
      return snap ? idToName().get(snap.deckId || "") : null
    }).filter(Boolean)
  ])
  for (const deckName of affectedDecks) {
    const count = updatedCards.filter(c => c.deck === deckName && c.status !== 'Archived' && c.status !== 'Parked').length
    deckCountCache.set(deckName, count)
  }
}

/**
 * Persist scheduling fields for a single card to the CardState entity.
 * Creates a new CardState record if one does not exist yet (e.g. for a newly
 * created card that has not been migrated). Skips write if nothing changed.
 */
export const syncCardState = async (clientId, stateFields) => {
  const entityId = cardStateEntityIdMap.get(clientId)
  const payload = {
    cardClientId:       clientId,
    stability:          stateFields.stability          ?? null,
    difficulty:         stateFields.difficulty         ?? null,
    interval:           stateFields.interval           ?? 1,
    nextReview:         stateFields.nextReview          || null,
    lastReview:         stateFields.lastReview          || null,
    reviewCount:        stateFields.reviewCount         ?? 0,
    lapses:             stateFields.lapses              ?? 0,
    ratingHistory:      (stateFields.ratingHistory      || []).slice(-50),
    suspended:          stateFields.suspended           || false,
    buriedUntil:        stateFields.buriedUntil         || null,
    clozeIndex:         stateFields.clozeIndex          ?? null,
    sourceCardClientId: stateFields.sourceCardClientId  || null,
  }
  if (entityId) {
    await base44.entities.CardState.update(entityId, payload)
  } else {
    const created = await base44.entities.CardState.create({ ...payload, migrated: false })
    cardStateEntityIdMap.set(clientId, created.id)
  }
  cardStateMap.set(clientId, toAppCardState(payload))
  cardStateSnapshot.set(clientId, toAppCardState(payload))
}

/**
 * Batch-persist scheduling fields for all cards in updatedCards whose
 * CardState has changed since last sync. Called by Home.jsx after each
 * handleRate (via the debounced syncCardStates timer).
 */
export const syncCardStates = async (updatedCards) => {
  const ops = []
  for (const card of updatedCards) {
    const clientId = card.id
    const snap = cardStateSnapshot.get(clientId)
    const current = {
      stability:    card.stability    ?? null,
      difficulty:   card.difficulty   ?? null,
      interval:     card.interval     ?? 1,
      nextReview:   card.nextReview    || null,
      lastReview:   card.lastReview    || null,
      reviewCount:  card.reviewCount   ?? 0,
      lapses:       card.lapses        ?? 0,
      ratingHistory: (card.ratingHistory || []).slice(-50),
      suspended:    card.suspended     || false,
      buriedUntil:  card.buriedUntil   || null,
    }
    if (!snap || JSON.stringify(snap) !== JSON.stringify(current)) {
      ops.push(syncCardState(clientId, card))
    }
  }
  await Promise.all(ops)
}

/**
 * Returns the current UserSchedulerParams record, or null if none exists.
 */
export const getUserSchedulerParams = () => userSchedulerParams

/**
 * Create or update the UserSchedulerParams record.
 * params: array of FSRS parameter values (up to 19)
 * reviewCount: total review count at time of fit
 */
export const saveUserSchedulerParams = async (params, reviewCount) => {
  const payload = {
    params,
    lastFitDate:      new Date().toISOString().split('T')[0],
    reviewCountAtFit: reviewCount || 0,
    fitVersion:       'v1-retention-only',
  }
  if (userSchedulerParamsId) {
    await base44.entities.UserSchedulerParams.update(userSchedulerParamsId, payload)
  } else {
    const created = await base44.entities.UserSchedulerParams.create(payload)
    userSchedulerParamsId = created.id
  }
  userSchedulerParams = { ...payload, id: userSchedulerParamsId }
}

/**
 * Run the card-state split migration (migrateUp).
 * Idempotent: safe to call multiple times.
 */
export const runMigration = async () => {
  const { migrateUp } = await import('../../migrations/2026-04-26-split-card-state.js')
  return migrateUp(base44)
}

/**
 * Returns the current in-memory deckParentMap (Map<childTitle, parentTitle>).
 * Built in loadAll from parentDeckId relationships. Falls back to empty Map
 * if the deck-hierarchy migration has not run yet.
 */
export const getDeckParentMap = () => new Map(deckParentMapMemo)

/**
 * List all CardState records (used for auto-migration check on startup).
 */
export const listCardStates = async () => {
  return base44.entities.CardState.list().catch(() => [])
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
    intensity_score: entry.intensity_score ?? 0,
    status:         entry.status         || "complete",
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
