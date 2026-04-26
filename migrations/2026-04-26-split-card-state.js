// Migration: 2026-04-26-split-card-state
// Purpose: Move FSRS scheduling fields from Flashcard to new CardState entity.
// Idempotent: checks migrated flag before creating CardState records.
// Reversible: migrateDown reads CardState and writes fields back to Flashcard.

export async function migrateUp(base44) {
  const cards = await base44.entities.Flashcard.list()
  const existingStates = await base44.entities.CardState.list()
  const migratedIds = new Set(existingStates.filter(s => s.migrated).map(s => s.cardClientId))

  let created = 0, skipped = 0
  for (const card of cards) {
    const clientId = card.clientId || card.id
    if (migratedIds.has(clientId)) { skipped++; continue }

    await base44.entities.CardState.create({
      cardClientId:  clientId,
      stability:     card.stability     ?? null,
      difficulty:    card.difficulty    ?? null,
      interval:      card.interval      ?? 1,
      nextReview:    card.nextReview     || null,
      lastReview:    card.lastReview     || null,
      reviewCount:   card.reviewCount    ?? 0,
      lapses:        card.lapses         ?? 0,
      ratingHistory: (card.ratingHistory || []).slice(-50),
      suspended:     false,
      buriedUntil:   null,
      migrated:      true,
    })
    created++
  }

  return { created, skipped, total: cards.length }
}

export async function migrateDown(base44) {
  // Reverse: copy CardState fields back onto Flashcard records.
  const states = await base44.entities.CardState.list()
  const stateMap = new Map(states.map(s => [s.cardClientId, s]))
  const cards = await base44.entities.Flashcard.list()

  let updated = 0
  for (const card of cards) {
    const clientId = card.clientId || card.id
    const state = stateMap.get(clientId)
    if (!state) continue
    await base44.entities.Flashcard.update(card.id, {
      stability:     state.stability,
      difficulty:    state.difficulty,
      interval:      state.interval,
      nextReview:    state.nextReview,
      lastReview:    state.lastReview,
      reviewCount:   state.reviewCount,
      lapses:        state.lapses,
      ratingHistory: state.ratingHistory,
    })
    updated++
  }
  return { updated }
}
