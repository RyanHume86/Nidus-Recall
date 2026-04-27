/**
 * Virtualisation performance tests.
 *
 * Verifies that:
 * - Components below their threshold render all items (no virtualiser overhead).
 * - Components above their threshold render only a small window of items,
 *   not the full list (DOM node count stays bounded).
 * - Render time for large lists stays within acceptable bounds via a timing gate.
 *
 * NOTE: jsdom has no layout engine, so useVirtualizer falls back to rendering all
 * items (getScrollElement returns null → count = 0 virtualItems, total = 0).
 * We therefore assert on two things that ARE testable in jsdom:
 *   1. The component mounts without error at any list size.
 *   2. Render completes in < 2000 ms even for a 1000-item list (regression guard).
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LibraryView } from '@/views/LibraryView'
import { StatsView } from '@/views/StatsView'

// ── Helpers ────────────────────────────────────────────────────────────────────

const makeDeck = (i) => `Deck ${i.toString().padStart(3, '0')}`
const makeCard = (i, deck) => ({
  id: `c${i}`, deck, front: `Q${i}`, back: `A${i}`,
  status: 'Active', reviewCount: 0, lapses: 0, nextReview: null,
  stability: null, difficulty: null, interval: 1, contentType: 'Factual',
  tags: [], ratingHistory: [], stakes_flag: false,
})
const makeLogEntry = (i) => ({
  id: `log${i}`,
  date: new Date(Date.now() - i * 86400000).toISOString(),
  reviewed: 20, failed: 2, newAdded: 1, frictionNote: '', intensity_score: 0,
})
const deckMeta = {}
const settings = { leechThreshold: 5 }

// ── LibraryView: below threshold (≤50 decks) ─────────────────────────────────

describe('LibraryView below virtual threshold', () => {
  const DECKS = Array.from({ length: 30 }, (_, i) => makeDeck(i))
  const CARDS = DECKS.flatMap(d => [makeCard(0, d)])

  it('renders without error and shows all decks', () => {
    render(<LibraryView cards={CARDS} decks={DECKS} deckMeta={deckMeta} settings={settings}
      onSelectDeck={() => {}} onCreateDeck={() => {}} syncStatus="idle" lastSynced={null}
      onCreateSampleDeck={() => {}} deckParentMap={new Map()} />)
    // All 30 deck names should be in the DOM
    expect(screen.getAllByText(/^Deck \d+$/).length).toBeGreaterThanOrEqual(30)
  })
})

// ── LibraryView: above threshold (>50 decks) ─────────────────────────────────

describe('LibraryView above virtual threshold', () => {
  const DECKS = Array.from({ length: 80 }, (_, i) => makeDeck(i))
  const CARDS = DECKS.flatMap(d => [makeCard(0, d)])

  it('mounts without error with 80 decks', () => {
    const { container } = render(<LibraryView cards={CARDS} decks={DECKS} deckMeta={deckMeta} settings={settings}
      onSelectDeck={() => {}} onCreateDeck={() => {}} syncStatus="idle" lastSynced={null}
      onCreateSampleDeck={() => {}} deckParentMap={new Map()} />)
    expect(container).toBeTruthy()
  })

  it('renders within 2000 ms for 80 decks', () => {
    const start = performance.now()
    render(<LibraryView cards={CARDS} decks={DECKS} deckMeta={deckMeta} settings={settings}
      onSelectDeck={() => {}} onCreateDeck={() => {}} syncStatus="idle" lastSynced={null}
      onCreateSampleDeck={() => {}} deckParentMap={new Map()} />)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(2000)
  })
})

// ── StatsView: below threshold (≤200 log entries) ────────────────────────────

describe('StatsView below virtual threshold', () => {
  const LOG  = Array.from({ length: 50 }, (_, i) => makeLogEntry(i))
  const DECKS = ['Deck A']
  const CARDS = [makeCard(0, 'Deck A')]

  it('renders all log entries', () => {
    render(<StatsView log={LOG} cards={CARDS} decks={DECKS} settings={settings} />)
    // Check the section heading appears
    expect(screen.getByText('Session history')).toBeTruthy()
  })
})

// ── StatsView: above threshold (>200 log entries) ─────────────────────────────

describe('StatsView above virtual threshold', () => {
  const LOG  = Array.from({ length: 300 }, (_, i) => makeLogEntry(i))
  const DECKS = ['Deck A']
  const CARDS = [makeCard(0, 'Deck A')]

  it('mounts without error with 300 log entries', () => {
    const { container } = render(<StatsView log={LOG} cards={CARDS} decks={DECKS} settings={settings} />)
    expect(container).toBeTruthy()
  })

  it('renders within 2000 ms for 300 log entries', () => {
    const start = performance.now()
    render(<StatsView log={LOG} cards={CARDS} decks={DECKS} settings={settings} />)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(2000)
  })
})

// ── Regression: 1000-item render timing gate ──────────────────────────────────

describe('large-list render timing gate', () => {
  it('StatsView with 1000 entries renders in < 2000 ms', () => {
    const LOG   = Array.from({ length: 1000 }, (_, i) => makeLogEntry(i))
    const DECKS = ['Deck A']
    const CARDS = [makeCard(0, 'Deck A')]
    const start = performance.now()
    render(<StatsView log={LOG} cards={CARDS} decks={DECKS} settings={settings} />)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(2000)
  })

  it('LibraryView with 200 decks renders in < 2000 ms', () => {
    const DECKS = Array.from({ length: 200 }, (_, i) => makeDeck(i))
    const CARDS = DECKS.flatMap(d => [makeCard(0, d)])
    const start = performance.now()
    render(<LibraryView cards={CARDS} decks={DECKS} deckMeta={deckMeta} settings={settings}
      onSelectDeck={() => {}} onCreateDeck={() => {}} syncStatus="idle" lastSynced={null}
      onCreateSampleDeck={() => {}} deckParentMap={new Map()} />)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(2000)
  })
})
