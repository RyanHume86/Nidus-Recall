/**
 * Cloze parser tests (Session 7c).
 * Target: 90% statements and branches on src/lib/cloze.jsx.
 * parseCloze, renderClozeFront, and createClozeCards are pure / near-pure;
 * no Base44 or network mocking required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render } from '@testing-library/react'

vi.mock('@/lib/dates', () => ({
  genId: vi.fn(() => 'test-id'),
}))

import { parseCloze, renderClozeFront, createClozeCards } from '@/lib/cloze'

// ── parseCloze ────────────────────────────────────────────────────────────────

describe('parseCloze', () => {
  it('null input returns empty result', () => {
    expect(parseCloze(null)).toEqual({ indices: [], cards: [] })
  })

  it('empty string returns empty result', () => {
    expect(parseCloze('')).toEqual({ indices: [], cards: [] })
  })

  it('basic {{c1::answer}} produces one card', () => {
    const { indices, cards } = parseCloze('The drug is {{c1::metformin}}.')
    expect(indices).toEqual([1])
    expect(cards).toHaveLength(1)
    expect(cards[0].index).toBe(1)
    expect(cards[0].front).toBe('The drug is [...].')
    expect(cards[0].back).toBe('The drug is metformin.')
  })

  it('{{c1::answer::hint}} replaces blank with hint text', () => {
    const { cards } = parseCloze('Drug: {{c1::metformin::biguanide}}')
    expect(cards[0].front).toBe('Drug: [biguanide]')
    expect(cards[0].back).toBe('Drug: metformin')
  })

  it('multiple indices produce one card per index', () => {
    const { indices, cards } = parseCloze('{{c1::A}} and {{c2::B}}')
    expect(indices).toEqual([1, 2])
    expect(cards).toHaveLength(2)
    expect(cards[0].front).toBe('[...] and B')
    expect(cards[0].back).toBe('A and B')
    expect(cards[1].front).toBe('A and [...]')
    expect(cards[1].back).toBe('A and B')
  })

  it('same index used twice produces one card; both tokens blanked together', () => {
    const { indices, cards } = parseCloze('{{c1::A}} and {{c1::B}}')
    expect(indices).toEqual([1])
    expect(cards).toHaveLength(1)
    expect(cards[0].front).toBe('[...] and [...]')
    expect(cards[0].back).toBe('A and B')
  })

  it('indices sorted numerically regardless of source order', () => {
    const { indices } = parseCloze('{{c3::C}} then {{c1::A}} then {{c2::B}}')
    expect(indices).toEqual([1, 2, 3])
  })

  it('three indices produce three cards', () => {
    const { cards } = parseCloze('{{c1::A}} {{c2::B}} {{c3::C}}')
    expect(cards).toHaveLength(3)
    expect(cards[0].front).toBe('[...] B C')
    expect(cards[1].front).toBe('A [...] C')
    expect(cards[2].front).toBe('A B [...]')
  })

  it('cloze token in the middle of a word', () => {
    const { cards } = parseCloze('un{{c1::happy}}ness')
    expect(cards[0].front).toBe('un[...]ness')
    expect(cards[0].back).toBe('unhappyness')
  })

  it('plain text with no cloze syntax returns empty result', () => {
    const { indices, cards } = parseCloze('No cloze here')
    expect(indices).toEqual([])
    expect(cards).toHaveLength(0)
  })

  it('empty cloze {{c1::}} does not match (answer requires at least one char)', () => {
    const { indices, cards } = parseCloze('{{c1::}}')
    expect(indices).toEqual([])
    expect(cards).toHaveLength(0)
  })

  it('malformed single-colon {{c1:answer}} does not match', () => {
    const { indices, cards } = parseCloze('{{c1:answer}}')
    expect(indices).toEqual([])
    expect(cards).toHaveLength(0)
  })

  it('nested braces {{c1::{nested}}} does not throw', () => {
    expect(() => parseCloze('{{c1::{nested}}}')).not.toThrow()
    const { cards } = parseCloze('{{c1::{nested}}}')
    // Regex extracts partial match ({nested without closing }) - no crash.
    expect(cards.length).toBeGreaterThanOrEqual(0)
  })

  it('large cloze index {{c10::answer}}', () => {
    const { indices, cards } = parseCloze('{{c10::ten}}')
    expect(indices).toEqual([10])
    expect(cards[0].front).toBe('[...]')
    expect(cards[0].back).toBe('ten')
  })

  it('mixed hint and no-hint tokens in the same source', () => {
    const { cards } = parseCloze('{{c1::answer::hint}} and {{c2::plain}}')
    expect(cards[0].front).toBe('[hint] and plain')
    expect(cards[1].front).toBe('answer and [...]')
  })
})

// ── renderClozeFront ──────────────────────────────────────────────────────────

describe('renderClozeFront', () => {
  it('null returns null unchanged', () => {
    expect(renderClozeFront(null)).toBeNull()
  })

  it('empty string is falsy so the guard returns the input unchanged', () => {
    const result = renderClozeFront('')
    expect(result).toBe('')
  })

  it('[...] token becomes a span with nid-cloze-blank class', () => {
    const { container } = render(
      <span>{renderClozeFront('before [...] after')}</span>
    )
    const blank = container.querySelector('.nid-cloze-blank')
    expect(blank).toBeTruthy()
    expect(blank.style.color).toBe('transparent')
  })

  it('[hint] token becomes a styled blank span', () => {
    const { container } = render(
      <span>{renderClozeFront('[biguanide]')}</span>
    )
    expect(container.querySelector('.nid-cloze-blank')).toBeTruthy()
  })

  it('text with no brackets returns array of plain strings', () => {
    const result = renderClozeFront('plain text only')
    expect(Array.isArray(result)).toBe(true)
    expect(result.every(p => typeof p === 'string')).toBe(true)
  })

  it('multiple blanks in one text each become their own span', () => {
    const { container } = render(
      <span>{renderClozeFront('[a] and [b]')}</span>
    )
    expect(container.querySelectorAll('.nid-cloze-blank')).toHaveLength(2)
  })
})

// ── createClozeCards ──────────────────────────────────────────────────────────

describe('createClozeCards', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates one card per cloze index with correct shape', () => {
    const cards = createClozeCards('{{c1::A}} {{c2::B}}', 'My Deck')
    expect(cards).toHaveLength(2)

    const [c1, c2] = cards
    expect(c1.cardType).toBe('cloze')
    expect(c1.deck).toBe('My Deck')
    expect(c1.clozeText).toBe('{{c1::A}} {{c2::B}}')
    expect(c1.clozeIndex).toBe(1)
    expect(c1.front).toBe('[...] B')
    expect(c1.back).toBe('A B')

    expect(c2.clozeIndex).toBe(2)
    expect(c2.front).toBe('A [...]')
  })

  it('each card has an id from genId', () => {
    const cards = createClozeCards('{{c1::X}}', 'Deck')
    expect(cards[0].id).toBe('test-id')
  })

  it('empty cloze text produces no cards', () => {
    expect(createClozeCards('', 'Deck')).toHaveLength(0)
  })

  it('produced cards have required FSRS default fields', () => {
    const [card] = createClozeCards('{{c1::X}}', 'Deck')
    expect(card.status).toBe('Active')
    expect(card.interval).toBe(1)
    expect(card.reviewCount).toBe(0)
    expect(card.lapses).toBe(0)
    expect(card.stability).toBeNull()
    expect(card.difficulty).toBeNull()
    expect(card.nextReview).toBeNull()
    expect(typeof card.createdAt).toBe('string')
  })
})
