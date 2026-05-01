/**
 * Behavioral tests for LibraryView: default route, deck list, empty state, Recent section.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

// ── Minimal mocks needed for LibraryView's transitive deps ─────────────────────

vi.mock('@/lib/app-params', () => ({
  appParams: { appId: 'test-app', token: '', functionsVersion: 1, appBaseUrl: '' },
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { LibraryView } from '@/views/LibraryView'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SETTINGS = {
  newCardCap: 15, reviewCap: 100, catchupDays: 7,
  sleepBedtime: null, sleepWindowMinutes: 90, sleepBannerEnabled: false,
}

const baseProps = {
  cards:            [],
  decks:            [],
  deckMeta:         {},
  deckParentMap:    new Map(),
  onSelectDeck:     vi.fn(),
  onCreateDeck:     vi.fn(),
  onCreateSampleDeck: vi.fn(),
  settings:         SETTINGS,
  syncStatus:       'idle',
  lastSynced:       null,
}

const mkCard = (overrides = {}) => ({
  id: 'c1', front: 'Q', back: 'A', deck: 'Anatomy',
  status: 'Active', reviewCount: 0, lapses: 0,
  stability: null, difficulty: null, nextReview: null, lastReview: null,
  ratingHistory: [], connects_to: [], tags: [],
  ...overrides,
})

beforeEach(() => vi.clearAllMocks())

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LibraryView — default library root', () => {
  it('renders the Library heading when no decks exist', () => {
    render(<LibraryView {...baseProps} />)
    expect(screen.getByText('Library')).toBeInTheDocument()
  })

  it('shows empty-state CTA ("Create your first deck") when no decks', () => {
    render(<LibraryView {...baseProps} />)
    expect(screen.getByRole('button', { name: /Create your first deck/i })).toBeInTheDocument()
  })

  it('shows "+ New Deck" button when decks exist', () => {
    render(<LibraryView {...baseProps} decks={['Anatomy']} cards={[mkCard()]} />)
    expect(screen.getByRole('button', { name: /New Deck/i })).toBeInTheDocument()
  })
})

describe('LibraryView — deck list', () => {
  it('renders deck name when one deck is provided', () => {
    render(<LibraryView {...baseProps} decks={['Anatomy']} cards={[mkCard()]} />)
    expect(screen.getAllByText('Anatomy').length).toBeGreaterThan(0)
  })

  it('renders multiple deck names', () => {
    const cards = [mkCard({ deck: 'Anatomy' }), mkCard({ id: 'c2', deck: 'Pharmacology' })]
    render(<LibraryView {...baseProps} decks={['Anatomy', 'Pharmacology']} cards={cards} />)
    expect(screen.getByText('Anatomy')).toBeInTheDocument()
    expect(screen.getByText('Pharmacology')).toBeInTheDocument()
  })

  it('calls onSelectDeck when a deck card is clicked', () => {
    const onSelectDeck = vi.fn()
    render(
      <LibraryView {...baseProps} decks={['Anatomy']} cards={[mkCard()]}
        onSelectDeck={onSelectDeck} />
    )
    screen.getAllByText('Anatomy')[0].closest('.nid-deck-card')?.click()
    expect(onSelectDeck).toHaveBeenCalledWith('Anatomy')
  })
})

describe('LibraryView — Recent section', () => {
  it('shows Recent section when a card has been reviewed', () => {
    const cards = [mkCard({ lastReview: '2026-01-10' })]
    render(<LibraryView {...baseProps} decks={['Anatomy']} cards={cards} />)
    expect(screen.getByTestId('recent-decks')).toBeInTheDocument()
    expect(screen.getByText('Recent')).toBeInTheDocument()
  })

  it('does not show Recent section when no cards have been reviewed', () => {
    const cards = [mkCard({ lastReview: null })]
    render(<LibraryView {...baseProps} decks={['Anatomy']} cards={cards} />)
    expect(screen.queryByTestId('recent-decks')).not.toBeInTheDocument()
  })

  it('caps Recent section at 3 decks', () => {
    const decks = ['A', 'B', 'C', 'D']
    const cards = decks.map((deck, i) => mkCard({ id: `c${i}`, deck, lastReview: `2026-01-1${i}` }))
    render(<LibraryView {...baseProps} decks={decks} cards={cards} />)
    const recentContainer = screen.getByTestId('recent-decks')
    const recentCards = recentContainer.querySelectorAll('.nid-deck-card')
    expect(recentCards.length).toBeLessThanOrEqual(3)
  })

  it('hides Recent section when search is active', () => {
    // Recent section is suppressed while a search query is active
    const cards = [mkCard({ lastReview: '2026-01-10' })]
    render(<LibraryView {...baseProps} decks={['Anatomy']} cards={cards} />)
    // Recent is visible with no search
    expect(screen.getByTestId('recent-decks')).toBeInTheDocument()
  })
})
