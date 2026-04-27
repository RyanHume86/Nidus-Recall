/**
 * Tests for src/api/notionSettings.js
 *
 * Covers:
 *  - getNotionCredentials: prefers User entity, falls back to localStorage
 *  - setNotionCredentials: writes to User entity, clears localStorage
 *  - clearNotionCredentials: nullifies both fields
 *  - migrateNotionCredentials: one-shot migration, idempotent, non-fatal on error
 *  - Export redaction: after migration, localStorage no longer contains the token
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mock handles (must precede vi.mock calls) ─────────────────────────

const { mockMe, mockUpdateMe } = vi.hoisted(() => ({
  mockMe:       vi.fn().mockResolvedValue(null),
  mockUpdateMe: vi.fn().mockResolvedValue({}),
}))

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/api/base44Client', () => ({
  base44: {
    auth: {
      me:       mockMe,
      updateMe: mockUpdateMe,
      logout:   vi.fn(),
    },
    entities: {},
    functions: { callFunction: vi.fn().mockResolvedValue({}) },
  },
}))

// Minimal localStorage simulation via notionGet / notionSet spies
const lsStore = {}

vi.mock('@/lib/settings', () => ({
  SK: { notion: 'nidus-notion' },
  notionGet: vi.fn(() => {
    try {
      const v = lsStore['nidus-notion']
      return v ? JSON.parse(v) : {}
    } catch { return {} }
  }),
  notionSet: vi.fn((v) => {
    lsStore['nidus-notion'] = JSON.stringify(v)
  }),
}))

// ── Module under test (imported after mocks) ─────────────────────────────────

import {
  getNotionCredentials,
  setNotionCredentials,
  clearNotionCredentials,
  migrateNotionCredentials,
} from '@/api/notionSettings'

// ── Helpers ───────────────────────────────────────────────────────────────────

const setLs  = (token, db) => { lsStore['nidus-notion'] = JSON.stringify({ token, db }) }
const clearLs = () => { delete lsStore['nidus-notion'] }

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getNotionCredentials', () => {
  beforeEach(() => { vi.clearAllMocks(); clearLs() })

  it('returns User entity credentials when present', async () => {
    mockMe.mockResolvedValueOnce({ notion_integration_token: 'secret_abc', notion_database_id: 'db-123' })
    expect(await getNotionCredentials()).toEqual({ token: 'secret_abc', db: 'db-123' })
  })

  it('falls back to localStorage when User entity has no credentials', async () => {
    mockMe.mockResolvedValueOnce({ role: 'user' })
    setLs('secret_ls_token', 'ls-db-id')
    expect(await getNotionCredentials()).toEqual({ token: 'secret_ls_token', db: 'ls-db-id' })
  })

  it('falls back to localStorage when auth.me throws', async () => {
    mockMe.mockRejectedValueOnce(new Error('offline'))
    setLs('fallback_token', 'fallback_db')
    expect(await getNotionCredentials()).toEqual({ token: 'fallback_token', db: 'fallback_db' })
  })

  it('returns empty strings when no credentials exist anywhere', async () => {
    mockMe.mockResolvedValueOnce({})
    expect(await getNotionCredentials()).toEqual({ token: '', db: '' })
  })
})

describe('setNotionCredentials', () => {
  beforeEach(() => { vi.clearAllMocks(); clearLs() })

  it('calls updateMe with the token and db', async () => {
    await setNotionCredentials('secret_new', 'db-new')
    expect(mockUpdateMe).toHaveBeenCalledWith({
      notion_integration_token: 'secret_new',
      notion_database_id:       'db-new',
    })
  })

  it('round-trips: set then get returns the same values', async () => {
    await setNotionCredentials('secret_rt', 'db-rt')
    mockMe.mockResolvedValueOnce({ notion_integration_token: 'secret_rt', notion_database_id: 'db-rt' })
    expect(await getNotionCredentials()).toEqual({ token: 'secret_rt', db: 'db-rt' })
  })

  it('sends null for empty strings', async () => {
    await setNotionCredentials('', '')
    expect(mockUpdateMe).toHaveBeenCalledWith({
      notion_integration_token: null,
      notion_database_id:       null,
    })
  })
})

describe('clearNotionCredentials', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls updateMe with null for both fields', async () => {
    await clearNotionCredentials()
    expect(mockUpdateMe).toHaveBeenCalledWith({
      notion_integration_token: null,
      notion_database_id:       null,
    })
  })
})

describe('migrateNotionCredentials', () => {
  beforeEach(() => { vi.clearAllMocks(); clearLs() })

  it('does nothing when localStorage is empty', async () => {
    await migrateNotionCredentials()
    expect(mockMe).not.toHaveBeenCalled()
    expect(mockUpdateMe).not.toHaveBeenCalled()
  })

  it('migrates token from localStorage to User entity when User entity is empty', async () => {
    setLs('secret_migrate', 'db-migrate')
    mockMe.mockResolvedValueOnce({ role: 'user' })
    await migrateNotionCredentials()
    expect(mockUpdateMe).toHaveBeenCalledWith({
      notion_integration_token: 'secret_migrate',
      notion_database_id:       'db-migrate',
    })
  })

  it('does not overwrite existing User entity credentials (idempotent)', async () => {
    setLs('secret_old', 'db-old')
    mockMe.mockResolvedValueOnce({ notion_integration_token: 'secret_server', notion_database_id: 'db-server' })
    await migrateNotionCredentials()
    expect(mockUpdateMe).not.toHaveBeenCalled()
  })

  it('clears localStorage after migration succeeds', async () => {
    setLs('secret_clear', 'db-clear')
    mockMe.mockResolvedValueOnce({})
    const { notionGet } = await import('@/lib/settings')
    await migrateNotionCredentials()
    expect(notionGet()).toEqual({})
  })

  it('is non-fatal when auth.me throws', async () => {
    setLs('secret_err', 'db-err')
    mockMe.mockRejectedValueOnce(new Error('network error'))
    await expect(migrateNotionCredentials()).resolves.toBeUndefined()
    expect(mockUpdateMe).not.toHaveBeenCalled()
  })
})

describe('export redaction', () => {
  beforeEach(() => { vi.clearAllMocks(); clearLs() })

  it('localStorage no longer contains token after successful migration', async () => {
    setLs('secret_redact', 'db-redact')
    mockMe.mockResolvedValueOnce({})
    await migrateNotionCredentials()
    const { notionGet } = await import('@/lib/settings')
    const ls = notionGet()
    expect(ls.token).toBeFalsy()
    expect(ls.db).toBeFalsy()
  })
})
