/**
 * Tests for Prompt 2.4: clinical accuracy fields on Flashcard.
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

import { EditCardModal } from '@/modals/EditCardModal'

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeCard = (overrides = {}) => ({
  id: 'card-1',
  front: 'Q', back: 'A',
  contentType: 'Factual', status: 'Active',
  tags: [], elaboration: '', anchor: null, source: null,
  stakes_flag: false, connects_to: [], prerequisite_card_id: null,
  review_status: 'unreviewed', accuracy_date: null, accuracy_reviewer: null, guideline_version: null,
  interval: 1, reviewCount: 0, lapses: 0, stability: null, difficulty: null,
  nextReview: null, lastReview: null, ratingHistory: [], ai_edited: false,
  ...overrides,
})

const baseProps = (card, onUpdateCards = vi.fn()) => ({
  card,
  cards: [card],
  onUpdateCards,
  onClose: vi.fn(),
  decks: ['Cardiology'],
  onSaveHistory: vi.fn(),
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EditCardModal clinical accuracy section', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the clinical accuracy toggle', () => {
    render(<EditCardModal {...baseProps(makeCard())} />)
    expect(screen.getByTestId('clinical-accuracy-toggle')).toBeInTheDocument()
  })

  it('hides the panel by default for unreviewed cards', () => {
    render(<EditCardModal {...baseProps(makeCard())} />)
    expect(screen.queryByTestId('clinical-accuracy-panel')).not.toBeInTheDocument()
  })

  it('opens the panel when toggle is clicked', async () => {
    render(<EditCardModal {...baseProps(makeCard())} />)
    fireEvent.click(screen.getByTestId('clinical-accuracy-toggle'))
    await waitFor(() => {
      expect(screen.getByTestId('clinical-accuracy-panel')).toBeInTheDocument()
    })
  })

  it('auto-opens when card already has a non-default review_status', () => {
    render(<EditCardModal {...baseProps(makeCard({ review_status: 'reviewed' }))} />)
    expect(screen.getByTestId('clinical-accuracy-panel')).toBeInTheDocument()
  })

  it('shows all four fields when panel is open', async () => {
    render(<EditCardModal {...baseProps(makeCard())} />)
    fireEvent.click(screen.getByTestId('clinical-accuracy-toggle'))
    await waitFor(() => screen.getByTestId('review-status-select'))
    expect(screen.getByTestId('accuracy-date-input')).toBeInTheDocument()
    expect(screen.getByTestId('accuracy-reviewer-input')).toBeInTheDocument()
    expect(screen.getByTestId('guideline-version-input')).toBeInTheDocument()
  })

  it('review_status select has three options', async () => {
    render(<EditCardModal {...baseProps(makeCard())} />)
    fireEvent.click(screen.getByTestId('clinical-accuracy-toggle'))
    await waitFor(() => screen.getByTestId('review-status-select'))
    const select = screen.getByTestId('review-status-select')
    const options = Array.from(select.querySelectorAll('option')).map(o => o.value)
    expect(options).toEqual(['unreviewed', 'reviewed', 'outdated'])
  })

  it('pre-fills existing accuracy values', () => {
    const card = makeCard({ review_status: 'reviewed', accuracy_date: '2026-01-15', accuracy_reviewer: 'Dr Smith', guideline_version: 'SAMF 2024' })
    render(<EditCardModal {...baseProps(card)} />)
    expect(screen.getByTestId('review-status-select')).toHaveValue('reviewed')
    expect(screen.getByTestId('accuracy-date-input')).toHaveValue('2026-01-15')
    expect(screen.getByTestId('accuracy-reviewer-input')).toHaveValue('Dr Smith')
    expect(screen.getByTestId('guideline-version-input')).toHaveValue('SAMF 2024')
  })

  it('saves updated clinical accuracy fields on Save changes', async () => {
    const onUpdateCards = vi.fn()
    const card = makeCard()
    render(<EditCardModal {...baseProps(card, onUpdateCards)} />)

    fireEvent.click(screen.getByTestId('clinical-accuracy-toggle'))
    await waitFor(() => screen.getByTestId('review-status-select'))

    fireEvent.change(screen.getByTestId('review-status-select'), { target: { value: 'reviewed' } })
    fireEvent.change(screen.getByTestId('accuracy-date-input'),    { target: { value: '2026-04-01' } })
    fireEvent.change(screen.getByTestId('accuracy-reviewer-input'), { target: { value: 'JD' } })
    fireEvent.change(screen.getByTestId('guideline-version-input'), { target: { value: 'UTD 2025' } })

    fireEvent.click(screen.getByText('Save changes'))

    await waitFor(() => {
      expect(onUpdateCards).toHaveBeenCalled()
      const updated = onUpdateCards.mock.calls[0][0][0]
      expect(updated.review_status).toBe('reviewed')
      expect(updated.accuracy_date).toBe('2026-04-01')
      expect(updated.accuracy_reviewer).toBe('JD')
      expect(updated.guideline_version).toBe('UTD 2025')
    })
  })

  it('shows review_status badge in toggle header when non-default and panel closed', async () => {
    render(<EditCardModal {...baseProps(makeCard({ review_status: 'outdated' }))} />)
    // Panel opens by default for non-unreviewed cards, close it first
    fireEvent.click(screen.getByTestId('clinical-accuracy-toggle'))
    await waitFor(() => {
      // Badge text is "● outdated"; match with regex
      expect(screen.getAllByText(/outdated/i).length).toBeGreaterThan(0)
    })
  })
})
