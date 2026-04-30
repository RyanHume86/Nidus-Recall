/**
 * Storage layer integration tests (Session 7c).
 * Target: 80% statements/branches on src/api/storage.js.
 * All Base44 entity calls are mocked via vi.hoisted().
 * loadAll() is called in beforeEach to reset all module-level Maps.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  Flashcard: {
    list:   vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    filter: vi.fn(),
  },
  Deck: {
    list:   vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  SessionLog: {
    list:   vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  CardState: {
    list:   vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  CardHistory: {
    filter: vi.fn(),
    create: vi.fn(),
  },
  UserSchedulerParams: {
    list:   vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock('@/api/base44Client', () => ({
  base44: {
    entities: {
      Flashcard:           mocks.Flashcard,
      Deck:                mocks.Deck,
      SessionLog:          mocks.SessionLog,
      CardState:           mocks.CardState,
      CardHistory:         mocks.CardHistory,
      UserSchedulerParams: mocks.UserSchedulerParams,
    },
  },
}))

import {
  loadAll, loadCardsPage,
  syncCards, syncCardState, syncCardStates,
  ensureDeck, appendLog, updateLog,
  adjustDeckCount, recalculateDeckCount,
  saveCardHistory, listCardHistory,
  getUserSchedulerParams, saveUserSchedulerParams,
  listCardStates, getDeckParentMap,
} from '@/api/storage'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mkDeckEntity = (overrides = {}) => ({
  id: 'deck-1', title: 'My Deck', card_count: 0, parentDeckId: null, ...overrides,
})

const mkCardEntity = (overrides = {}) => ({
  id: 'entity-1', clientId: 'client-1',
  front: 'What?', back: 'This.', deckId: 'deck-1',
  contentType: 'Factual', status: 'Active', cardType: 'basic',
  tags: [], created_date: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const mkCard = (overrides = {}) => ({
  id: 'client-1', front: 'What?', back: 'This.',
  deck: 'My Deck', contentType: 'Factual', status: 'Active', cardType: 'basic',
  tags: [], stability: null, difficulty: null, interval: 1,
  reviewCount: 0, lapses: 0, ratingHistory: [],
  nextReview: null, lastReview: null, elaboration: '',
  anchor: null, source: null, stakes_flag: false, connects_to: [],
  prerequisite_card_id: null, clozeText: null, clozeIndex: null,
  imageUrl: null, occlusionRegions: null, occlusionRegionId: null,
  suspended: false, buriedUntil: null,
  ...overrides,
})

// Reset all module-level Maps by calling loadAll with empty responses.
const emptyLoad = async () => {
  mocks.CardState.list.mockResolvedValue([])
  mocks.Deck.list.mockResolvedValue([])
  mocks.Flashcard.list.mockResolvedValue([])
  mocks.SessionLog.list.mockResolvedValue([])
  mocks.UserSchedulerParams.list.mockResolvedValue([])
  await loadAll()
}

beforeEach(async () => {
  vi.clearAllMocks()
  await emptyLoad()
})

// ── loadAll ───────────────────────────────────────────────────────────────────

describe('loadAll', () => {
  it('returns cards mapped from Flashcard entities', async () => {
    mocks.CardState.list.mockResolvedValue([])
    mocks.Deck.list.mockResolvedValue([mkDeckEntity()])
    mocks.Flashcard.list.mockResolvedValue([mkCardEntity()])
    mocks.SessionLog.list.mockResolvedValue([])
    mocks.UserSchedulerParams.list.mockResolvedValue([])

    const { cards } = await loadAll()

    expect(cards).toHaveLength(1)
    expect(cards[0].id).toBe('client-1')
    expect(cards[0].front).toBe('What?')
    expect(cards[0].deck).toBe('My Deck')
  })

  it('returns deckNames from Deck entities', async () => {
    mocks.CardState.list.mockResolvedValue([])
    mocks.Deck.list.mockResolvedValue([
      mkDeckEntity({ id: 'd1', title: 'Deck A' }),
      mkDeckEntity({ id: 'd2', title: 'Deck B' }),
    ])
    mocks.Flashcard.list.mockResolvedValue([])
    mocks.SessionLog.list.mockResolvedValue([])
    mocks.UserSchedulerParams.list.mockResolvedValue([])

    const { deckNames } = await loadAll()

    expect(deckNames).toEqual(['Deck A', 'Deck B'])
  })

  it('sorts log entries by date descending', async () => {
    mocks.CardState.list.mockResolvedValue([])
    mocks.Deck.list.mockResolvedValue([])
    mocks.Flashcard.list.mockResolvedValue([])
    mocks.SessionLog.list.mockResolvedValue([
      { id: 'l1', date: '2026-01-10', reviewed: 5, failed: 0, newAdded: 0, frictionNote: '', intensity_score: 0, status: 'complete' },
      { id: 'l2', date: '2026-01-15', reviewed: 8, failed: 1, newAdded: 0, frictionNote: '', intensity_score: 0, status: 'complete' },
    ])
    mocks.UserSchedulerParams.list.mockResolvedValue([])

    const { log } = await loadAll()

    expect(log[0].date).toBe('2026-01-15')
    expect(log[1].date).toBe('2026-01-10')
  })

  it('merges CardState scheduling fields into cards', async () => {
    const csEntity = {
      id: 'cs-1', cardClientId: 'client-1',
      stability: 3.5, difficulty: 5.0, interval: 7,
      nextReview: '2026-02-01', lastReview: '2026-01-25',
      reviewCount: 4, lapses: 0, ratingHistory: [],
      suspended: false, buriedUntil: null,
      clozeIndex: null, sourceCardClientId: null,
    }
    mocks.CardState.list.mockResolvedValue([csEntity])
    mocks.Deck.list.mockResolvedValue([mkDeckEntity()])
    mocks.Flashcard.list.mockResolvedValue([mkCardEntity()])
    mocks.SessionLog.list.mockResolvedValue([])
    mocks.UserSchedulerParams.list.mockResolvedValue([])

    const { cards } = await loadAll()

    expect(cards[0].stability).toBe(3.5)
    expect(cards[0].interval).toBe(7)
    expect(cards[0].nextReview).toBe('2026-02-01')
  })

  it('sets hasMore=true when exactly 200 cards are returned', async () => {
    const entities = Array.from({ length: 200 }, (_, i) =>
      mkCardEntity({ id: `e${i}`, clientId: `c${i}` })
    )
    mocks.CardState.list.mockResolvedValue([])
    mocks.Deck.list.mockResolvedValue([mkDeckEntity()])
    mocks.Flashcard.list.mockResolvedValue(entities)
    mocks.SessionLog.list.mockResolvedValue([])
    mocks.UserSchedulerParams.list.mockResolvedValue([])

    const { hasMore } = await loadAll()

    expect(hasMore).toBe(true)
  })

  it('builds deckParentMap from parentDeckId relationships', async () => {
    mocks.CardState.list.mockResolvedValue([])
    mocks.Deck.list.mockResolvedValue([
      { id: 'p1', title: 'Parent', card_count: 0 },
      { id: 'c1', title: 'Child',  card_count: 0, parentDeckId: 'p1' },
    ])
    mocks.Flashcard.list.mockResolvedValue([])
    mocks.SessionLog.list.mockResolvedValue([])
    mocks.UserSchedulerParams.list.mockResolvedValue([])

    const { deckParentMap } = await loadAll()

    expect(deckParentMap.get('Child')).toBe('Parent')
  })

  it('loads UserSchedulerParams when a record exists', async () => {
    const params = { id: 'usp-1', params: [0.4, 0.6], lastFitDate: '2026-01-01', reviewCountAtFit: 50, fitVersion: 'v1' }
    mocks.CardState.list.mockResolvedValue([])
    mocks.Deck.list.mockResolvedValue([])
    mocks.Flashcard.list.mockResolvedValue([])
    mocks.SessionLog.list.mockResolvedValue([])
    mocks.UserSchedulerParams.list.mockResolvedValue([params])

    await loadAll()

    expect(getUserSchedulerParams()).toEqual(params)
  })

  it('returns hasMore=false when fewer than 200 cards are returned', async () => {
    mocks.CardState.list.mockResolvedValue([])
    mocks.Deck.list.mockResolvedValue([mkDeckEntity()])
    mocks.Flashcard.list.mockResolvedValue([mkCardEntity()])
    mocks.SessionLog.list.mockResolvedValue([])
    mocks.UserSchedulerParams.list.mockResolvedValue([])

    const { hasMore } = await loadAll()

    expect(hasMore).toBe(false)
  })
})

// ── loadCardsPage ─────────────────────────────────────────────────────────────

describe('loadCardsPage', () => {
  it('fetches a page of cards with the given skip offset', async () => {
    mocks.CardState.list.mockResolvedValue([])
    mocks.Deck.list.mockResolvedValue([mkDeckEntity()])
    mocks.Flashcard.list.mockResolvedValue([])
    mocks.SessionLog.list.mockResolvedValue([])
    mocks.UserSchedulerParams.list.mockResolvedValue([])
    await loadAll()

    mocks.Flashcard.list.mockResolvedValue([mkCardEntity({ id: 'e2', clientId: 'c2' })])

    const { cards, hasMore } = await loadCardsPage(200)

    expect(mocks.Flashcard.list).toHaveBeenCalledWith(undefined, 500, 200)
    expect(cards).toHaveLength(1)
    expect(hasMore).toBe(false)
  })

  it('sets hasMore=true when returned count equals the page limit', async () => {
    const entities = Array.from({ length: 500 }, (_, i) =>
      mkCardEntity({ id: `e${i}`, clientId: `c${i}` })
    )
    mocks.Flashcard.list.mockResolvedValue(entities)

    const { hasMore } = await loadCardsPage(200)

    expect(hasMore).toBe(true)
  })
})

// ── ensureDeck ────────────────────────────────────────────────────────────────

describe('ensureDeck', () => {
  it('creates a new deck and returns its entity id', async () => {
    mocks.Deck.create.mockResolvedValue({ id: 'new-deck' })

    const id = await ensureDeck('New Deck')

    expect(mocks.Deck.create).toHaveBeenCalledWith({ title: 'New Deck' })
    expect(id).toBe('new-deck')
  })

  it('returns the cached id on a second call without creating again', async () => {
    mocks.Deck.create.mockResolvedValue({ id: 'new-deck' })

    await ensureDeck('New Deck')
    const id2 = await ensureDeck('New Deck')

    expect(mocks.Deck.create).toHaveBeenCalledTimes(1)
    expect(id2).toBe('new-deck')
  })

  it('deduplicates concurrent calls for the same deck name', async () => {
    mocks.Deck.create.mockResolvedValue({ id: 'concurrent-deck' })

    const [id1, id2] = await Promise.all([
      ensureDeck('Concurrent'),
      ensureDeck('Concurrent'),
    ])

    expect(mocks.Deck.create).toHaveBeenCalledTimes(1)
    expect(id1).toBe('concurrent-deck')
    expect(id2).toBe('concurrent-deck')
  })

  it('returns id from deckNameToId if already populated by loadAll', async () => {
    mocks.CardState.list.mockResolvedValue([])
    mocks.Deck.list.mockResolvedValue([mkDeckEntity({ id: 'existing-1', title: 'My Deck' })])
    mocks.Flashcard.list.mockResolvedValue([])
    mocks.SessionLog.list.mockResolvedValue([])
    mocks.UserSchedulerParams.list.mockResolvedValue([])
    await loadAll()

    const id = await ensureDeck('My Deck')

    expect(mocks.Deck.create).not.toHaveBeenCalled()
    expect(id).toBe('existing-1')
  })
})

// ── syncCards ─────────────────────────────────────────────────────────────────

describe('syncCards', () => {
  const loadDeckAndCard = async () => {
    mocks.CardState.list.mockResolvedValue([])
    mocks.Deck.list.mockResolvedValue([mkDeckEntity()])
    mocks.Flashcard.list.mockResolvedValue([mkCardEntity()])
    mocks.SessionLog.list.mockResolvedValue([])
    mocks.UserSchedulerParams.list.mockResolvedValue([])
    await loadAll()
  }

  it('creates a new card not yet in entityIdMap', async () => {
    mocks.Deck.create.mockResolvedValue({ id: 'deck-1' })
    mocks.Flashcard.create.mockResolvedValue({ id: 'entity-new' })

    await syncCards([mkCard({ id: 'new-client', deck: 'New Deck' })])

    expect(mocks.Flashcard.create).toHaveBeenCalled()
    expect(mocks.Flashcard.create.mock.calls[0][0].clientId).toBe('new-client')
  })

  it('updates an existing card when content changes', async () => {
    await loadDeckAndCard()
    mocks.Flashcard.update.mockResolvedValue({})

    await syncCards([mkCard({ front: 'Updated question?' })])

    expect(mocks.Flashcard.update).toHaveBeenCalledWith(
      'entity-1',
      expect.objectContaining({ front: 'Updated question?' })
    )
  })

  it('deletes a card that is no longer in the updated list', async () => {
    await loadDeckAndCard()
    mocks.Flashcard.delete.mockResolvedValue({})

    await syncCards([])

    expect(mocks.Flashcard.delete).toHaveBeenCalledWith('entity-1')
  })

  it('handles multiple new cards in a single sync call', async () => {
    mocks.Deck.create.mockResolvedValue({ id: 'deck-1' })
    mocks.Flashcard.create.mockResolvedValue({ id: 'entity-new' })

    await syncCards([
      mkCard({ id: 'c1', deck: 'D1' }),
      mkCard({ id: 'c2', deck: 'D1' }),
    ])

    expect(mocks.Flashcard.create).toHaveBeenCalledTimes(2)
  })

  it('serialises concurrent calls so they do not race', async () => {
    mocks.Deck.create.mockResolvedValue({ id: 'deck-1' })
    mocks.Flashcard.create.mockResolvedValue({ id: 'entity-new' })

    const p1 = syncCards([mkCard({ id: 'c1', deck: 'D' })])
    const p2 = syncCards([mkCard({ id: 'c2', deck: 'D' })])

    await Promise.all([p1, p2])

    expect(mocks.Flashcard.create).toHaveBeenCalledTimes(2)
  })
})

// ── syncCardState ─────────────────────────────────────────────────────────────

describe('syncCardState', () => {
  it('creates a new CardState when none exists for the clientId', async () => {
    mocks.CardState.create.mockResolvedValue({ id: 'cs-new' })

    await syncCardState('client-1', { stability: 2.5, reviewCount: 1, interval: 3 })

    expect(mocks.CardState.create).toHaveBeenCalledWith(
      expect.objectContaining({ cardClientId: 'client-1', stability: 2.5 })
    )
  })

  it('updates an existing CardState when one was loaded via loadAll', async () => {
    const csEntity = {
      id: 'cs-1', cardClientId: 'client-1',
      stability: 1.0, difficulty: 5.0, interval: 1,
      nextReview: null, lastReview: null,
      reviewCount: 0, lapses: 0, ratingHistory: [],
      suspended: false, buriedUntil: null,
      clozeIndex: null, sourceCardClientId: null,
    }
    mocks.CardState.list.mockResolvedValue([csEntity])
    mocks.Deck.list.mockResolvedValue([])
    mocks.Flashcard.list.mockResolvedValue([])
    mocks.SessionLog.list.mockResolvedValue([])
    mocks.UserSchedulerParams.list.mockResolvedValue([])
    await loadAll()

    mocks.CardState.update.mockResolvedValue({})

    await syncCardState('client-1', { stability: 4.0, reviewCount: 3, interval: 7 })

    expect(mocks.CardState.update).toHaveBeenCalledWith(
      'cs-1',
      expect.objectContaining({ stability: 4.0 })
    )
  })

  it('truncates ratingHistory to the last 50 entries', async () => {
    mocks.CardState.create.mockResolvedValue({ id: 'cs-new' })
    const longHistory = Array.from({ length: 60 }, (_, i) => i)

    await syncCardState('client-1', { ratingHistory: longHistory })

    const payload = mocks.CardState.create.mock.calls[0][0]
    expect(payload.ratingHistory).toHaveLength(50)
  })
})

// ── syncCardStates ────────────────────────────────────────────────────────────

describe('syncCardStates', () => {
  it('creates a CardState for a card with no existing snapshot', async () => {
    mocks.CardState.create.mockResolvedValue({ id: 'cs-new' })

    const card = mkCard({ stability: 3.0, reviewCount: 2, interval: 5 })
    await syncCardStates([card])

    expect(mocks.CardState.create).toHaveBeenCalled()
  })

  it('processes multiple cards in parallel', async () => {
    mocks.CardState.create.mockResolvedValue({ id: 'cs-new' })

    await syncCardStates([
      mkCard({ id: 'c1' }),
      mkCard({ id: 'c2' }),
    ])

    expect(mocks.CardState.create).toHaveBeenCalledTimes(2)
  })
})

// ── appendLog ─────────────────────────────────────────────────────────────────

describe('appendLog', () => {
  it('creates a SessionLog entity with mapped fields', async () => {
    mocks.SessionLog.create.mockResolvedValue({ id: 'log-1' })
    const entry = {
      date: '2026-04-30', reviewed: 10, failed: 2,
      newAdded: 3, frictionNote: 'Hard', intensity_score: 7, status: 'complete',
    }

    const result = await appendLog(entry)

    expect(mocks.SessionLog.create).toHaveBeenCalledWith(entry)
    expect(result).toEqual({ id: 'log-1' })
  })
})

// ── updateLog ─────────────────────────────────────────────────────────────────

describe('updateLog', () => {
  it('calls SessionLog.update with the entity id and updates', async () => {
    mocks.SessionLog.update.mockResolvedValue({})

    await updateLog('log-1', { status: 'complete' })

    expect(mocks.SessionLog.update).toHaveBeenCalledWith('log-1', { status: 'complete' })
  })
})

// ── adjustDeckCount ───────────────────────────────────────────────────────────

describe('adjustDeckCount', () => {
  const loadWithDeck = async (card_count = 5) => {
    mocks.CardState.list.mockResolvedValue([])
    mocks.Deck.list.mockResolvedValue([mkDeckEntity({ card_count })])
    mocks.Flashcard.list.mockResolvedValue([])
    mocks.SessionLog.list.mockResolvedValue([])
    mocks.UserSchedulerParams.list.mockResolvedValue([])
    await loadAll()
  }

  it('increments the deck count and calls Deck.update', async () => {
    await loadWithDeck(5)
    mocks.Deck.update.mockResolvedValue({})

    await adjustDeckCount('My Deck', 1)

    expect(mocks.Deck.update).toHaveBeenCalledWith('deck-1', { card_count: 6 })
  })

  it('is a no-op for an unknown deck title', async () => {
    await adjustDeckCount('Unknown Deck', 1)

    expect(mocks.Deck.update).not.toHaveBeenCalled()
  })

  it('floors the count at 0 when decrementing below zero', async () => {
    await loadWithDeck(0)
    mocks.Deck.update.mockResolvedValue({})

    await adjustDeckCount('My Deck', -5)

    expect(mocks.Deck.update).toHaveBeenCalledWith('deck-1', { card_count: 0 })
  })
})

// ── recalculateDeckCount ──────────────────────────────────────────────────────

describe('recalculateDeckCount', () => {
  const loadWithDeck = async () => {
    mocks.CardState.list.mockResolvedValue([])
    mocks.Deck.list.mockResolvedValue([mkDeckEntity()])
    mocks.Flashcard.list.mockResolvedValue([])
    mocks.SessionLog.list.mockResolvedValue([])
    mocks.UserSchedulerParams.list.mockResolvedValue([])
    await loadAll()
  }

  it('counts only Active cards for the given deck', async () => {
    await loadWithDeck()
    mocks.Deck.update.mockResolvedValue({})

    const allCards = [
      { id: 'c1', deck: 'My Deck', status: 'Active' },
      { id: 'c2', deck: 'My Deck', status: 'Archived' },
      { id: 'c3', deck: 'My Deck', status: 'Active' },
      { id: 'c4', deck: 'Other',   status: 'Active' },
    ]

    await recalculateDeckCount('My Deck', allCards)

    expect(mocks.Deck.update).toHaveBeenCalledWith('deck-1', { card_count: 2 })
  })

  it('is a no-op for an unknown deck title', async () => {
    await recalculateDeckCount('Unknown', [])
    expect(mocks.Deck.update).not.toHaveBeenCalled()
  })
})

// ── saveCardHistory ───────────────────────────────────────────────────────────

describe('saveCardHistory', () => {
  it('creates a version-1 record for the first history entry', async () => {
    mocks.CardHistory.filter.mockResolvedValue([])
    mocks.CardHistory.create.mockResolvedValue({ id: 'hist-1' })

    await saveCardHistory('card-1', { front: 'Q', back: 'A' }, 'ai', 'claude-sonnet')

    expect(mocks.CardHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        card_id: 'card-1',
        version: 1,
        modified_by: 'ai',
        ai_model_used: 'claude-sonnet',
      })
    )
  })

  it('increments the version beyond the current maximum', async () => {
    mocks.CardHistory.filter.mockResolvedValue([{ version: 3 }, { version: 1 }])
    mocks.CardHistory.create.mockResolvedValue({ id: 'hist-4' })

    await saveCardHistory('card-1', { front: 'Q', back: 'A' })

    expect(mocks.CardHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ version: 4 })
    )
  })
})

// ── listCardHistory ───────────────────────────────────────────────────────────

describe('listCardHistory', () => {
  it('returns records sorted by version descending', async () => {
    mocks.CardHistory.filter.mockResolvedValue([
      { id: 'h1', version: 1 },
      { id: 'h3', version: 3 },
      { id: 'h2', version: 2 },
    ])

    const records = await listCardHistory('card-1')

    expect(records.map(r => r.version)).toEqual([3, 2, 1])
  })

  it('filters by card_id', async () => {
    mocks.CardHistory.filter.mockResolvedValue([])

    await listCardHistory('card-99')

    expect(mocks.CardHistory.filter).toHaveBeenCalledWith({ card_id: 'card-99' })
  })
})

// ── getUserSchedulerParams / saveUserSchedulerParams ──────────────────────────

describe('getUserSchedulerParams', () => {
  it('returns null before any params have been loaded', () => {
    expect(getUserSchedulerParams()).toBeNull()
  })
})

describe('saveUserSchedulerParams', () => {
  it('creates a new record when none exists', async () => {
    mocks.UserSchedulerParams.create.mockResolvedValue({ id: 'usp-1' })

    await saveUserSchedulerParams([0.4, 0.6, 2.1], 100)

    expect(mocks.UserSchedulerParams.create).toHaveBeenCalledWith(
      expect.objectContaining({ params: [0.4, 0.6, 2.1], reviewCountAtFit: 100 })
    )
  })

  it('updates the existing record when one was loaded via loadAll', async () => {
    const existing = { id: 'usp-1', params: [0.4], lastFitDate: '2026-01-01', reviewCountAtFit: 50, fitVersion: 'v1' }
    mocks.CardState.list.mockResolvedValue([])
    mocks.Deck.list.mockResolvedValue([])
    mocks.Flashcard.list.mockResolvedValue([])
    mocks.SessionLog.list.mockResolvedValue([])
    mocks.UserSchedulerParams.list.mockResolvedValue([existing])
    await loadAll()

    mocks.UserSchedulerParams.update.mockResolvedValue({})

    await saveUserSchedulerParams([0.5, 0.7], 200)

    expect(mocks.UserSchedulerParams.update).toHaveBeenCalledWith(
      'usp-1',
      expect.objectContaining({ params: [0.5, 0.7], reviewCountAtFit: 200 })
    )
  })
})

// ── listCardStates ────────────────────────────────────────────────────────────

describe('listCardStates', () => {
  it('returns CardState records from CardState.list', async () => {
    const states = [{ id: 'cs-1', cardClientId: 'c1', migrated: true }]
    mocks.CardState.list.mockResolvedValue(states)

    const result = await listCardStates()

    expect(mocks.CardState.list).toHaveBeenCalled()
    expect(result).toEqual(states)
  })

  it('returns empty array when CardState.list rejects', async () => {
    mocks.CardState.list.mockRejectedValue(new Error('fail'))

    const result = await listCardStates()

    expect(result).toEqual([])
  })
})

// ── getDeckParentMap ──────────────────────────────────────────────────────────

describe('getDeckParentMap', () => {
  it('returns an empty map before any deck hierarchy is loaded', () => {
    expect(getDeckParentMap().size).toBe(0)
  })

  it('returns the deckParentMap built during loadAll', async () => {
    mocks.CardState.list.mockResolvedValue([])
    mocks.Deck.list.mockResolvedValue([
      { id: 'p1', title: 'Parent', card_count: 0 },
      { id: 'c1', title: 'Child',  card_count: 0, parentDeckId: 'p1' },
    ])
    mocks.Flashcard.list.mockResolvedValue([])
    mocks.SessionLog.list.mockResolvedValue([])
    mocks.UserSchedulerParams.list.mockResolvedValue([])
    await loadAll()

    const map = getDeckParentMap()

    expect(map.get('Child')).toBe('Parent')
  })

  it('returns a copy so mutations do not affect the internal map', async () => {
    const map = getDeckParentMap()
    map.set('Fake', 'Parent')
    expect(getDeckParentMap().has('Fake')).toBe(false)
  })
})
