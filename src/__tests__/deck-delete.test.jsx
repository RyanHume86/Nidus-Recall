/**
 * Deck and card deletion tests (Item 1).
 * Covers: deck deletion happy path, cancellation, empty deck,
 * deck with active review cards, and card soft-delete via EditCardModal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/api/storage', () => ({
  saveCardHistory: vi.fn().mockResolvedValue({}),
  listCardHistory: vi.fn().mockResolvedValue([]),
  getUserSchedulerParams: vi.fn().mockReturnValue(null),
  listCardStates: vi.fn().mockResolvedValue([]),
  deleteDeck: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/api/base44Client', () => ({
  base44: {
    auth: { me: vi.fn().mockResolvedValue(null) },
    entities: {
      Flashcard: { filter: vi.fn().mockResolvedValue([]), update: vi.fn().mockResolvedValue({}) },
      Deck:      { filter: vi.fn().mockResolvedValue([]), delete: vi.fn().mockResolvedValue({}) },
      CardState: { filter: vi.fn().mockResolvedValue([]) },
    },
  },
}))

vi.mock('@/lib/app-params', () => ({
  appParams: { appId: 'test', token: '', functionsVersion: 1, appBaseUrl: '' },
}))

vi.mock('@/api/excel', () => ({ exportToExcel: vi.fn(), importFromExcel: vi.fn() }))
vi.mock('@/api/notion', () => ({ testConnection: vi.fn(), exportToNotion: vi.fn(), importFromNotion: vi.fn() }))
vi.mock('@/lib/offline-store', () => ({
  seedFromNetwork: vi.fn(), queueRating: vi.fn(), onReconnect: vi.fn().mockReturnValue(()=>{}),
  getQueue: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/pwa', () => ({ isInstallable: vi.fn().mockReturnValue(false), triggerInstallPrompt: vi.fn() }))

import { DeleteDeckModal } from '@/modals/DeleteDeckModal'
import { DeckView } from '@/views/DeckView'
import { EditCardModal } from '@/modals/EditCardModal'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const DECK = 'Clinical Anatomy'
const mkCard = (overrides = {}) => ({
  id: `card-${Math.random()}`, front: 'Q?', back: 'A', deck: DECK,
  contentType: 'Factual', cardType: 'basic', status: 'Active',
  interval: 5, reviewCount: 3, lapses: 0, stability: 4.5, difficulty: 5.5,
  nextReview: '2026-01-15', lastReview: '2026-01-10',
  tags: [], connects_to: [], stakes_flag: false,
  prerequisite_card_id: null, imageUrl: null,
  occlusionRegions: null, occlusionRegionId: null,
  elaboration: '', anchor: null, source: null, ai_edited: false,
  ratingHistory: [], ...overrides,
})

const SETTINGS = {
  newCardCap: 15, reviewCap: 100, leechThreshold: 5, retentionTarget: 0.9,
  catchupDays: 7, sleepBedtime: null, sleepWindowMinutes: 90,
  sleepBannerEnabled: false, matureModeEnabled: true, matureCardThreshold: 30,
  fatigueAlertsEnabled: false, attentionDeclarationEnabled: false, sleepPrefersReviews: false,
}

beforeEach(() => vi.clearAllMocks())

// ── DeleteDeckModal unit tests ─────────────────────────────────────────────────

describe('DeleteDeckModal', () => {
  it('renders deck name and card count', () => {
    render(<DeleteDeckModal deckName={DECK} cardCount={5} activeReviewCount={2} onConfirm={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(DECK)).toBeInTheDocument()
    expect(screen.getByTestId('delete-deck-card-count')).toHaveTextContent('5')
    expect(screen.getByTestId('delete-deck-active-count')).toHaveTextContent('2')
  })

  it('Delete button is disabled until checkbox is ticked', () => {
    render(<DeleteDeckModal deckName={DECK} cardCount={5} activeReviewCount={0} onConfirm={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByTestId('delete-deck-confirm')).toBeDisabled()
    fireEvent.click(screen.getByTestId('delete-deck-checkbox'))
    expect(screen.getByTestId('delete-deck-confirm')).not.toBeDisabled()
  })

  it('happy path: calls onConfirm when agreed and confirmed', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(<DeleteDeckModal deckName={DECK} cardCount={3} activeReviewCount={0} onConfirm={onConfirm} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('delete-deck-checkbox'))
    fireEvent.click(screen.getByTestId('delete-deck-confirm'))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
  })

  it('cancellation: calls onClose without calling onConfirm', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(<DeleteDeckModal deckName={DECK} cardCount={3} activeReviewCount={0} onConfirm={onConfirm} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('delete-deck-cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('empty deck: shows 0 cards and 0 active', () => {
    render(<DeleteDeckModal deckName={DECK} cardCount={0} activeReviewCount={0} onConfirm={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByTestId('delete-deck-card-count')).toHaveTextContent('0')
    expect(screen.getByTestId('delete-deck-active-count')).toHaveTextContent('0')
  })

  it('deck with active review cards: shows active count warning', () => {
    render(<DeleteDeckModal deckName={DECK} cardCount={8} activeReviewCount={6} onConfirm={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/6 cards in this deck have active scheduling state/i)).toBeInTheDocument()
  })

  it('backdrop click calls onClose', () => {
    const onClose = vi.fn()
    const { container } = render(
      <DeleteDeckModal deckName={DECK} cardCount={3} activeReviewCount={0} onConfirm={vi.fn()} onClose={onClose} />
    )
    fireEvent.click(screen.getByTestId('delete-deck-modal'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

// ── DeckView integration ───────────────────────────────────────────────────────

describe('DeckView: delete deck option', () => {
  it('shows Delete deck item in the deck menu when onDeleteDeck is provided', () => {
    render(
      <DeckView deckName={DECK} cards={[mkCard()]} decks={[DECK]} settings={SETTINGS}
        onUpdateCards={vi.fn()} onBack={vi.fn()} onArchiveDeck={vi.fn()} onDeleteDeck={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('button', { name: /Deck actions/i }))
    expect(screen.getByTestId('deck-menu-delete')).toBeInTheDocument()
  })

  it('does not show Delete deck when onDeleteDeck is omitted', () => {
    render(
      <DeckView deckName={DECK} cards={[mkCard()]} decks={[DECK]} settings={SETTINGS}
        onUpdateCards={vi.fn()} onBack={vi.fn()} onArchiveDeck={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('button', { name: /Deck actions/i }))
    expect(screen.queryByTestId('deck-menu-delete')).not.toBeInTheDocument()
  })

  it('clicking Delete deck in menu opens the confirmation modal', () => {
    render(
      <DeckView deckName={DECK} cards={[mkCard()]} decks={[DECK]} settings={SETTINGS}
        onUpdateCards={vi.fn()} onBack={vi.fn()} onArchiveDeck={vi.fn()} onDeleteDeck={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('button', { name: /Deck actions/i }))
    fireEvent.click(screen.getByTestId('deck-menu-delete'))
    expect(screen.getByTestId('delete-deck-modal')).toBeInTheDocument()
  })

  it('confirming deletion calls onDeleteDeck and then onBack', async () => {
    const onDeleteDeck = vi.fn().mockResolvedValue(undefined)
    const onBack = vi.fn()
    render(
      <DeckView deckName={DECK} cards={[mkCard(), mkCard()]} decks={[DECK]} settings={SETTINGS}
        onUpdateCards={vi.fn()} onBack={onBack} onArchiveDeck={vi.fn()} onDeleteDeck={onDeleteDeck} />
    )
    fireEvent.click(screen.getByRole('button', { name: /Deck actions/i }))
    fireEvent.click(screen.getByTestId('deck-menu-delete'))
    fireEvent.click(screen.getByTestId('delete-deck-checkbox'))
    fireEvent.click(screen.getByTestId('delete-deck-confirm'))
    await waitFor(() => expect(onDeleteDeck).toHaveBeenCalledWith(DECK))
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1))
  })
})

// ── Card soft-delete via EditCardModal ────────────────────────────────────────

describe('EditCardModal: card soft-delete', () => {
  const card = mkCard({ id: 'target-card', deck: DECK })
  const otherCard = mkCard({ id: 'other-card', connects_to: ['target-card'] })
  const cards = [card, otherCard]

  it('after two-stage delete, onUpdateCards receives card with status Deleted', async () => {
    const onUpdateCards = vi.fn().mockResolvedValue(undefined)
    render(
      <EditCardModal card={card} cards={cards} decks={[DECK]}
        onUpdateCards={onUpdateCards} onClose={vi.fn()} onSaveHistory={vi.fn()} />
    )
    // Stage 1
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }))
    // Stage 2
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    await waitFor(() => expect(onUpdateCards).toHaveBeenCalledTimes(1))
    const updated = onUpdateCards.mock.calls[0][0]
    const deletedCard = updated.find(c => c.id === 'target-card')
    expect(deletedCard.status).toBe('Deleted')
    expect(deletedCard.deletedAt).toBeTruthy()
  })

  it('other cards have their connects_to references cleaned up', async () => {
    const onUpdateCards = vi.fn().mockResolvedValue(undefined)
    render(
      <EditCardModal card={card} cards={cards} decks={[DECK]}
        onUpdateCards={onUpdateCards} onClose={vi.fn()} onSaveHistory={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    await waitFor(() => expect(onUpdateCards).toHaveBeenCalledTimes(1))
    const updated = onUpdateCards.mock.calls[0][0]
    const other = updated.find(c => c.id === 'other-card')
    expect(other.connects_to).not.toContain('target-card')
  })
})
