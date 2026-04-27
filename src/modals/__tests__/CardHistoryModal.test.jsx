/**
 * Tests for CardHistoryModal revert confirmation flow.
 *
 * Spec:
 *  - Clicking "Revert to this version" does NOT immediately mutate the card.
 *  - Confirming the revert calls onRevert with the snapshot and saves a new history entry.
 *  - The diff correctly highlights front and back changes.
 *  - Cancelling the confirmation returns to the history list.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockListCardHistory, mockSaveCardHistory } = vi.hoisted(() => ({
  mockListCardHistory: vi.fn(),
  mockSaveCardHistory: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/api/storage', () => ({
  listCardHistory: mockListCardHistory,
  saveCardHistory: mockSaveCardHistory,
}))

vi.mock('@/lib/theme', () => ({
  C: {
    surface: '#fff', bg: '#f5f0eb', elevated: '#ece8e2', text: '#1a2e22',
    textMut: '#7a9a8a', textSec: '#4a6a5a', border: '#d0d8d2',
    again: '#c0392b', good: '#2e7d52', accent: '#2D6E52',
  },
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const HISTORY = [
  {
    id: 'h2', version: 2, modified_by: 'ai', ai_model_used: 'claude-3',
    modified_at: '2026-01-15T10:00:00Z',
    content_snapshot: { front: 'AI front v2', back: 'AI back v2' },
  },
  {
    id: 'h1', version: 1, modified_by: 'user', ai_model_used: null,
    modified_at: '2026-01-14T08:00:00Z',
    content_snapshot: { front: 'Original front', back: 'Original back' },
  },
]

const CURRENT_CARD = { id: 'card-1', front: 'Current front', back: 'Current back' }

// ── Import under test (after mocks) ──────────────────────────────────────────

import { CardHistoryModal } from '@/modals/CardHistoryModal'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CardHistoryModal revert confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListCardHistory.mockResolvedValue(HISTORY)
  })

  it('renders history list on open', async () => {
    render(
      <CardHistoryModal cardId="card-1" card={CURRENT_CARD} onClose={vi.fn()} onRevert={vi.fn()} />
    )
    await screen.findByText('v2')
    expect(screen.getByText('v1')).toBeInTheDocument()
    expect(screen.getAllByText('Revert to this version')).toHaveLength(2)
  })

  it('clicking revert does NOT call onRevert immediately', async () => {
    const onRevert = vi.fn()
    render(
      <CardHistoryModal cardId="card-1" card={CURRENT_CARD} onClose={vi.fn()} onRevert={onRevert} />
    )
    await screen.findByText('v1')
    fireEvent.click(screen.getAllByText('Revert to this version')[1])
    expect(onRevert).not.toHaveBeenCalled()
  })

  it('shows confirmation pane with diff after clicking revert', async () => {
    render(
      <CardHistoryModal cardId="card-1" card={CURRENT_CARD} onClose={vi.fn()} onRevert={vi.fn()} />
    )
    await screen.findByText('v1')
    fireEvent.click(screen.getAllByText('Revert to this version')[1])
    expect(screen.getByText(/Revert to v1/)).toBeInTheDocument()
    // Current and revert-target content both visible in diff
    expect(screen.getByText('Current front')).toBeInTheDocument()
    expect(screen.getByText('Original front')).toBeInTheDocument()
    expect(screen.getByText('Current back')).toBeInTheDocument()
    expect(screen.getByText('Original back')).toBeInTheDocument()
  })

  it('cancel returns to history list without calling onRevert', async () => {
    const onRevert = vi.fn()
    render(
      <CardHistoryModal cardId="card-1" card={CURRENT_CARD} onClose={vi.fn()} onRevert={onRevert} />
    )
    await screen.findByText('v1')
    fireEvent.click(screen.getAllByText('Revert to this version')[1])
    expect(screen.getByText(/Revert to v1/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.getByText('Edit history')).toBeInTheDocument()
    expect(onRevert).not.toHaveBeenCalled()
  })

  it('confirming revert saves new history entry and calls onRevert', async () => {
    const onRevert = vi.fn()
    const onClose  = vi.fn()
    render(
      <CardHistoryModal cardId="card-1" card={CURRENT_CARD} onClose={onClose} onRevert={onRevert} />
    )
    await screen.findByText('v1')
    fireEvent.click(screen.getAllByText('Revert to this version')[1])
    fireEvent.click(screen.getByText('Confirm revert'))
    await waitFor(() => expect(onRevert).toHaveBeenCalledWith({ front: 'Original front', back: 'Original back' }))
    expect(mockSaveCardHistory).toHaveBeenCalledWith(
      'card-1',
      { front: 'Original front', back: 'Original back' },
      'user',
      null,
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('shows no-diff message when content is identical to current', async () => {
    const identicalCard = { id: 'card-1', front: 'Original front', back: 'Original back' }
    render(
      <CardHistoryModal cardId="card-1" card={identicalCard} onClose={vi.fn()} onRevert={vi.fn()} />
    )
    await screen.findByText('v1')
    fireEvent.click(screen.getAllByText('Revert to this version')[1])
    expect(screen.getByText(/No content differences/)).toBeInTheDocument()
  })

  it('hides revert buttons when onRevert prop is omitted', async () => {
    render(
      <CardHistoryModal cardId="card-1" onClose={vi.fn()} />
    )
    await screen.findByText('v2')
    expect(screen.queryByText('Revert to this version')).not.toBeInTheDocument()
  })
})
