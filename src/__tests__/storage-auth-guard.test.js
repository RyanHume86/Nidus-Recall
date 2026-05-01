/**
 * Verifies that each Base44 write path in storage.js enforces authentication.
 * Unauthenticated calls must reject with err.code === 'AUTH_REQUIRED'.
 * Authenticated calls must proceed to the API (mocked here to avoid real network calls).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setAuthState } from '@/lib/api/withAuth'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/api/base44Client', () => ({
  base44: {
    entities: {
      Deck:               { create: vi.fn().mockResolvedValue({ id: 'deck-1', title: 'Test' }) },
      Flashcard:          { create: vi.fn().mockResolvedValue({ id: 'fc-1' }), update: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}) },
      CardState:          { create: vi.fn().mockResolvedValue({ id: 'cs-1' }), update: vi.fn().mockResolvedValue({}) },
      SessionLog:         { create: vi.fn().mockResolvedValue({ id: 'sl-1' }), update: vi.fn().mockResolvedValue({}) },
      UserSchedulerParams:{ create: vi.fn().mockResolvedValue({ id: 'usp-1' }), update: vi.fn().mockResolvedValue({}) },
      CardHistory:        { create: vi.fn().mockResolvedValue({ id: 'ch-1' }), filter: vi.fn().mockResolvedValue([]) },
    },
    auth: { me: vi.fn().mockResolvedValue(null), updateMe: vi.fn().mockResolvedValue({}) },
  },
}))

vi.mock('@/lib/app-params', () => ({
  appParams: { appId: 'test', token: '', functionsVersion: 1, appBaseUrl: '' },
}))

// ── Import write functions AFTER mocks ────────────────────────────────────────

import {
  ensureDeck,
  syncCards,
  syncCardState,
  saveUserSchedulerParams,
  appendLog,
  updateLog,
  saveCardHistory,
} from '@/api/storage'

// ── Helpers ───────────────────────────────────────────────────────────────────

const AUTH_REQUIRED = { code: 'AUTH_REQUIRED' }

function expectAuthRequired(fn) {
  return expect(fn()).rejects.toMatchObject(AUTH_REQUIRED)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('storage write-path auth guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setAuthState(false)
  })

  it('ensureDeck — rejects when not authenticated', async () => {
    // Force past in-memory cache by using a unique deck name
    await expectAuthRequired(() => ensureDeck('__unauth_deck__'))
  })

  it('syncCards — throws synchronously when not authenticated', () => {
    expect(() => syncCards([])).toThrow('[Nidus]')
    let err
    try { syncCards([]) } catch (e) { err = e }
    expect(err?.code).toBe('AUTH_REQUIRED')
  })

  it('syncCardState — rejects when not authenticated', async () => {
    await expectAuthRequired(() => syncCardState('card-1', { stability: 1 }))
  })

  it('saveUserSchedulerParams — rejects when not authenticated', async () => {
    await expectAuthRequired(() => saveUserSchedulerParams([1, 2, 3], 10))
  })

  it('appendLog — rejects when not authenticated', async () => {
    await expectAuthRequired(() => appendLog({ date: new Date().toISOString() }))
  })

  it('updateLog — rejects when not authenticated', async () => {
    await expectAuthRequired(() => updateLog('log-1', { reviewed: 5 }))
  })

  it('saveCardHistory — rejects when not authenticated', async () => {
    await expectAuthRequired(() => saveCardHistory('card-1', { front: 'Q', back: 'A' }))
  })
})

describe('storage write-path proceeds when authenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setAuthState(true)
  })

  it('appendLog — calls SessionLog.create when authenticated', async () => {
    const { base44 } = await import('@/api/base44Client')
    await appendLog({ date: '2026-01-01T00:00:00Z', reviewed: 3 })
    expect(base44.entities.SessionLog.create).toHaveBeenCalledTimes(1)
  })

  it('updateLog — calls SessionLog.update when authenticated', async () => {
    const { base44 } = await import('@/api/base44Client')
    await updateLog('log-1', { reviewed: 5 })
    expect(base44.entities.SessionLog.update).toHaveBeenCalledWith('log-1', { reviewed: 5 })
  })

  it('saveUserSchedulerParams — calls create when no existing record', async () => {
    const { base44 } = await import('@/api/base44Client')
    await saveUserSchedulerParams([1, 2, 3], 10)
    expect(base44.entities.UserSchedulerParams.create).toHaveBeenCalledTimes(1)
  })
})
