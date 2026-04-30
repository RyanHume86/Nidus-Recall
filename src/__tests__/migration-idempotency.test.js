/**
 * Migration idempotency tests (Session 7b).
 *
 * Verifies:
 *   1-3. split-card-state: second migrateUp is a no-op; mixed fixture handled
 *        correctly; migrateDown round-trip is shape-equivalent.
 *   4-6. deck-hierarchy: same three guarantees.
 *   7.   getMigrationStatus returns correct counts for a known fixture.
 *   8.   runMigration canonical order: split-card-state completes before
 *        deck-hierarchy begins.
 *   9.   appStore.init calls runMigration when the 24h cache is stale.
 *  10.   appStore.init skips runMigration when the 24h cache is fresh.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { migrateUp as splitUp, migrateDown as splitDown }
  from '../../migrations/2026-04-26-split-card-state.js'
import { migrateUp as hierarchyUp, migrateDown as hierarchyDown }
  from '../../migrations/2026-04-26-deck-hierarchy.js'

// Must appear before any import that transitively loads these modules.

vi.mock('@/api/base44Client', () => ({
  base44: {
    entities: {
      Flashcard: {
        list:   vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation(async d => ({ id: `flash-${Math.random()}`, ...d })),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
      CardState: {
        list:   vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation(async d => ({ id: `cs-${d.cardClientId}`, ...d })),
        update: vi.fn().mockResolvedValue({}),
      },
      Deck: {
        list:   vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation(async d => ({ id: `dk-${Math.random()}`, ...d })),
        update: vi.fn().mockResolvedValue({}),
      },
      SessionLog:          { list: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}) },
      UserSchedulerParams: { list: vi.fn().mockResolvedValue([]) },
    },
  },
}))

vi.mock('@/lib/offline-store', () => ({
  seedFromNetwork: vi.fn().mockResolvedValue(undefined),
  onReconnect:     vi.fn().mockReturnValue(() => {}),
}))

vi.mock('@/api/notionSettings', () => ({
  migrateNotionCredentials: vi.fn().mockResolvedValue(undefined),
}))

import { base44 } from '@/api/base44Client'
import * as storage from '@/api/storage'
import { useAppStore } from '@/store/appStore'

// ── Fixture helpers ───────────────────────────────────────────────────────────

const mkFlashcard = (id, overrides = {}) => ({
  id, clientId: id,
  front: `Front ${id}`, back: `Back ${id}`,
  stability: 4.5, difficulty: 5.5, interval: 5,
  nextReview: '2026-04-20', lastReview: '2026-04-15',
  reviewCount: 3, lapses: 0, ratingHistory: [],
  ...overrides,
})

const mkCardState = (cardClientId, overrides = {}) => ({
  id: `cs-${cardClientId}`, cardClientId, migrated: true,
  stability: 4.5, difficulty: 5.5, interval: 5,
  nextReview: '2026-04-20', lastReview: '2026-04-15',
  reviewCount: 3, lapses: 0, ratingHistory: [],
  suspended: false, buriedUntil: null,
  ...overrides,
})

const mkDeck = (title, overrides = {}) => ({
  id: `dk-${title}`, title, card_count: 0, parentDeckId: null,
  ...overrides,
})

// ── split-card-state: migrateUp ───────────────────────────────────────────────

describe('split-card-state: migrateUp', () => {
  it('second call is a no-op: creates 0 CardStates on repeat', async () => {
    const card = mkFlashcard('c1')
    const fakeBase44 = {
      entities: {
        Flashcard: { list: vi.fn().mockResolvedValue([card]) },
        CardState: {
          list:   vi.fn().mockResolvedValue([mkCardState('c1')]),
          create: vi.fn(),
        },
      },
    }

    const result = await splitUp(fakeBase44)
    expect(result).toEqual({ created: 0, skipped: 1, total: 1 })
    expect(fakeBase44.entities.CardState.create).not.toHaveBeenCalled()
  })

  it('mixed fixture: only touches the unmigrated subset', async () => {
    const cards = [mkFlashcard('c1'), mkFlashcard('c2'), mkFlashcard('c3')]
    const fakeBase44 = {
      entities: {
        Flashcard: { list: vi.fn().mockResolvedValue(cards) },
        CardState: {
          list:   vi.fn().mockResolvedValue([mkCardState('c1')]),
          create: vi.fn().mockImplementation(async d => ({ id: `cs-${d.cardClientId}`, ...d })),
        },
      },
    }

    const result = await splitUp(fakeBase44)
    expect(result).toEqual({ created: 2, skipped: 1, total: 3 })

    const createdIds = fakeBase44.entities.CardState.create.mock.calls.map(c => c[0].cardClientId)
    expect(createdIds).not.toContain('c1')
    expect(createdIds).toContain('c2')
    expect(createdIds).toContain('c3')
  })
})

// ── split-card-state: migrateDown round-trip ──────────────────────────────────

describe('split-card-state: migrateDown round-trip', () => {
  it('migrateDown after migrateUp returns shape-equivalent data', async () => {
    const card = mkFlashcard('c1')
    let cardStates = []

    const fakeBase44 = {
      entities: {
        Flashcard: {
          list:   vi.fn().mockResolvedValue([card]),
          update: vi.fn().mockResolvedValue({}),
        },
        CardState: {
          list: vi.fn().mockImplementation(async () => cardStates),
          create: vi.fn().mockImplementation(async d => {
            const state = { id: `cs-${d.cardClientId}`, ...d }
            cardStates = [state]
            return state
          }),
        },
      },
    }

    await splitUp(fakeBase44)
    expect(cardStates).toHaveLength(1)

    await splitDown(fakeBase44)

    expect(fakeBase44.entities.Flashcard.update).toHaveBeenCalledOnce()
    const [updatedId, updatedFields] = fakeBase44.entities.Flashcard.update.mock.calls[0]
    expect(updatedId).toBe('c1')
    expect(updatedFields).toMatchObject({
      stability:   card.stability,
      difficulty:  card.difficulty,
      interval:    card.interval,
      reviewCount: card.reviewCount,
    })
  })
})

// ── deck-hierarchy: migrateUp ─────────────────────────────────────────────────

describe('deck-hierarchy: migrateUp', () => {
  it('second call is a no-op: skips decks that already have parentDeckId', async () => {
    const parent = mkDeck('Animals', { id: 'dk-parent' })
    const child  = mkDeck('Mammals', { parentDeckId: 'dk-parent' })
    const fakeBase44 = {
      entities: {
        Deck: {
          list:   vi.fn().mockResolvedValue([parent, child]),
          create: vi.fn(),
          update: vi.fn(),
        },
      },
    }

    const result = await hierarchyUp(fakeBase44)
    expect(result).toEqual({ created: 0, updated: 0 })
    expect(fakeBase44.entities.Deck.create).not.toHaveBeenCalled()
    expect(fakeBase44.entities.Deck.update).not.toHaveBeenCalled()
  })

  it('mixed fixture: only touches flat "::" decks without parentDeckId', async () => {
    const alreadyMigrated = mkDeck('Child A', { parentDeckId: 'dk-existing' })
    const pending         = mkDeck('Animals::Mammals')
    const fakeBase44 = {
      entities: {
        Deck: {
          list:   vi.fn().mockResolvedValue([alreadyMigrated, pending]),
          create: vi.fn().mockImplementation(async d => ({ id: `dk-new`, ...d })),
          update: vi.fn().mockResolvedValue({}),
        },
      },
    }

    const result = await hierarchyUp(fakeBase44)
    expect(result.updated).toBe(1)
    expect(fakeBase44.entities.Deck.update).toHaveBeenCalledOnce()

    const [updatedId, updatedFields] = fakeBase44.entities.Deck.update.mock.calls[0]
    expect(updatedId).toBe(pending.id)
    expect(updatedFields.title).toBe('Mammals')
    expect(updatedFields.parentDeckId).toBeDefined()
  })
})

// ── deck-hierarchy: migrateDown round-trip ────────────────────────────────────

describe('deck-hierarchy: migrateDown round-trip', () => {
  it('migrateDown after migrateUp restores the flat "Parent::Child" name', async () => {
    const flatDeck = mkDeck('Science::Physics')
    let decks = [flatDeck]

    const fakeBase44 = {
      entities: {
        Deck: {
          list: vi.fn().mockImplementation(async () => decks),
          create: vi.fn().mockImplementation(async d => {
            const parent = { id: 'dk-parent', ...d }
            decks = [parent, ...decks]
            return parent
          }),
          update: vi.fn().mockImplementation(async (id, updates) => {
            decks = decks.map(d => d.id === id ? { ...d, ...updates } : d)
            return {}
          }),
        },
      },
    }

    await hierarchyUp(fakeBase44)

    const child = decks.find(d => d.title === 'Physics')
    expect(child).toBeDefined()
    expect(child.parentDeckId).toBeDefined()

    await hierarchyDown(fakeBase44)

    const restored = decks.find(d => d.id === flatDeck.id)
    expect(restored.title).toBe('Science::Physics')
    expect(restored.parentDeckId).toBeNull()
  })
})

// ── getMigrationStatus ────────────────────────────────────────────────────────

describe('getMigrationStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.removeItem('nidus-last-migration-run')
  })

  it('returns correct counts for a known fixture', async () => {
    vi.mocked(base44.entities.Flashcard.list).mockResolvedValue([
      mkFlashcard('c1'), mkFlashcard('c2'), mkFlashcard('c3'),
    ])
    vi.mocked(base44.entities.CardState.list).mockResolvedValue([
      mkCardState('c1'),
      mkCardState('c2'),
    ])
    vi.mocked(base44.entities.Deck.list).mockResolvedValue([
      mkDeck('Animals::Mammals'),
      mkDeck('Animals'),
      mkDeck('Mammals', { parentDeckId: 'dk-Animals' }),
    ])

    const status = await storage.getMigrationStatus()

    expect(status.splitCardState.migrated).toBe(2)
    expect(status.splitCardState.pending).toBe(1)
    expect(status.splitCardState.total).toBe(3)
    expect(status.deckHierarchy.migrated).toBe(1)
    expect(status.deckHierarchy.pending).toBe(1)
    expect(status.deckHierarchy.total).toBe(3)
    expect(status.lastRunAt).toBeNull()
  })

  it('exposes window.__nidusMigrationStatus in DEV', () => {
    expect(typeof window.__nidusMigrationStatus).toBe('function')
  })
})

// ── runMigration canonical order ──────────────────────────────────────────────

describe('runMigration canonical order', () => {
  beforeEach(() => vi.clearAllMocks())

  it('split-card-state entity calls complete before deck-hierarchy begins', async () => {
    const callOrder = []

    vi.mocked(base44.entities.Flashcard.list).mockImplementation(async () => {
      callOrder.push('Flashcard.list')
      return []
    })
    vi.mocked(base44.entities.CardState.list).mockImplementation(async () => {
      callOrder.push('CardState.list')
      return []
    })
    vi.mocked(base44.entities.Deck.list).mockImplementation(async () => {
      callOrder.push('Deck.list')
      return []
    })

    await storage.runMigration()

    const flashcardPos = callOrder.indexOf('Flashcard.list')
    const deckPos      = callOrder.indexOf('Deck.list')
    expect(flashcardPos).toBeGreaterThanOrEqual(0)
    expect(deckPos).toBeGreaterThan(flashcardPos)
  })
})

// ── appStore.init regression ──────────────────────────────────────────────────

describe('appStore.init regression', () => {
  let runMigrationSpy

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.removeItem('nidus-last-migration-run')
    runMigrationSpy = vi.spyOn(storage, 'runMigration').mockResolvedValue({
      splitCardState: { created: 0, skipped: 0, total: 0 },
      deckHierarchy:  { created: 0, updated: 0 },
    })
  })

  afterEach(() => {
    runMigrationSpy.mockRestore()
    localStorage.removeItem('nidus-last-migration-run')
  })

  it('calls runMigration when the 24h cache is stale', async () => {
    await useAppStore.getState().init()
    expect(runMigrationSpy).toHaveBeenCalledOnce()
  })

  it('skips runMigration when the 24h cache is fresh', async () => {
    localStorage.setItem('nidus-last-migration-run', String(Date.now()))
    await useAppStore.getState().init()
    expect(runMigrationSpy).not.toHaveBeenCalled()
  })
})
