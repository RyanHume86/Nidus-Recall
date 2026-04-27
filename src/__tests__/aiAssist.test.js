/**
 * Tests for Phase 6 AI-assist safety features.
 * Run with: npx vitest run src/__tests__/aiAssist.test.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/base44Client', () => ({
  base44: {
    functions: { callFunction: vi.fn() },
    entities: {
      CardHistory: {
        filter: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'hist-1', version: 1 }),
      },
    },
  },
}))

import { base44 } from '@/api/base44Client'
import { hasCitationIntent, isClinicalContent, requestAIEdit } from '../api/aiAssist'
import { saveCardHistory, listCardHistory } from '../api/storage'

describe('hasCitationIntent', () => {
  it('returns true for explicit add-citation prompt', () => {
    expect(hasCitationIntent('add a citation for this claim')).toBe(true)
  })
  it('returns true for insert reference prompt', () => {
    expect(hasCitationIntent('insert a reference to this study')).toBe(true)
  })
  it('returns true for find PMID prompt', () => {
    expect(hasCitationIntent('find the PMID for this')).toBe(true)
  })
  it('returns false for ordinary clarity prompt', () => {
    expect(hasCitationIntent('make this easier to understand')).toBe(false)
  })
  it('returns false for blank prompt', () => {
    expect(hasCitationIntent('')).toBe(false)
  })
})

describe('isClinicalContent', () => {
  it('returns true for deck name containing "clinical"', () => {
    expect(isClinicalContent('Clinical Medicine', [])).toBe(true)
  })
  it('returns true for deck name containing "pharm"', () => {
    expect(isClinicalContent('Pharmacology 2', [])).toBe(true)
  })
  it('returns true when a tag matches clinical regex', () => {
    expect(isClinicalContent('General', ['anatomy', 'other'])).toBe(true)
  })
  it('returns true for neuro tag', () => {
    expect(isClinicalContent('Science', ['neuro'])).toBe(true)
  })
  it('returns false for non-clinical deck and no clinical tags', () => {
    expect(isClinicalContent('History', ['wwii', 'dates'])).toBe(false)
  })
  it('returns false for empty inputs', () => {
    expect(isClinicalContent('', [])).toBe(false)
  })
})

describe('requestAIEdit', () => {
  const card = { front: 'Q?', back: 'A.', deck: 'Science', tags: [] }

  it('throws CITATION_REFUSED when citation intent is detected', async () => {
    await expect(
      requestAIEdit(card, 'add a reference to this claim')
    ).rejects.toMatch(/^CITATION_REFUSED:/)
  })

  it('calls invokeLLM for a safe prompt', async () => {
    base44.functions.callFunction.mockResolvedValueOnce(
      JSON.stringify({ front: 'Q?', back: 'Improved A.' })
    )
    const result = await requestAIEdit(card, 'make the answer clearer')
    expect(base44.functions.callFunction).toHaveBeenCalledWith(
      'invokeLLM',
      expect.objectContaining({ prompt: 'make the answer clearer' })
    )
    expect(result.proposed).toMatchObject({ front: 'Q?', back: 'Improved A.' })
  })

  it('returns isClinical=true for a clinical deck', async () => {
    const clinicalCard = { front: 'Q?', back: 'A.', deck: 'Cardiology', tags: [] }
    base44.functions.callFunction.mockResolvedValueOnce(
      JSON.stringify({ front: 'Q?', back: 'Improved A.' })
    )
    const result = await requestAIEdit(clinicalCard, 'clarify this')
    expect(result.isClinical).toBe(true)
  })

  it('returns isClinical=false for a non-clinical deck', async () => {
    base44.functions.callFunction.mockResolvedValueOnce(
      JSON.stringify({ front: 'Q?', back: 'Improved A.' })
    )
    const result = await requestAIEdit(card, 'clarify this')
    expect(result.isClinical).toBe(false)
  })
})

describe('saveCardHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    base44.entities.CardHistory.filter.mockResolvedValue([])
    base44.entities.CardHistory.create.mockResolvedValue({ id: 'hist-1', version: 1 })
  })

  it('creates a version-1 record when no prior records exist', async () => {
    const snapshot = { front: 'Q', back: 'A', elaboration: '', source: '', tags: [] }
    await saveCardHistory('card-abc', snapshot, 'ai', 'claude-3-5-haiku-20241022')
    expect(base44.entities.CardHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        card_id: 'card-abc',
        version: 1,
        modified_by: 'ai',
        ai_model_used: 'claude-3-5-haiku-20241022',
        content_snapshot: snapshot,
      })
    )
  })

  it('increments version when prior records exist', async () => {
    base44.entities.CardHistory.filter.mockResolvedValue([{ version: 1 }, { version: 2 }])
    const snapshot = { front: 'Q2', back: 'A2', elaboration: '', source: '', tags: [] }
    await saveCardHistory('card-abc', snapshot, 'ai', null)
    expect(base44.entities.CardHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ version: 3 })
    )
  })
})

describe('landing page (public/landing.html)', () => {
  let html

  beforeEach(async () => {
    const mod = await import('../../public/landing.html?raw')
    html = mod.default
  })

  const required = [
    'Nidus Recall: spaced repetition for serious learners',
    'og:title', 'og:description', 'og:image', 'og:url',
    'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image',
  ]
  required.forEach(token => {
    it(`contains "${token}"`, () => {
      expect(html).toContain(token)
    })
  })

  it('does not contain any em dashes', () => {
    expect(html).not.toContain('—')
  })
})
