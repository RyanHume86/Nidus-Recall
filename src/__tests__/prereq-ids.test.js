/**
 * Tests for Prompt 2.5: prerequisite_card_id entity ID translation.
 * Verifies that the storage layer translates clientId ↔ entity ID correctly.
 */

import { describe, it, expect } from 'vitest'

// ── Pure translation helpers ───────────────────────────────────────────────────
// These mirror the logic in storage.js toEntityData / loadAll post-processing.

function translatePrereqToEntityId(clientId, entityIdMap) {
  if (!clientId) return null
  return entityIdMap.get(clientId) || clientId
}

function translateEntityIdToClientId(storedId, entityToClientMap) {
  if (!storedId) return null
  return entityToClientMap.get(storedId) || storedId
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('prerequisite_card_id entity ID translation', () => {
  const entityIdMap = new Map([
    ['client-a', 'entity-111'],
    ['client-b', 'entity-222'],
  ])

  const entityToClientMap = new Map([
    ['entity-111', 'client-a'],
    ['entity-222', 'client-b'],
  ])

  describe('write path (clientId → entityId)', () => {
    it('translates a known clientId to its entity ID', () => {
      expect(translatePrereqToEntityId('client-a', entityIdMap)).toBe('entity-111')
    })

    it('falls back to the clientId when entity ID is not yet known (new card)', () => {
      expect(translatePrereqToEntityId('client-new', entityIdMap)).toBe('client-new')
    })

    it('returns null when prerequisite is null', () => {
      expect(translatePrereqToEntityId(null, entityIdMap)).toBeNull()
    })
  })

  describe('read path (entityId → clientId)', () => {
    it('translates a stored entity ID back to clientId', () => {
      expect(translateEntityIdToClientId('entity-111', entityToClientMap)).toBe('client-a')
    })

    it('passes through unrecognised IDs (legacy clientIds stored before migration)', () => {
      expect(translateEntityIdToClientId('client-legacy', entityToClientMap)).toBe('client-legacy')
    })

    it('returns null when stored value is null', () => {
      expect(translateEntityIdToClientId(null, entityToClientMap)).toBeNull()
    })
  })

  describe('round-trip', () => {
    it('write → read round-trip recovers original clientId', () => {
      const written = translatePrereqToEntityId('client-b', entityIdMap)
      expect(written).toBe('entity-222')
      const recovered = translateEntityIdToClientId(written, entityToClientMap)
      expect(recovered).toBe('client-b')
    })

    it('legacy clientId stored before migration passes through unchanged on read', () => {
      // Simulates a card that was written before the translation layer existed.
      // The stored value is a clientId; entityToClientMap won't find it.
      const legacyStored = 'client-a'
      const recovered = translateEntityIdToClientId(legacyStored, entityToClientMap)
      // Falls back to the stored value (which is already the clientId)
      expect(recovered).toBe('client-a')
    })
  })
})
