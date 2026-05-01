/**
 * Tests for Prompt 3.3: every icon-only button has an accessible name.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/app-params', () => ({
  appParams: { appId: 'test-app', token: '', functionsVersion: 1, appBaseUrl: '' },
}))
vi.mock('@/api/storage', () => ({
  saveCardHistory: vi.fn(),
  listCardHistory: vi.fn().mockResolvedValue([]),
}))

import { DeckView } from '@/views/DeckView'
import { EditCardModal } from '@/modals/EditCardModal'
import { AIDiffModal } from '@/modals/AIDiffModal'
import { Tooltip } from '@/components/Tooltip'

const makeCard = (overrides = {}) => ({
  id: 'card-1', front: 'Q', back: 'A', deck: 'D',
  contentType: 'Factual', status: 'Active', tags: [],
  elaboration: '', anchor: null, source: null,
  stakes_flag: false, connects_to: [], prerequisite_card_id: null,
  review_status: 'unreviewed', accuracy_date: null,
  accuracy_reviewer: null, guideline_version: null,
  interval: 1, reviewCount: 0, lapses: 0,
  stability: null, difficulty: null, nextReview: null,
  lastReview: null, ratingHistory: [], ai_edited: false,
  ...overrides,
})

describe('icon-only button accessible names', () => {
  it('DeckView back button has aria-label', () => {
    render(<DeckView deckName="D" cards={[]} onUpdateCards={vi.fn()} onBack={vi.fn()} decks={['D']} settings={{}} onArchiveDeck={vi.fn()} />)
    expect(screen.getByRole('button', { name: /back to library/i })).toBeInTheDocument()
  })

  it('DeckView deck-actions button has aria-label', () => {
    render(<DeckView deckName="D" cards={[]} onUpdateCards={vi.fn()} onBack={vi.fn()} decks={['D']} settings={{}} onArchiveDeck={vi.fn()} />)
    expect(screen.getByRole('button', { name: /deck actions/i })).toBeInTheDocument()
  })

  it('DeckView quick-add button has aria-label', () => {
    render(<DeckView deckName="D" cards={[]} onUpdateCards={vi.fn()} onBack={vi.fn()} decks={['D']} settings={{}} onArchiveDeck={vi.fn()} />)
    expect(screen.getByRole('button', { name: /quick add a card/i })).toBeInTheDocument()
  })

  it('EditCardModal close button has aria-label', () => {
    render(<EditCardModal card={makeCard()} cards={[makeCard()]} onUpdateCards={vi.fn()} onClose={vi.fn()} decks={['D']} onSaveHistory={vi.fn()} />)
    expect(screen.getByRole('button', { name: /close editor/i })).toBeInTheDocument()
  })

  it('AIDiffModal dismiss button has aria-label', () => {
    render(<AIDiffModal original={{ front: 'Q', back: 'A' }} proposed={{ front: 'Q2', back: 'A2' }} isClinical={false} onApprove={vi.fn()} onEdit={vi.fn()} onReject={vi.fn()} />)
    expect(screen.getByRole('button', { name: /dismiss changes/i })).toBeInTheDocument()
  })
})

describe('Tooltip component', () => {
  it('renders children', () => {
    render(<Tooltip label="Help text"><button>X</button></Tooltip>)
    expect(screen.getByText('X')).toBeInTheDocument()
  })

  it('does not show tooltip text initially', () => {
    render(<Tooltip label="My tooltip"><button>X</button></Tooltip>)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
