/**
 * Tests for Prompt 3.1: DeckView two-column layout, sort, and inline edit.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/app-params', () => ({
  appParams: { appId: 'test-app', token: '', functionsVersion: 1, appBaseUrl: '' },
}))

vi.mock('@/api/storage', () => ({
  saveCardHistory: vi.fn(),
  listCardHistory: vi.fn().mockResolvedValue([]),
}))

import { DeckView } from '@/views/DeckView'

const TODAY = '2026-05-02'

const makeCard = (overrides = {}) => ({
  id: overrides.id || `card-${Math.random()}`,
  front: overrides.front || 'Front text',
  back: overrides.back || 'Back text',
  deck: 'TestDeck',
  contentType: overrides.contentType || 'Factual',
  status: overrides.status || 'Active',
  tags: overrides.tags || [],
  elaboration: '', anchor: null, source: null,
  stakes_flag: overrides.stakes_flag || false,
  connects_to: [],
  prerequisite_card_id: null,
  review_status: 'unreviewed', accuracy_date: null,
  accuracy_reviewer: null, guideline_version: null,
  interval: 1, reviewCount: 0, lapses: overrides.lapses || 0,
  stability: null, difficulty: null,
  nextReview: overrides.nextReview || null,
  lastReview: overrides.lastReview || null,
  ratingHistory: [], ai_edited: false,
  ...overrides,
})

const baseProps = (cards = [], onUpdateCards = vi.fn()) => ({
  deckName: 'TestDeck',
  cards,
  onUpdateCards,
  onBack: vi.fn(),
  decks: ['TestDeck'],
  settings: {},
  onArchiveDeck: vi.fn(),
})

describe('DeckView layout', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders left and right panels', () => {
    render(<DeckView {...baseProps()} />)
    expect(screen.getByTestId('deck-view')).toBeInTheDocument()
    expect(screen.getByTestId('deck-right-panel')).toBeInTheDocument()
  })

  it('shows empty state when no cards', () => {
    render(<DeckView {...baseProps()} />)
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
  })

  it('renders card rows for active cards', () => {
    const card = makeCard({ id: 'c1', front: 'What is ATP?' })
    render(<DeckView {...baseProps([card])} />)
    expect(screen.getByTestId('card-row-c1')).toBeInTheDocument()
    expect(screen.getByText('What is ATP?')).toBeInTheDocument()
  })

  it('truncates front text at 80 characters in the row', () => {
    const longFront = 'A'.repeat(90)
    const card = makeCard({ id: 'c1', front: longFront })
    render(<DeckView {...baseProps([card])} />)
    const row = screen.getByTestId('card-row-c1')
    expect(row.textContent).toContain('…')
    expect(row.textContent).not.toContain(longFront)
  })

  it('shows contentType chip in the card row', () => {
    const card = makeCard({ id: 'c1', contentType: 'Mechanism' })
    render(<DeckView {...baseProps([card])} />)
    const row = screen.getByTestId('card-row-c1')
    expect(row.textContent).toContain('Mechanism')
  })

  it('shows ★ for high-stakes card', () => {
    const card = makeCard({ id: 'c1', stakes_flag: true })
    render(<DeckView {...baseProps([card])} />)
    const row = screen.getByTestId('card-row-c1')
    expect(row.textContent).toContain('★')
  })

  it('shows nextReview date in card row', () => {
    const card = makeCard({ id: 'c1', nextReview: TODAY })
    render(<DeckView {...baseProps([card])} />)
    const row = screen.getByTestId('card-row-c1')
    expect(row.textContent).toContain(TODAY)
  })

  it('clicking a card row shows edit form in right panel (desktop width)', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1440 })
    const card = makeCard({ id: 'c1', front: 'What is ATP?' })
    render(<DeckView {...baseProps([card])} />)
    fireEvent.click(screen.getByTestId('card-row-c1'))
    await waitFor(() => {
      expect(screen.getAllByText('Edit card').length).toBeGreaterThan(0)
    })
  })

  it('right panel reverts to Add card after dismissing edit (desktop width)', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1440 })
    const card = makeCard({ id: 'c1' })
    render(<DeckView {...baseProps([card])} />)
    fireEvent.click(screen.getByTestId('card-row-c1'))
    await waitFor(() => screen.getAllByText('Edit card')[0])
    // close via the desktop ✕ button in the right panel header
    fireEvent.click(screen.getByText('✕'))
    await waitFor(() => {
      expect(screen.getByTestId('deck-right-panel').textContent).toContain('Add card')
    })
  })

  it('search filters the card list', async () => {
    const c1 = makeCard({ id: 'c1', front: 'Cardiology question' })
    const c2 = makeCard({ id: 'c2', front: 'Neurology question' })
    render(<DeckView {...baseProps([c1, c2])} />)
    fireEvent.change(screen.getByTestId('deck-search'), { target: { value: 'Cardiology' } })
    await waitFor(() => {
      expect(screen.getByTestId('card-row-c1')).toBeInTheDocument()
      expect(screen.queryByTestId('card-row-c2')).not.toBeInTheDocument()
    })
  })
})

describe('DeckView sort', () => {
  beforeEach(() => vi.clearAllMocks())

  const cards = [
    makeCard({ id: 'c1', front: 'Zebra question', lapses: 0, nextReview: '2026-05-10' }),
    makeCard({ id: 'c2', front: 'Apple question', lapses: 5, nextReview: '2026-05-03' }),
    makeCard({ id: 'c3', front: 'Mango question', lapses: 2, nextReview: '2026-05-07' }),
  ]

  it('renders sort dropdown', () => {
    render(<DeckView {...baseProps(cards)} />)
    expect(screen.getByTestId('sort-select')).toBeInTheDocument()
  })

  it('front A-Z sorts cards alphabetically', async () => {
    render(<DeckView {...baseProps(cards)} />)
    fireEvent.change(screen.getByTestId('sort-select'), { target: { value: 'front-az' } })
    await waitFor(() => {
      const list = screen.getByTestId('card-list')
      const rows = list.querySelectorAll('[data-testid^="card-row-"]')
      expect(rows[0].getAttribute('data-testid')).toBe('card-row-c2')  // Apple
      expect(rows[1].getAttribute('data-testid')).toBe('card-row-c3')  // Mango
      expect(rows[2].getAttribute('data-testid')).toBe('card-row-c1')  // Zebra
    })
  })

  it('next-due sorts by nextReview ascending', async () => {
    render(<DeckView {...baseProps(cards)} />)
    fireEvent.change(screen.getByTestId('sort-select'), { target: { value: 'next-due' } })
    await waitFor(() => {
      const list = screen.getByTestId('card-list')
      const rows = list.querySelectorAll('[data-testid^="card-row-"]')
      expect(rows[0].getAttribute('data-testid')).toBe('card-row-c2')  // 2026-05-03
      expect(rows[2].getAttribute('data-testid')).toBe('card-row-c1')  // 2026-05-10
    })
  })

  it('most-lapsed sorts by lapses descending', async () => {
    render(<DeckView {...baseProps(cards)} />)
    fireEvent.change(screen.getByTestId('sort-select'), { target: { value: 'most-lapsed' } })
    await waitFor(() => {
      const list = screen.getByTestId('card-list')
      const rows = list.querySelectorAll('[data-testid^="card-row-"]')
      expect(rows[0].getAttribute('data-testid')).toBe('card-row-c2')  // lapses 5
      expect(rows[2].getAttribute('data-testid')).toBe('card-row-c1')  // lapses 0
    })
  })
})

describe('DeckView save updates list', () => {
  it('adding a card calls onUpdateCards with new card appended', async () => {
    const onUpdateCards = vi.fn()
    render(<DeckView {...baseProps([], onUpdateCards)} />)
    fireEvent.change(screen.getAllByPlaceholderText(/question or prompt/i)[0], { target: { value: 'My question' } })
    fireEvent.change(screen.getAllByPlaceholderText(/concise answer/i)[0], { target: { value: 'My answer' } })
    // Use the submit button inside the right panel (there may be multiple "Add card" texts)
    const addBtn = screen.getAllByText('Add card').find(el => el.tagName === 'BUTTON')
    fireEvent.click(addBtn)
    await waitFor(() => {
      expect(onUpdateCards).toHaveBeenCalled()
      const updated = onUpdateCards.mock.calls[0][0]
      expect(updated.some(c => c.front === 'My question')).toBe(true)
    })
  })
})
