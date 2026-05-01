import { describe, it, expect, beforeEach } from 'vitest'
import { setAuthState, requireAuth } from '../withAuth'

describe('withAuth', () => {
  beforeEach(() => {
    setAuthState(false)
  })

  describe('requireAuth', () => {
    it('throws when not authenticated', () => {
      expect(() => requireAuth('test op')).toThrow('[Nidus]')
    })

    it('sets AUTH_REQUIRED error code', () => {
      let err
      try { requireAuth('test op') } catch (e) { err = e }
      expect(err?.code).toBe('AUTH_REQUIRED')
    })

    it('includes the operation label in the message', () => {
      expect(() => requireAuth('save card')).toThrow('save card')
    })

    it('uses default label when none given', () => {
      expect(() => requireAuth()).toThrow('write')
    })

    it('does not throw when authenticated', () => {
      setAuthState(true)
      expect(() => requireAuth('test op')).not.toThrow()
    })
  })

  describe('setAuthState', () => {
    it('enables writes after authentication', () => {
      setAuthState(false)
      expect(() => requireAuth()).toThrow()
      setAuthState(true)
      expect(() => requireAuth()).not.toThrow()
    })

    it('blocks writes after de-authentication', () => {
      setAuthState(true)
      expect(() => requireAuth()).not.toThrow()
      setAuthState(false)
      expect(() => requireAuth()).toThrow()
    })

    it('coerces truthy values to boolean true', () => {
      setAuthState('yes')
      expect(() => requireAuth()).not.toThrow()
    })

    it('coerces falsy values to boolean false', () => {
      setAuthState(0)
      expect(() => requireAuth()).toThrow()
    })
  })
})
