/**
 * Zustand appStore action tests (Session 7c).
 * Target: 80% statements/branches on src/store/appStore.js.
 * All I/O is mocked; vi.useFakeTimers() is used for debounce paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/api/storage', () => ({
  loadAll:                 vi.fn(),
  loadCardsPage:           vi.fn(),
  syncCards:               vi.fn(),
  syncCardStates:          vi.fn(),
  appendLog:               vi.fn(),
  updateLog:               vi.fn(),
  ensureDeck:              vi.fn(),
  listCardStates:          vi.fn(),
  runMigration:            vi.fn(),
  adjustDeckCount:         vi.fn(),
  recalculateDeckCount:    vi.fn(),
  getUserSchedulerParams:  vi.fn(),
  saveUserSchedulerParams: vi.fn(),
}))

vi.mock('@/lib/offline-store', () => ({
  seedFromNetwork: vi.fn(),
  queueRating:     vi.fn(),
  onReconnect:     vi.fn(),
  getQueue:        vi.fn(),
}))

vi.mock('@/api/notionSettings', () => ({
  migrateNotionCredentials: vi.fn(),
}))

vi.mock('@/lib/settings', () => ({
  settingsGet:  vi.fn(() => ({})),
  settingsSet:  vi.fn(),
  deckMetaGet:  vi.fn(() => ({})),
  deckMetaSet:  vi.fn(),
  lastSyncGet:  vi.fn(() => null),
  lastSyncSet:  vi.fn(),
}))

vi.mock('@/lib/dates', () => ({
  genId: vi.fn(() => 'test-id'),
}))

vi.mock('@/lib/cloze', () => ({
  createClozeCards: vi.fn(() => []),
}))

vi.mock('@/lib/occlusion', () => ({
  createOcclusionCards: vi.fn(() => []),
}))

import * as storage from '@/api/storage'
import * as offlineStore from '@/lib/offline-store'
import { migrateNotionCredentials } from '@/api/notionSettings'
import { settingsSet, lastSyncSet } from '@/lib/settings'
import { createClozeCards } from '@/lib/cloze'
import { createOcclusionCards } from '@/lib/occlusion'
import { useAppStore } from '@/store/appStore'

const RESET = {
  cards: [], log: [], decks: [], deckMeta: {}, settings: {},
  syncStatus: 'idle', lastSynced: null, ready: false, cardsFullyLoaded: true,
  incompleteSession: null, sessionsCompleted: 0, isOffline: false,
  installPromptDismissed: false,
  _pendingCards: null, _saveTimer: null, _savedTimer: null, _cardStateTimer: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState(RESET)
})

// ── markSaved ─────────────────────────────────────────────────────────────────

describe('markSaved', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sets syncStatus to saved immediately', () => {
    useAppStore.getState().markSaved()
    expect(useAppStore.getState().syncStatus).toBe('saved')
  })

  it('sets lastSynced to an ISO timestamp string', () => {
    useAppStore.getState().markSaved()
    const { lastSynced } = useAppStore.getState()
    expect(typeof lastSynced).toBe('string')
    expect(lastSynced).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('reverts syncStatus to idle after 2000ms', () => {
    useAppStore.getState().markSaved()
    vi.advanceTimersByTime(2000)
    expect(useAppStore.getState().syncStatus).toBe('idle')
  })

  it('clears previous savedTimer before scheduling a new one', () => {
    useAppStore.getState().markSaved()
    vi.advanceTimersByTime(1000)
    useAppStore.getState().markSaved()
    vi.advanceTimersByTime(1999)
    expect(useAppStore.getState().syncStatus).toBe('saved')
    vi.advanceTimersByTime(1)
    expect(useAppStore.getState().syncStatus).toBe('idle')
  })

  it('calls lastSyncSet', () => {
    useAppStore.getState().markSaved()
    expect(lastSyncSet).toHaveBeenCalled()
  })
})

// ── updateCards ───────────────────────────────────────────────────────────────

describe('updateCards', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    storage.syncCards.mockResolvedValue(undefined)
    storage.syncCardStates.mockResolvedValue(undefined)
  })
  afterEach(() => vi.useRealTimers())

  it('immediately updates cards state and sets syncStatus to saving', () => {
    const cards = [{ id: 'c1', deck: 'D' }]
    useAppStore.getState().updateCards(cards)
    const state = useAppStore.getState()
    expect(state.cards).toEqual(cards)
    expect(state.syncStatus).toBe('saving')
  })

  it('does not call syncCards before 800ms', () => {
    useAppStore.getState().updateCards([{ id: 'c1', deck: 'D' }])
    vi.advanceTimersByTime(799)
    expect(storage.syncCards).not.toHaveBeenCalled()
  })

  it('calls syncCards with the pending cards after 800ms', async () => {
    const cards = [{ id: 'c1', deck: 'D' }]
    useAppStore.getState().updateCards(cards)
    await vi.advanceTimersByTimeAsync(800)
    expect(storage.syncCards).toHaveBeenCalledWith(cards)
  })

  it('calls syncCardStates with the pending cards after 800ms', async () => {
    const cards = [{ id: 'c1', deck: 'D' }]
    useAppStore.getState().updateCards(cards)
    await vi.advanceTimersByTimeAsync(800)
    expect(storage.syncCardStates).toHaveBeenCalledWith(cards)
  })

  it('debounces: rapid calls reset the timer and only fire once', async () => {
    const first  = [{ id: 'c1', deck: 'D' }]
    const second = [{ id: 'c2', deck: 'D' }]
    useAppStore.getState().updateCards(first)
    vi.advanceTimersByTime(400)
    useAppStore.getState().updateCards(second)
    await vi.advanceTimersByTimeAsync(800)
    expect(storage.syncCards).toHaveBeenCalledTimes(1)
    expect(storage.syncCards).toHaveBeenCalledWith(second)
  })

  it('sets syncStatus to error when syncCards rejects', async () => {
    storage.syncCards.mockRejectedValue(new Error('network'))
    useAppStore.getState().updateCards([{ id: 'c1', deck: 'D' }])
    await vi.advanceTimersByTimeAsync(800)
    expect(useAppStore.getState().syncStatus).toBe('error')
  })
})

// ── flushCards ────────────────────────────────────────────────────────────────

describe('flushCards', () => {
  it('is a no-op when there are no pending cards', async () => {
    await useAppStore.getState().flushCards()
    expect(storage.syncCards).not.toHaveBeenCalled()
  })

  it('calls syncCards and syncCardStates with pending cards', async () => {
    const cards = [{ id: 'c1', deck: 'D' }]
    storage.syncCards.mockResolvedValue(undefined)
    storage.syncCardStates.mockResolvedValue(undefined)
    useAppStore.setState({ _pendingCards: cards })

    await useAppStore.getState().flushCards()

    expect(storage.syncCards).toHaveBeenCalledWith(cards)
    expect(storage.syncCardStates).toHaveBeenCalledWith(cards)
  })

  it('sets syncStatus to saved on success', async () => {
    storage.syncCards.mockResolvedValue(undefined)
    storage.syncCardStates.mockResolvedValue(undefined)
    useAppStore.setState({ _pendingCards: [{ id: 'c1' }] })

    await useAppStore.getState().flushCards()

    expect(useAppStore.getState().syncStatus).toBe('saved')
  })

  it('sets syncStatus to error when syncCards rejects', async () => {
    storage.syncCards.mockRejectedValue(new Error('fail'))
    useAppStore.setState({ _pendingCards: [{ id: 'c1' }] })

    await useAppStore.getState().flushCards()

    expect(useAppStore.getState().syncStatus).toBe('error')
  })
})

// ── addLog ────────────────────────────────────────────────────────────────────

describe('addLog', () => {
  it('prepends the entry to log state', async () => {
    storage.appendLog.mockResolvedValue({})
    const entry = { date: '2026-04-30', reviewed: 5 }
    await useAppStore.getState().addLog(entry)
    expect(useAppStore.getState().log[0]).toEqual(entry)
  })

  it('calls storage.appendLog with the entry', async () => {
    storage.appendLog.mockResolvedValue({})
    const entry = { date: '2026-04-30', reviewed: 5 }
    await useAppStore.getState().addLog(entry)
    expect(storage.appendLog).toHaveBeenCalledWith(entry)
  })
})

// ── updateSettings ────────────────────────────────────────────────────────────

describe('updateSettings', () => {
  it('updates settings in state', () => {
    const s = { newCardCap: 20, reviewCap: 50 }
    useAppStore.getState().updateSettings(s)
    expect(useAppStore.getState().settings).toEqual(s)
  })

  it('calls settingsSet with the new settings', () => {
    const s = { newCardCap: 20 }
    useAppStore.getState().updateSettings(s)
    expect(settingsSet).toHaveBeenCalledWith(s)
  })
})

// ── addDeck ───────────────────────────────────────────────────────────────────

describe('addDeck', () => {
  it('adds a new deck to state and calls ensureDeck', async () => {
    storage.ensureDeck.mockResolvedValue('deck-1')
    await useAppStore.getState().addDeck('Cardiology')
    expect(useAppStore.getState().decks).toContain('Cardiology')
    expect(storage.ensureDeck).toHaveBeenCalledWith('Cardiology')
  })

  it('trims whitespace from deck name', async () => {
    storage.ensureDeck.mockResolvedValue('deck-1')
    await useAppStore.getState().addDeck('  Cardiology  ')
    expect(useAppStore.getState().decks).toContain('Cardiology')
  })

  it('is a no-op for a blank string', async () => {
    await useAppStore.getState().addDeck('  ')
    expect(useAppStore.getState().decks).toHaveLength(0)
    expect(storage.ensureDeck).not.toHaveBeenCalled()
  })

  it('is a no-op for a duplicate deck name', async () => {
    useAppStore.setState({ decks: ['Cardiology'] })
    await useAppStore.getState().addDeck('Cardiology')
    expect(useAppStore.getState().decks).toHaveLength(1)
    expect(storage.ensureDeck).not.toHaveBeenCalled()
  })
})

// ── archiveDeck ───────────────────────────────────────────────────────────────

describe('archiveDeck', () => {
  it('sets archived=true for an unarchived deck', () => {
    useAppStore.setState({ deckMeta: {} })
    useAppStore.getState().archiveDeck('Cardiology')
    expect(useAppStore.getState().deckMeta['Cardiology'].archived).toBe(true)
  })

  it('toggles archived back to false on second call', () => {
    useAppStore.setState({ deckMeta: { Cardiology: { archived: true } } })
    useAppStore.getState().archiveDeck('Cardiology')
    expect(useAppStore.getState().deckMeta['Cardiology'].archived).toBe(false)
  })
})

// ── markSessionComplete ───────────────────────────────────────────────────────

describe('markSessionComplete', () => {
  it('is a no-op when there is no incomplete session', async () => {
    await useAppStore.getState().markSessionComplete()
    expect(storage.updateLog).not.toHaveBeenCalled()
  })

  it('sets the matching log entry status to complete', async () => {
    const session = { id: 'log-1', date: '2026-04-30', status: 'incomplete' }
    useAppStore.setState({ incompleteSession: session, log: [session] })
    storage.updateLog.mockResolvedValue({})

    await useAppStore.getState().markSessionComplete()

    expect(useAppStore.getState().log[0].status).toBe('complete')
    expect(useAppStore.getState().incompleteSession).toBeNull()
  })

  it('calls storage.updateLog with session id and status complete', async () => {
    const session = { id: 'log-1', date: '2026-04-30', status: 'incomplete' }
    useAppStore.setState({ incompleteSession: session, log: [session] })
    storage.updateLog.mockResolvedValue({})

    await useAppStore.getState().markSessionComplete()

    expect(storage.updateLog).toHaveBeenCalledWith('log-1', { status: 'complete' })
  })

  it('skips storage.updateLog when session has no id', async () => {
    const session = { date: '2026-04-30', status: 'incomplete' }
    useAppStore.setState({ incompleteSession: session, log: [session] })

    await useAppStore.getState().markSessionComplete()

    expect(storage.updateLog).not.toHaveBeenCalled()
  })
})

// ── simple setters ────────────────────────────────────────────────────────────

describe('simple setters', () => {
  it('setIncompleteSession stores the session', () => {
    const s = { date: '2026-04-30' }
    useAppStore.getState().setIncompleteSession(s)
    expect(useAppStore.getState().incompleteSession).toEqual(s)
  })

  it('setIsOffline updates isOffline', () => {
    useAppStore.getState().setIsOffline(true)
    expect(useAppStore.getState().isOffline).toBe(true)
  })

  it('setInstallPromptDismissed updates the flag', () => {
    useAppStore.getState().setInstallPromptDismissed(true)
    expect(useAppStore.getState().installPromptDismissed).toBe(true)
  })

  it('incrementSessionsCompleted accumulates', () => {
    useAppStore.getState().incrementSessionsCompleted()
    useAppStore.getState().incrementSessionsCompleted()
    expect(useAppStore.getState().sessionsCompleted).toBe(2)
  })
})

// ── handleImportCards ─────────────────────────────────────────────────────────

describe('handleImportCards', () => {
  it('sets cards, calls syncCards, and reports ok result', async () => {
    storage.syncCards.mockResolvedValue(undefined)
    const onResult = vi.fn()
    const cards = [{ id: 'c1' }]

    await useAppStore.getState().handleImportCards(cards, onResult)

    expect(storage.syncCards).toHaveBeenCalledWith(cards)
    expect(onResult).toHaveBeenCalledWith({ ok: true, count: 1 })
    expect(useAppStore.getState().cards).toEqual(cards)
  })

  it('sets syncStatus to error and reports failure when syncCards rejects', async () => {
    storage.syncCards.mockRejectedValue(new Error('network error'))
    const onResult = vi.fn()

    await useAppStore.getState().handleImportCards([{ id: 'c1' }], onResult)

    expect(onResult).toHaveBeenCalledWith({ ok: false, msg: 'network error' })
    expect(useAppStore.getState().syncStatus).toBe('error')
  })
})

// ── handleApkgImportCards ─────────────────────────────────────────────────────

describe('handleApkgImportCards', () => {
  it('merges new cards with existing and calls syncCards', async () => {
    storage.syncCards.mockResolvedValue(undefined)
    const existing = [{ id: 'old' }]
    const imported = [{ id: 'new1' }, { id: 'new2' }]
    useAppStore.setState({ cards: existing })

    await useAppStore.getState().handleApkgImportCards(imported)

    const merged = [...existing, ...imported]
    expect(storage.syncCards).toHaveBeenCalledWith(merged)
    expect(useAppStore.getState().cards).toEqual(merged)
  })
})

// ── init ──────────────────────────────────────────────────────────────────────

describe('init', () => {
  const BASE_LOAD = {
    cards:        [{ id: 'c1', deck: 'D' }],
    deckNames:    ['D'],
    log:          [{ date: '2026-01-01' }],
    deckParentMap: new Map(),
    hasMore:      false,
  }

  it('sets cards, decks, log, and ready=true after loadAll', async () => {
    storage.loadAll.mockResolvedValue(BASE_LOAD)
    storage.listCardStates.mockResolvedValue([])

    await useAppStore.getState().init()

    const state = useAppStore.getState()
    expect(state.cards).toEqual(BASE_LOAD.cards)
    expect(state.decks).toEqual(['D'])
    expect(state.log).toEqual(BASE_LOAD.log)
    expect(state.ready).toBe(true)
  })

  it('deduplicates deck names returned by loadAll', async () => {
    storage.loadAll.mockResolvedValue({ ...BASE_LOAD, deckNames: ['D', 'D', 'E'] })
    storage.listCardStates.mockResolvedValue([])

    await useAppStore.getState().init()

    expect(useAppStore.getState().decks).toEqual(['D', 'E'])
  })

  it('calls runMigration when a card with state has no CardState record', async () => {
    const cardWithState = { id: 'c1', stability: 4.5, reviewCount: 5, deck: 'D' }
    storage.loadAll.mockResolvedValue({ ...BASE_LOAD, cards: [cardWithState] })
    storage.listCardStates.mockResolvedValue([])
    storage.runMigration.mockResolvedValue({ migrated: 1 })

    await useAppStore.getState().init()

    expect(storage.runMigration).toHaveBeenCalled()
  })

  it('skips runMigration when the card already has a CardState record', async () => {
    const cardWithState = { id: 'c1', stability: 4.5, reviewCount: 5, deck: 'D' }
    storage.loadAll.mockResolvedValue({ ...BASE_LOAD, cards: [cardWithState] })
    storage.listCardStates.mockResolvedValue([{ cardClientId: 'c1', migrated: true }])

    await useAppStore.getState().init()

    expect(storage.runMigration).not.toHaveBeenCalled()
  })

  it('sets ready=true even when loadAll throws', async () => {
    storage.loadAll.mockRejectedValue(new Error('network'))

    await useAppStore.getState().init()

    expect(useAppStore.getState().ready).toBe(true)
  })

  it('calls loadCardsPage for background paging when hasMore=true', async () => {
    storage.loadAll.mockResolvedValue({ ...BASE_LOAD, hasMore: true })
    storage.listCardStates.mockResolvedValue([])
    storage.loadCardsPage.mockResolvedValue({ cards: [{ id: 'c2', deck: 'D' }], hasMore: false })
    // seedFromNetwork and migrateNotionCredentials must return Promises so their
    // .catch() chain does not throw before the background IIFE is reached.
    offlineStore.seedFromNetwork.mockResolvedValue(undefined)
    migrateNotionCredentials.mockResolvedValue(undefined)

    await useAppStore.getState().init()
    await new Promise(r => setTimeout(r, 0))

    expect(storage.loadCardsPage).toHaveBeenCalledWith(BASE_LOAD.cards.length)
  })

  it('calls seedFromNetwork and migrateNotionCredentials after load', async () => {
    storage.loadAll.mockResolvedValue(BASE_LOAD)
    storage.listCardStates.mockResolvedValue([])
    offlineStore.seedFromNetwork.mockResolvedValue(undefined)
    migrateNotionCredentials.mockResolvedValue(undefined)

    await useAppStore.getState().init()

    expect(offlineStore.seedFromNetwork).toHaveBeenCalled()
    expect(migrateNotionCredentials).toHaveBeenCalled()
  })

  it('breaks the paging loop when loadCardsPage throws', async () => {
    storage.loadAll.mockResolvedValue({ ...BASE_LOAD, hasMore: true })
    storage.listCardStates.mockResolvedValue([])
    storage.loadCardsPage.mockRejectedValue(new Error('network'))
    offlineStore.seedFromNetwork.mockResolvedValue(undefined)
    migrateNotionCredentials.mockResolvedValue(undefined)

    await useAppStore.getState().init()
    await new Promise(r => setTimeout(r, 0))

    // cardsFullyLoaded is set after the loop exits (via catch break)
    expect(useAppStore.getState().cardsFullyLoaded).toBe(true)
  })
})

// ── handleApkgImportCards (singular/plural branch) ────────────────────────────

describe('handleApkgImportCards singular message', () => {
  it('uses singular "card" when exactly one card is imported', async () => {
    storage.syncCards.mockResolvedValue(undefined)
    useAppStore.setState({ cards: [] })

    await useAppStore.getState().handleApkgImportCards([{ id: 'c1' }])

    expect(useAppStore.getState().syncStatus).toContain('card')
    expect(useAppStore.getState().syncStatus).not.toContain('cards')
  })

  it('uses plural "cards" when more than one card is imported', async () => {
    storage.syncCards.mockResolvedValue(undefined)
    useAppStore.setState({ cards: [] })

    await useAppStore.getState().handleApkgImportCards([{ id: 'c1' }, { id: 'c2' }])

    expect(useAppStore.getState().syncStatus).toContain('cards')
  })
})

// ── createSampleDeck ──────────────────────────────────────────────────────────

describe('createSampleDeck', () => {
  const setup = () => {
    storage.ensureDeck.mockResolvedValue('deck-1')
    storage.syncCards.mockResolvedValue(undefined)
    storage.syncCardStates.mockResolvedValue(undefined)
    storage.adjustDeckCount.mockResolvedValue(undefined)
    // createClozeCards and createOcclusionCards return [] from vi.mock factory
  }

  it('adds the sample deck to state when it did not exist', async () => {
    setup()

    await useAppStore.getState().createSampleDeck()

    expect(useAppStore.getState().decks).toContain('Common Pharmacology: Essentials')
    expect(storage.ensureDeck).toHaveBeenCalledWith('Common Pharmacology: Essentials')
  })

  it('skips ensureDeck when the sample deck already exists', async () => {
    setup()
    useAppStore.setState({ decks: ['Common Pharmacology: Essentials'] })

    await useAppStore.getState().createSampleDeck()

    expect(storage.ensureDeck).not.toHaveBeenCalled()
  })

  it('calls updateCards with the generated basic cards', async () => {
    setup()

    await useAppStore.getState().createSampleDeck()

    // 10 hardcoded basic pharmacology cards (cloze and occlusion mocked to [])
    expect(useAppStore.getState().cards.length).toBe(10)
  })

  it('merges sample cards with any existing cards', async () => {
    setup()
    useAppStore.setState({ cards: [{ id: 'pre-existing' }] })

    await useAppStore.getState().createSampleDeck()

    const { cards } = useAppStore.getState()
    expect(cards.some(c => c.id === 'pre-existing')).toBe(true)
    expect(cards.length).toBeGreaterThan(1)
  })

  it('uses createClozeCards for cloze variants', async () => {
    setup()
    createClozeCards.mockReturnValue([{ id: 'cloze-card', cardType: 'cloze', source: null, tags: [] }])

    await useAppStore.getState().createSampleDeck()

    expect(createClozeCards).toHaveBeenCalled()
    // cloze cards are merged into the final card array
    expect(useAppStore.getState().cards.some(c => c.cardType === 'cloze')).toBe(true)
  })

  it('uses createOcclusionCards for the diagram card', async () => {
    setup()
    createOcclusionCards.mockReturnValue([{ id: 'occ-card', cardType: 'image-occlusion', source: null, tags: [] }])

    await useAppStore.getState().createSampleDeck()

    expect(createOcclusionCards).toHaveBeenCalled()
    expect(useAppStore.getState().cards.some(c => c.cardType === 'image-occlusion')).toBe(true)
  })
})
