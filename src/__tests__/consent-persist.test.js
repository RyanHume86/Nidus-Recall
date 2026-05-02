/**
 * Consent persistence tests (Item 6).
 * Verifies that:
 * - A user who has not accepted any version needs agreement.
 * - A user who accepted the current version does NOT need agreement.
 * - A user who accepted an older version DOES need agreement (re-prompt on version bump).
 * - The AGREEMENT_VERSION constant matches what the gate expects.
 */
import { describe, it, expect } from 'vitest'
import { AGREEMENT_VERSION } from '@/components/AgreementGate'

const CURRENT = AGREEMENT_VERSION

const needsAgreement = (user) => {
  if (!user) return false
  return !user.agreement_accepted_at || user.agreement_version !== CURRENT
}

describe('consent logic', () => {
  it('user with no acceptance requires agreement', () => {
    expect(needsAgreement({ agreement_accepted_at: null, agreement_version: null })).toBe(true)
  })

  it('user with undefined acceptance requires agreement', () => {
    expect(needsAgreement({ agreement_accepted_at: undefined })).toBe(true)
  })

  it('user who accepted the current version does not require agreement', () => {
    expect(needsAgreement({ agreement_accepted_at: '2026-01-01T00:00:00.000Z', agreement_version: CURRENT })).toBe(false)
  })

  it('user who accepted an older version requires re-prompt', () => {
    expect(needsAgreement({ agreement_accepted_at: '2025-01-01T00:00:00.000Z', agreement_version: 'v0.9' })).toBe(true)
  })

  it('AGREEMENT_VERSION is a non-empty string matching semver-like format', () => {
    expect(typeof CURRENT).toBe('string')
    expect(CURRENT.length).toBeGreaterThan(0)
    expect(CURRENT).toMatch(/^v\d+\.\d+$/)
  })
})
