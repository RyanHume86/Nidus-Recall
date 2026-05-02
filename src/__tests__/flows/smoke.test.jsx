/**
 * P0 smoke tests — one assertion per user-facing flow.
 *
 * Coverage: flows 1-10, 13, 17, 19 from TEST_PLAN.md.
 *
 * Strategy: render each view/component in isolation with representative props
 * and mocked external I/O; assert that the most distinctive DOM element of
 * each flow is present or that the correct callback fires.
 *
 * All tests must remain green on main. A failure here means a user-visible
 * regression. Fix it before merging.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import React from 'react'

// ── Global mocks (must appear before component imports) ───────────────────────

vi.mock('@/api/base44Client', () => ({
  base44: {
    auth: { me: vi.fn().mockResolvedValue(null), logout: vi.fn() },
    entities: {
      Flashcard:  { list: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: 'e1' }), update: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}) },
      Deck:       { list: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: 'd1' }), update: vi.fn().mockResolvedValue({}) },
      SessionLog: { list: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: 'l1' }) },
      CardHistory:{ filter: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}) },
      CardState:  { list: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
      UserSchedulerParams: { list: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}) },
    },
    functions: { callFunction: vi.fn().mockResolvedValue({}) },
  },
}))

vi.mock('@/api/storage', () => ({
  loadAll: vi.fn().mockResolvedValue({ cards: [], deckNames: [], log: [], deckParentMap: new Map() }),
  syncCards: vi.fn().mockResolvedValue(undefined),
  syncCardStates: vi.fn().mockResolvedValue(undefined),
  syncCardState: vi.fn().mockResolvedValue(undefined),
  appendLog: vi.fn().mockResolvedValue({ id: 'l1' }),
  updateLog: vi.fn().mockResolvedValue({}),
  ensureDeck: vi.fn().mockResolvedValue('d1'),
  adjustDeckCount: vi.fn().mockResolvedValue(undefined),
  recalculateDeckCount: vi.fn().mockResolvedValue(undefined),
  saveCardHistory: vi.fn().mockResolvedValue({}),
  listCardHistory: vi.fn().mockResolvedValue([]),
  getUserSchedulerParams: vi.fn().mockReturnValue(null),
  saveUserSchedulerParams: vi.fn().mockResolvedValue({}),
  listCardStates: vi.fn().mockResolvedValue([]),
  runMigration: vi.fn().mockResolvedValue({ migrated: 0 }),
  getDeckParentMap: vi.fn().mockReturnValue(new Map()),
}))

vi.mock('@/api/excel', () => ({
  exportToExcel: vi.fn().mockResolvedValue(undefined),
  importFromExcel: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/api/notion', () => ({
  testConnection: vi.fn().mockResolvedValue(false),
  exportToNotion: vi.fn().mockResolvedValue(undefined),
  importFromNotion: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/offline-store', () => ({
  seedFromNetwork: vi.fn().mockResolvedValue(undefined),
  queueRating: vi.fn().mockResolvedValue(undefined),
  onReconnect: vi.fn().mockReturnValue(() => {}),
  getQueue: vi.fn().mockResolvedValue([]),
  drainQueue: vi.fn().mockResolvedValue({ flushed: 0 }),
}))

vi.mock('@/lib/pwa', () => ({
  isInstallable: vi.fn().mockReturnValue(false),
  triggerInstallPrompt: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/app-params', () => ({
  appParams: { appId: 'test-app', token: '', functionsVersion: 1, appBaseUrl: '' },
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SETTINGS = {
  newCardCap: 15, reviewCap: 100, leechThreshold: 5, retentionTarget: 0.90,
  catchupDays: 7, sleepBedtime: null, sleepWindowMinutes: 90,
  sleepBannerEnabled: true, matureModeEnabled: false, matureCardThreshold: 30,
  fatigueAlertsEnabled: false, attentionDeclarationEnabled: false,
  sleepPrefersReviews: false,
}

const DECK_A = 'Common Pharmacology'
const DECK_B = 'Clinical Anatomy'

// Yesterday's date string (always due)
const yesterday = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

// Tomorrow's date string (not yet due)
const tomorrow = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

const mkCard = (overrides = {}) => ({
  id: 'card-1', front: 'What is the MoA of metformin?',
  back: 'Activates AMPK, reduces hepatic gluconeogenesis.',
  deck: DECK_A, contentType: 'Mechanism', cardType: 'basic',
  status: 'Active', interval: 5, reviewCount: 3, lapses: 0,
  stability: 4.5, difficulty: 5.5, nextReview: yesterday(),
  lastReview: '2026-01-10', elaboration: '', anchor: null,
  source: null, stakes_flag: false, prerequisite_card_id: null,
  tags: [], connects_to: [], ratingHistory: [],
  imageUrl: null, occlusionRegions: null, occlusionRegionId: null,
  ...overrides,
})

// Use Factual type so the textarea placeholder is "Your answer..." (predictable in tests)
const DUE_CARD   = mkCard({ contentType: 'Factual' })
const NEW_CARD   = mkCard({ id: 'card-new', nextReview: null, reviewCount: 0, stability: null, difficulty: null, contentType: 'Factual' })
const FUTURE_CARD = mkCard({ id: 'card-future', nextReview: tomorrow() })

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { LibraryView }      from '@/views/LibraryView'
import { DeckView }         from '@/views/DeckView'
import { StudySelectView }  from '@/views/StudySelectView'
import { SessionView }      from '@/views/SessionView'
import { StatsView }        from '@/views/StatsView'
import { SettingsView }     from '@/views/SettingsView'
import { getDue, getNew }   from '@/lib/fsrs'
import { createClozeCards } from '@/lib/cloze'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Flow 1 — Library: empty state shows onboarding prompt', () => {
  it('renders the onboarding prompt when there are no decks', () => {
    render(
      <LibraryView
        cards={[]} decks={[]} deckMeta={{}} settings={SETTINGS}
        onSelectDeck={vi.fn()} onCreateDeck={vi.fn()} onCreateSampleDeck={vi.fn()}
        syncStatus="idle" lastSynced={null} deckParentMap={new Map()}
      />
    )
    // OnboardingView renders text about creating a deck
    expect(screen.getByText(/create your first deck/i)).toBeInTheDocument()
  })
})

describe('Flow 2 — Library: with decks shows deck names and New Deck button', () => {
  it('lists deck names and shows New Deck button', () => {
    render(
      <LibraryView
        cards={[DUE_CARD]} decks={[DECK_A, DECK_B]} deckMeta={{}} settings={SETTINGS}
        onSelectDeck={vi.fn()} onCreateDeck={vi.fn()} onCreateSampleDeck={vi.fn()}
        syncStatus="idle" lastSynced={null} deckParentMap={new Map()}
      />
    )
    expect(screen.getAllByText(DECK_A).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /new deck/i })).toBeInTheDocument()
  })
})

describe('Flow 3 — Library: creating a deck calls onCreateDeck with the entered name', () => {
  it('calls onCreateDeck with trimmed deck name on Create click', async () => {
    const onCreateDeck = vi.fn()
    render(
      <LibraryView
        cards={[DUE_CARD]} decks={[DECK_A]} deckMeta={{}} settings={SETTINGS}
        onSelectDeck={vi.fn()} onCreateDeck={onCreateDeck} onCreateSampleDeck={vi.fn()}
        syncStatus="idle" lastSynced={null} deckParentMap={new Map()}
      />
    )
    // Open the create-deck form
    fireEvent.click(screen.getByRole('button', { name: /new deck/i }))
    // Type a deck name
    const input = screen.getByPlaceholderText(/e\.g\. Anatomy/i)
    fireEvent.change(input, { target: { value: '  Neurology  ' } })
    // Click Create
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }))
    expect(onCreateDeck).toHaveBeenCalledWith('Neurology')
  })
})

describe('Flow 4 — DeckView: adding a basic card calls onUpdateCards with correct front/back', () => {
  it('calls onUpdateCards with a new card containing the entered text', async () => {
    const onUpdateCards = vi.fn().mockResolvedValue(undefined)
    render(
      <DeckView
        deckName={DECK_A} cards={[]} decks={[DECK_A]} settings={SETTINGS}
        onUpdateCards={onUpdateCards} onBack={vi.fn()} onArchiveDeck={vi.fn()}
      />
    )
    const frontInput = screen.getByPlaceholderText(/question or prompt/i)
    const backInput  = screen.getByPlaceholderText(/concise answer/i)
    fireEvent.change(frontInput, { target: { value: 'What is aspirin?' } })
    fireEvent.change(backInput,  { target: { value: 'COX inhibitor.' } })
    fireEvent.click(screen.getByRole('button', { name: /add card/i }))
    expect(onUpdateCards).toHaveBeenCalledOnce()
    const [newCards] = onUpdateCards.mock.calls[0]
    const added = newCards[newCards.length - 1]
    expect(added.front).toBe('What is aspirin?')
    expect(added.back).toBe('COX inhibitor.')
  })
})

describe('Flow 5 — DeckView: search filters the displayed card list', () => {
  it('shows only cards whose front matches the search term', () => {
    const cardA = mkCard({ id: 'a', front: 'What is metformin?' })
    const cardB = mkCard({ id: 'b', front: 'What is aspirin?' })
    render(
      <DeckView
        deckName={DECK_A} cards={[cardA, cardB]} decks={[DECK_A]} settings={SETTINGS}
        onUpdateCards={vi.fn()} onBack={vi.fn()} onArchiveDeck={vi.fn()}
      />
    )
    const searchInput = screen.getByPlaceholderText(/search cards/i)
    fireEvent.change(searchInput, { target: { value: 'aspirin' } })
    expect(screen.getByText('What is aspirin?')).toBeInTheDocument()
    expect(screen.queryByText('What is metformin?')).not.toBeInTheDocument()
  })
})

describe('Flow 6 — StudySelectView: Start SRS button calls onStartSRS when there are due cards', () => {
  it('calls onStartSRS when the user clicks Start and there are due cards', () => {
    const onStartSRS = vi.fn()
    render(
      <StudySelectView
        cards={[DUE_CARD]} decks={[DECK_A]} settings={SETTINGS}
        onStartSRS={onStartSRS} onStartFree={vi.fn()} onStartInterleaved={vi.fn()}
      />
    )
    // Default mode is SRS, default deck is "all"
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    expect(onStartSRS).toHaveBeenCalledOnce()
  })
})

describe('Flow 7 — SessionView: empty queue renders "All caught up"', () => {
  it('shows the all-caught-up message when there are no due or new cards', () => {
    render(
      <SessionView
        cards={[]} settings={SETTINGS} studyDeckName={null} log={[]}
        onUpdateCards={vi.fn()} onSaveLog={vi.fn()} onDone={vi.fn()}
      />
    )
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument()
  })
})

describe('Flow 8 — SessionView: typing answer and clicking Reveal shows rating buttons', () => {
  it('makes rating buttons visible after the user types an answer and clicks Reveal', () => {
    render(
      <SessionView
        cards={[DUE_CARD]} settings={SETTINGS} studyDeckName={null} log={[]}
        onUpdateCards={vi.fn().mockResolvedValue(undefined)} onSaveLog={vi.fn()} onDone={vi.fn()}
      />
    )
    // Answer textarea is on side 0
    const textarea = screen.getByPlaceholderText(/your answer/i)
    fireEvent.change(textarea, { target: { value: 'Activates AMPK' } })
    fireEvent.click(screen.getByRole('button', { name: /reveal answer/i }))
    // Rating buttons should now be visible
    expect(screen.getByRole('button', { name: /again/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /good/i })).toBeInTheDocument()
  })
})

describe('Flow 9 — SessionView: rating Good calls onUpdateCards with updated scheduling state', () => {
  it('calls onUpdateCards with nextReview, stability, and difficulty set after Good rating', async () => {
    const onUpdateCards = vi.fn().mockResolvedValue(undefined)
    render(
      <SessionView
        cards={[DUE_CARD]} settings={SETTINGS} studyDeckName={null} log={[]}
        onUpdateCards={onUpdateCards} onSaveLog={vi.fn()} onDone={vi.fn()}
      />
    )
    // Reveal answer
    const textarea = screen.getByPlaceholderText(/your answer/i)
    fireEvent.change(textarea, { target: { value: 'AMPK activation' } })
    fireEvent.click(screen.getByRole('button', { name: /reveal answer/i }))
    // Rate Good
    fireEvent.click(screen.getByRole('button', { name: /good/i }))
    expect(onUpdateCards).toHaveBeenCalledOnce()
    const [updatedCards] = onUpdateCards.mock.calls[0]
    const rated = updatedCards.find(c => c.id === DUE_CARD.id)
    expect(rated).toBeDefined()
    expect(rated.nextReview).toBeTruthy()
    expect(rated.stability).toBeGreaterThan(0)
    expect(rated.difficulty).toBeGreaterThan(0)
  })
})

describe('Flow 10 — StatsView: empty log shows empty-state message', () => {
  it('renders the empty-state message when no sessions have been completed', () => {
    render(
      <StatsView log={[]} cards={[]} decks={[]} settings={SETTINGS} />
    )
    expect(screen.getByText(/progress will appear/i)).toBeInTheDocument()
  })
})

describe('Flow 11 — SettingsView: study tab renders settings controls', () => {
  it('renders study settings controls on the default tab', () => {
    render(
      <SettingsView
        settings={SETTINGS} onUpdateSettings={vi.fn()} cards={[]} decks={[]}
        onExport={vi.fn()} onImport={vi.fn()} onImportCards={vi.fn()}
        onImportAnki={vi.fn()} onRefitParams={vi.fn()} schedulerParams={null}
      />
    )
    // "Settings" heading always present
    expect(screen.getByText('Settings')).toBeInTheDocument()
    // Study tab is active by default and shows the new-card cap label
    expect(screen.getByText(/new cards per day/i)).toBeInTheDocument()
  })
})

describe('Flow 13 — DeckView: deck menu Archive action calls onArchiveDeck', () => {
  it('calls onArchiveDeck when Archive deck is selected from the deck menu', () => {
    const onArchiveDeck = vi.fn()
    render(
      <DeckView
        deckName={DECK_A} cards={[]} decks={[DECK_A]} settings={SETTINGS}
        onUpdateCards={vi.fn()} onBack={vi.fn()} onArchiveDeck={onArchiveDeck}
      />
    )
    // Open the deck ⋯ menu and confirm the archive dialog
    fireEvent.click(screen.getByText('⋯'))
    fireEvent.click(screen.getByTestId('deck-menu-archive'))
    fireEvent.click(screen.getByTestId('archive-confirm-ok'))
    expect(onArchiveDeck).toHaveBeenCalledWith(DECK_A)
  })
})

describe('Flow 17 — FSRS: getDue returns only cards due today or earlier', () => {
  it('includes overdue and due-today cards but not future or new cards', () => {
    const due = getDue([DUE_CARD, FUTURE_CARD, NEW_CARD])
    expect(due.map(c => c.id)).toContain(DUE_CARD.id)
    expect(due.map(c => c.id)).not.toContain(FUTURE_CARD.id)
    expect(due.map(c => c.id)).not.toContain(NEW_CARD.id)
  })
})

describe('Flow 17b — FSRS: getNew returns only cards with no nextReview', () => {
  it('includes only cards that have never been reviewed', () => {
    const newCards = getNew([DUE_CARD, FUTURE_CARD, NEW_CARD])
    expect(newCards.map(c => c.id)).toContain(NEW_CARD.id)
    expect(newCards.map(c => c.id)).not.toContain(DUE_CARD.id)
    expect(newCards.map(c => c.id)).not.toContain(FUTURE_CARD.id)
  })
})

describe('Flow 19 — Cloze: createClozeCards produces one card per deletion', () => {
  it('returns two cards for a note with {{c1::...}} and {{c2::...}}', () => {
    const cards = createClozeCards(
      'The heart rate is controlled by the {{c1::sinoatrial node}}, which is modulated by {{c2::the autonomic nervous system}}.',
      DECK_A,
    )
    expect(cards).toHaveLength(2)
    expect(cards[0].cardType).toBe('cloze')
    expect(cards[0].clozeIndex).toBe(1)
    expect(cards[1].clozeIndex).toBe(2)
    // Card 1 front should mask deletion 1
    expect(cards[0].front).toContain('[...]')
    // Card 1 front should reveal deletion 2
    expect(cards[0].front).toContain('the autonomic nervous system')
  })
})
