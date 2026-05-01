/**
 * Tests for Prompt 2.2: tag normalisation, TagInput autocomplete, LibraryView tag filter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/app-params', () => ({
  appParams: { appId: 'test-app', token: '', functionsVersion: 1, appBaseUrl: '' },
}))

import { normalizeTag, TagInput } from '@/components/TagInput'
import { LibraryView } from '@/views/LibraryView'

// ── normalizeTag ─────────────────────────────────────────────────────────────

describe('normalizeTag', () => {
  it('lowercases input', () => {
    expect(normalizeTag('Pharmacology')).toBe('pharmacology')
  })

  it('replaces spaces with hyphens', () => {
    expect(normalizeTag('Drug Targets')).toBe('drug-targets')
  })

  it('strips non-slug chars', () => {
    expect(normalizeTag('cardio/vascular!')).toBe('cardiovascular')
  })

  it('collapses consecutive hyphens', () => {
    expect(normalizeTag('a  b')).toBe('a-b')
  })

  it('trims leading and trailing hyphens', () => {
    expect(normalizeTag('  -hello- ')).toBe('hello')
  })

  it('returns empty string for all-invalid input', () => {
    expect(normalizeTag('!!!')).toBe('')
  })

  it('preserves alphanumeric and hyphens', () => {
    expect(normalizeTag('micro-biology')).toBe('micro-biology')
  })

  it('slices to TAG_MAX_LEN (50)', () => {
    const long = 'a'.repeat(60)
    expect(normalizeTag(long).length).toBe(50)
  })
})

// ── TagInput autocomplete ────────────────────────────────────────────────────

describe('TagInput autocomplete', () => {
  const onChange = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('shows matching suggestions when typing', async () => {
    render(<TagInput tags={[]} onChange={onChange} allTags={['cardiology', 'carditis', 'pharmacology']} />)
    const input = screen.getByTestId('tag-input')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'card' } })
    await waitFor(() => {
      expect(screen.getByTestId('tag-suggestions')).toBeInTheDocument()
    })
    expect(screen.getByTestId('tag-suggestion-cardiology')).toBeInTheDocument()
    expect(screen.getByTestId('tag-suggestion-carditis')).toBeInTheDocument()
    expect(screen.queryByTestId('tag-suggestion-pharmacology')).not.toBeInTheDocument()
  })

  it('does not show suggestions for already-added tags', async () => {
    render(<TagInput tags={['cardiology']} onChange={onChange} allTags={['cardiology', 'carditis']} />)
    const input = screen.getByTestId('tag-input')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'card' } })
    await waitFor(() => screen.getByTestId('tag-suggestions'))
    expect(screen.queryByTestId('tag-suggestion-cardiology')).not.toBeInTheDocument()
    expect(screen.getByTestId('tag-suggestion-carditis')).toBeInTheDocument()
  })

  it('adds tag on suggestion mousedown', async () => {
    render(<TagInput tags={[]} onChange={onChange} allTags={['cardiology']} />)
    const input = screen.getByTestId('tag-input')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'card' } })
    await waitFor(() => screen.getByTestId('tag-suggestion-cardiology'))
    fireEvent.mouseDown(screen.getByTestId('tag-suggestion-cardiology'))
    expect(onChange).toHaveBeenCalledWith(['cardiology'])
  })

  it('hides suggestions when input is empty', () => {
    render(<TagInput tags={[]} onChange={onChange} allTags={['cardiology']} />)
    const input = screen.getByTestId('tag-input')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    expect(screen.queryByTestId('tag-suggestions')).not.toBeInTheDocument()
  })

  it('normalizes tag on Enter', () => {
    render(<TagInput tags={[]} onChange={onChange} allTags={[]} />)
    const input = screen.getByTestId('tag-input')
    fireEvent.change(input, { target: { value: 'Drug Targets' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(['drug-targets'])
  })

  it('does not add duplicate tags', () => {
    render(<TagInput tags={['cardiology']} onChange={onChange} allTags={[]} />)
    const input = screen.getByTestId('tag-input')
    fireEvent.change(input, { target: { value: 'Cardiology' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not add tags beyond TAG_MAX_COUNT (5)', () => {
    render(<TagInput tags={['a','b','c','d','e']} onChange={onChange} allTags={[]} />)
    expect(screen.queryByTestId('tag-input')).not.toBeInTheDocument()
  })
})

// ── LibraryView tag filter ────────────────────────────────────────────────────

const SETTINGS = {
  newCardCap: 15, reviewCap: 100, catchupDays: 7,
  sleepBedtime: null, sleepWindowMinutes: 90, sleepBannerEnabled: false,
}

const makeCard = (deck, tags) => ({
  id: Math.random().toString(36).slice(2),
  deck, tags, front: 'Q', back: 'A', status: 'Active',
  contentType: 'Factual', interval: 1, reviewCount: 0, lapses: 0,
  stability: null, difficulty: null, nextReview: null, lastReview: null,
  ratingHistory: [],
})

describe('LibraryView tag filter', () => {
  const decks     = ['Cardiology', 'Pharmacology', 'Anatomy']
  const cards     = [
    makeCard('Cardiology',   ['heart', 'clinical']),
    makeCard('Pharmacology', ['drug', 'clinical']),
    makeCard('Anatomy',      ['anatomy']),
  ]
  const baseProps = {
    cards, decks, deckMeta: {}, deckParentMap: new Map(),
    settings: SETTINGS, syncStatus: 'idle', lastSynced: null,
    onSelectDeck: vi.fn(), onCreateDeck: vi.fn(), onCreateSampleDeck: vi.fn(),
  }

  it('renders tag filter bar when cards have tags', () => {
    render(<LibraryView {...baseProps} />)
    expect(screen.getByTestId('tag-filter-bar')).toBeInTheDocument()
  })

  it('shows all unique tags as filter chips', () => {
    render(<LibraryView {...baseProps} />)
    expect(screen.getByTestId('tag-filter-anatomy')).toBeInTheDocument()
    expect(screen.getByTestId('tag-filter-clinical')).toBeInTheDocument()
    expect(screen.getByTestId('tag-filter-drug')).toBeInTheDocument()
    expect(screen.getByTestId('tag-filter-heart')).toBeInTheDocument()
  })

  it('filters decks when a tag is clicked', async () => {
    render(<LibraryView {...baseProps} />)
    fireEvent.click(screen.getByTestId('tag-filter-heart'))
    await waitFor(() => {
      // Only Cardiology should be visible
      expect(screen.getByText('Cardiology')).toBeInTheDocument()
      expect(screen.queryByText('Pharmacology')).not.toBeInTheDocument()
      expect(screen.queryByText('Anatomy')).not.toBeInTheDocument()
    })
  })

  it('shows decks matching shared tag', async () => {
    render(<LibraryView {...baseProps} />)
    fireEvent.click(screen.getByTestId('tag-filter-clinical'))
    await waitFor(() => {
      expect(screen.getByText('Cardiology')).toBeInTheDocument()
      expect(screen.getByText('Pharmacology')).toBeInTheDocument()
      expect(screen.queryByText('Anatomy')).not.toBeInTheDocument()
    })
  })

  it('shows clear button when a tag is active', async () => {
    render(<LibraryView {...baseProps} />)
    fireEvent.click(screen.getByTestId('tag-filter-heart'))
    await waitFor(() => {
      expect(screen.getByTestId('tag-filter-clear')).toBeInTheDocument()
    })
  })

  it('clears filter when clear button clicked', async () => {
    render(<LibraryView {...baseProps} />)
    fireEvent.click(screen.getByTestId('tag-filter-heart'))
    await waitFor(() => screen.getByTestId('tag-filter-clear'))
    fireEvent.click(screen.getByTestId('tag-filter-clear'))
    await waitFor(() => {
      expect(screen.getByText('Cardiology')).toBeInTheDocument()
      expect(screen.getByText('Pharmacology')).toBeInTheDocument()
      expect(screen.getByText('Anatomy')).toBeInTheDocument()
    })
  })

  it('does not render tag filter bar when no cards have tags', () => {
    const noTagCards = decks.map(deck => makeCard(deck, []))
    render(<LibraryView {...baseProps} cards={noTagCards} />)
    expect(screen.queryByTestId('tag-filter-bar')).not.toBeInTheDocument()
  })
})
