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
import { requireAuth } from "@/lib/api/withAuth"

// ── In-memory state (rebuilt on each loadAll call) ────────────────────────────
let entityIdMap      = new Map()  // clientId  to Base44 entity id
let entityToClientMap = new Map() // Base44 entity id to clientId (reverse of entityIdMap)
let cardSnapshot = new Map()  // clientId  to last-synced card object (for diffing)
let deckNameToId = new Map()  // deckTitle to Base44 Deck entity id
let deckPending  = new Map()  // deckTitle to in-flight Deck.create Promise
let deckParentMapMemo = new Map()  // childDeckTitle to parentDeckTitle (from parentDeckId)

// Image entity cache (imageEntityId → image record)
let imageMap = new Map()

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
  requireAuth('create deck')
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
    imageId:              entity.imageId               || null,
    review_status:        entity.review_status         || 'unreviewed',
    accuracy_date:        entity.accuracy_date         || null,
    accuracy_reviewer:    entity.accuracy_reviewer     || null,
    guideline_version:    entity.guideline_version     || null,
    // Merge from Image entity when imageId present; fall back to inline fields (legacy cards)
    imageUrl:             entity.imageId
                            ? (imageMap.get(entity.imageId)?.url || null)
                            : (entity.imageUrl || null),
    occlusionRegions:     entity.imageId
                            ? (imageMap.get(entity.imageId)?.occlusionRegions || null)
                            : (entity.occlusionRegions || null),
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
  // Translate prerequisite clientId → entity ID for storage. Falls back to
  // storing the clientId when the entity hasn't been synced yet (new card flow).
  prerequisite_card_id: card.prerequisite_card_id
    ? (entityIdMap.get(card.prerequisite_card_id) || card.prerequisite_card_id)
    : null,
  cardType:             card.cardType             || "basic",
  clozeText:            card.clozeText             || null,
  clozeIndex:           card.clozeIndex            ?? null,
  imageId:              card.imageId               || null,
  review_status:        card.review_status         || 'unreviewed',
  accuracy_date:        card.accuracy_date         || null,
  accuracy_reviewer:    card.accuracy_reviewer     || null,
  guideline_version:    card.guideline_version     || null,
  // Only store inline for legacy cards without an imageId reference
  imageUrl:             card.imageId ? null : (card.imageUrl || null),
  occlusionRegions:     card.imageId ? null : (card.occlusionRegions || null),
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
  entityToClientMap.clear()
  cardSnapshot.clear()
  deckNameToId.clear()
  deckPending.clear()
  deckParentMapMemo.clear()
  cardStateMap.clear()
  cardStateEntityIdMap.clear()
  cardStateSnapshot.clear()
  imageMap.clear()
  userSchedulerParams = null
  userSchedulerParamsId = null
  syncLock = Promise.resolve()

  // Load Image entities first so toAppCard can merge imageUrl/occlusionRegions from imageId
  const imageEntities = await base44.entities.Image.list().catch(() => [])
  for (const img of imageEntities) imageMap.set(img.id, img)

  // Load CardState first so toAppCard can merge it
  const cardStateEntities = await base44.entities.CardState.list().catch(() => [])
  for (const cs of cardStateEntities) {
    cardStateMap.set(cs.cardClientId, toAppCardState(cs))
    cardStateEntityIdMap.set(cs.cardClientId, cs.id)
    cardStateSnapshot.set(cs.cardClientId, toAppCardState(cs))
  }

  const INIT_LIMIT = 200
  const [deckEntities, cardEntities, logEntities] = await Promise.all([
    base44.entities.Deck.list(),
    base44.entities.Flashcard.list(undefined, INIT_LIMIT, 0),
    base44.entities.SessionLog.list(),
  ])
  const hasMore = cardEntities.length >= INIT_LIMIT

  // Build deck lookup maps; parentDeckId is available on deck entities after migration.
  for (const d of deckEntities) {
    deckNameToId.set(d.title, d.id)
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
    entityToClientMap.set(e.id, card.id)
    cardSnapshot.set(card.id, { ...card })
    return card
  })

  // Translate prerequisite_card_id from stored entity IDs back to clientIds.
  // Legacy records that already store clientIds will pass through unchanged
  // (entityToClientMap won't find them, so we fall back to the stored value).
  for (const card of cards) {
    if (card.prerequisite_card_id) {
      const clientId = entityToClientMap.get(card.prerequisite_card_id)
      if (clientId) card.prerequisite_card_id = clientId
    }
  }

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
      intensity_score:      e.intensity_score      ?? 0,
      status:               e.status               || "complete",
      ratingBreakdown:      e.ratingBreakdown      || { again:0, hard:0, good:0, easy:0 },
      contentTypeBreakdown: e.contentTypeBreakdown || {},
      fatigueFlag:          e.fatigueFlag          || false,
      focusedFlag:          e.focusedFlag          || false,
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  const deckNames = deckEntities.map(d => d.title)

  // Load UserSchedulerParams (at most one record)
  const paramRecords = await base44.entities.UserSchedulerParams.list().catch(() => [])
  if (paramRecords.length > 0) {
    userSchedulerParams   = paramRecords[0]
    userSchedulerParamsId = paramRecords[0].id
  }

  return { cards, deckNames, log, deckParentMap: new Map(deckParentMapMemo), hasMore }
}

/**
 * Fetch a page of cards for background progressive loading.
 * CardState is already populated from loadAll; toAppCard will merge it.
 */
export const loadCardsPage = async (skip, limit = 500) => {
  const entities = await base44.entities.Flashcard.list(undefined, limit, skip)
  const cards = entities.map(e => {
    const card = toAppCard(e)
    entityIdMap.set(card.id, e.id)
    entityToClientMap.set(e.id, card.id)
    cardSnapshot.set(card.id, { ...card })
    return card
  })
  for (const card of cards) {
    if (card.prerequisite_card_id) {
      const clientId = entityToClientMap.get(card.prerequisite_card_id)
      if (clientId) card.prerequisite_card_id = clientId
    }
  }
  return { cards, hasMore: entities.length >= limit }
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
  requireAuth('sync cards')
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
        entityToClientMap.set(entity.id, card.id)
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
 * Persist scheduling fields for a single card to the CardState entity.
 * Creates a new CardState record if one does not exist yet (e.g. for a newly
 * created card that has not been migrated). Skips write if nothing changed.
 */
export const syncCardState = async (clientId, stateFields) => {
  requireAuth('sync card state')
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
  requireAuth('save scheduler params')
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
 * Delete all data owned by the current user across every entity.
 * Called from the "Delete my account" flow in Settings > Privacy.
 * Row-Level Security ensures only the caller's own records are touched.
 * The account record itself is removed by Base44 within 30 days.
 */
export const deleteAllUserData = async () => {
  requireAuth('delete user data')
  const ENTITIES = ['Flashcard', 'Deck', 'SessionLog', 'CardState', 'CardHistory', 'UserSchedulerParams', 'Image']
  for (const name of ENTITIES) {
    try {
      const entity = base44.entities[name]
      if (!entity) continue
      const listFn = entity.list || entity.filter
      if (!listFn) continue
      const records = await listFn.call(entity, {}).catch(() => [])
      const deleteFn = entity.delete
      if (!deleteFn) continue
      await Promise.all(records.map(r => deleteFn.call(entity, r.id).catch(() => {})))
    } catch (_) {
      // Best-effort: continue deleting other entities even if one fails
    }
  }
}

/**
 * Persist a compressed image to the Image entity.
 * Returns the created entity (with .id = imageEntityId).
 */
export const saveImage = async (imageData) => {
  requireAuth('save image')
  const entity = await base44.entities.Image.create({
    url:              imageData.url,
    mimeType:         imageData.mimeType         || 'image/jpeg',
    width:            imageData.width            ?? null,
    height:           imageData.height           ?? null,
    altText:          imageData.altText          || null,
    occlusionRegions: imageData.occlusionRegions || [],
    linkedCardIds:    imageData.linkedCardIds    || [],
  })
  imageMap.set(entity.id, entity)
  return entity
}

/**
 * Update the linkedCardIds on an Image entity after its occlusion cards are created.
 */
export const updateImageLinkedCards = async (imageEntityId, linkedCardIds) => {
  requireAuth('update image')
  await base44.entities.Image.update(imageEntityId, { linkedCardIds })
  const existing = imageMap.get(imageEntityId)
  if (existing) imageMap.set(imageEntityId, { ...existing, linkedCardIds })
}

/**
 * Append a completed session entry to Base44. Returns the created entity.
 */
export const appendLog = async (entry) => {
  requireAuth('append session log')
  const entity = await base44.entities.SessionLog.create({
    date:                entry.date,
    reviewed:            entry.reviewed             || 0,
    failed:              entry.failed               || 0,
    newAdded:            entry.newAdded             || 0,
    frictionNote:        entry.frictionNote         || "",
    intensity_score:     entry.intensity_score      ?? 0,
    status:              entry.status               || "complete",
    ratingBreakdown:     entry.ratingBreakdown      || { again:0, hard:0, good:0, easy:0 },
    contentTypeBreakdown: entry.contentTypeBreakdown || {},
    fatigueFlag:         entry.fatigueFlag          || false,
    focusedFlag:         entry.focusedFlag          || false,
  })
  return entity
}

/**
 * Update an existing session log entry.
 */
export const updateLog = async (entityId, updates) => {
  requireAuth('update session log')
  await base44.entities.SessionLog.update(entityId, updates)
}

// ── CardHistory helpers ────────────────────────────────────────────────────────

/**
 * Save a CardHistory record for an AI-edited card.
 * Reads existing records to compute the next sequential version number.
 */
export const saveCardHistory = async (cardId, snapshot, modifiedBy = 'ai', aiModel = null) => {
  requireAuth('save card history')
  let version = 1
  try {
    const existing = await base44.entities.CardHistory.filter({ card_id: cardId })
    if (existing.length) version = Math.max(...existing.map(e => e.version || 0)) + 1
  } catch (_) { /* entity may not exist yet on first use -- version stays 1 */ }
  return base44.entities.CardHistory.create({
    card_id: cardId,
    version,
    content_snapshot: snapshot,
    modified_by: modifiedBy,
    modified_at: new Date().toISOString(),
    ai_model_used: aiModel ?? null,
  })
}

/**
 * List all CardHistory records for a card, newest first.
 */
export const listCardHistory = async (cardId) => {
  const records = await base44.entities.CardHistory.filter({ card_id: cardId })
  return records.sort((a, b) => (b.version || 0) - (a.version || 0))
}
