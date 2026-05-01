/**
 * Tests for Prompt 2.6: raised card text field limits.
 * Verifies the exported constants match the agreed-upon values.
 */

import { describe, it, expect } from 'vitest'
import { FRONT_MAX, BACK_MAX, NOTE_MAX, ANCHOR_MAX, SOURCE_MAX, TAG_MAX_LEN, TAG_MAX_COUNT } from '@/lib/theme'

describe('card text field limits', () => {
  it('FRONT_MAX is 1500', () => {
    expect(FRONT_MAX).toBe(1500)
  })

  it('BACK_MAX is 3000', () => {
    expect(BACK_MAX).toBe(3000)
  })

  it('NOTE_MAX (elaboration) is 5000', () => {
    expect(NOTE_MAX).toBe(5000)
  })

  it('ANCHOR_MAX is 600', () => {
    expect(ANCHOR_MAX).toBe(600)
  })

  it('SOURCE_MAX is unchanged at 200', () => {
    expect(SOURCE_MAX).toBe(200)
  })

  it('TAG_MAX_LEN is unchanged at 50', () => {
    expect(TAG_MAX_LEN).toBe(50)
  })

  it('TAG_MAX_COUNT is unchanged at 5', () => {
    expect(TAG_MAX_COUNT).toBe(5)
  })

  describe('relative ordering', () => {
    it('BACK_MAX > FRONT_MAX', () => {
      expect(BACK_MAX).toBeGreaterThan(FRONT_MAX)
    })

    it('NOTE_MAX > BACK_MAX', () => {
      expect(NOTE_MAX).toBeGreaterThan(BACK_MAX)
    })

    it('ANCHOR_MAX > SOURCE_MAX', () => {
      expect(ANCHOR_MAX).toBeGreaterThan(SOURCE_MAX)
    })
  })
})
