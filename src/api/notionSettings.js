/**
 * Notion credential storage: keeps the integration token server-side
 * in the Base44 User entity rather than in localStorage.
 *
 * Falls back to localStorage for unauthenticated sessions or when the
 * User entity is unreachable (offline / SDK not configured).
 */

import { base44 } from '@/api/base44Client'
import { notionGet as lsGet, notionSet as lsSet, SK } from '@/lib/settings'

const tryLsClear = () => {
  try { localStorage.removeItem(SK.notion) } catch {}
}

/**
 * Read Notion credentials.
 * Prefers the User entity; falls back to localStorage.
 * Returns { token: string, db: string }.
 */
export const getNotionCredentials = async () => {
  try {
    const user = await base44.auth.me()
    if (user?.notion_integration_token || user?.notion_database_id) {
      return {
        token: user.notion_integration_token || '',
        db:    user.notion_database_id        || '',
      }
    }
  } catch {}
  const ls = lsGet()
  return { token: ls.token || '', db: ls.db || '' }
}

/**
 * Persist Notion credentials to the User entity.
 * Clears the localStorage copy once the server write succeeds.
 */
export const setNotionCredentials = async (token, db) => {
  await base44.auth.updateMe({
    notion_integration_token: token || null,
    notion_database_id:       db    || null,
  })
  tryLsClear()
}

/**
 * Remove Notion credentials from the User entity and localStorage.
 */
export const clearNotionCredentials = async () => {
  await base44.auth.updateMe({
    notion_integration_token: null,
    notion_database_id:       null,
  })
  tryLsClear()
}

/**
 * One-time migration: if a token exists in localStorage but not in the
 * User entity, write it through and clear localStorage.
 * Safe to call multiple times; idempotent.
 */
export const migrateNotionCredentials = async () => {
  const ls = lsGet()
  if (!ls.token && !ls.db) return
  try {
    const user = await base44.auth.me()
    if (!user?.notion_integration_token && !user?.notion_database_id) {
      await base44.auth.updateMe({
        notion_integration_token: ls.token || null,
        notion_database_id:       ls.db    || null,
      })
    }
    // User entity now has the data (either just migrated or already present).
    lsSet({})
    tryLsClear()
  } catch {
    // Non-fatal: localStorage fallback remains in place.
  }
}
