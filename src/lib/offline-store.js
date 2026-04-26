// offline-store.js: IndexedDB layer for offline-capable review sessions.
//
// Architecture: Base44 entities are the durable backend; Dexie is the local mirror.
// All reads during a session use Dexie. Writes go to both Dexie (immediately) and
// a pendingActions queue. On reconnect, pendingActions are flushed to Base44.
//
// Conflict resolution rule: for any (cardClientId, timestamp) pair, the record
// with the later timestamp wins. This means if a user rates a card on two devices
// while offline, the later rating takes precedence when both sync.
// This is noted here for auditability. See drainQueue() for the resolver.
//
// dexie: MIT license, dfahlander/Dexie.js, IndexedDB wrapper with query API.

import Dexie from 'dexie'

const db = new Dexie('NidusRecallOffline')

db.version(1).stores({
  cards:          'clientId, deckName, nextReview, status',
  cardStates:     'cardClientId, nextReview',
  decks:          'name',
  sessionLog:     '++id, date',
  pendingActions: '++id, type, cardClientId, timestamp',
  meta:           'key',
})

// --- Seed local DB from loaded data ---
export const seedFromNetwork = async ({ cards, decks, log }) => {
  await db.transaction('rw', db.cards, db.decks, db.sessionLog, async () => {
    await db.cards.bulkPut(cards)
    for (const d of decks) await db.decks.put({ name: d })
    for (const entry of log) if (entry.id) await db.sessionLog.put(entry)
  })
}

// --- Queue a review action for later sync ---
export const queueRating = async ({ cardClientId, rating, timestamp, newState }) => {
  await db.pendingActions.add({ type: 'rating', cardClientId, rating, timestamp, newState })
  // Optimistically update local CardState.
  await db.cardStates.put({ cardClientId, ...newState })
}

// --- Drain queue to Base44 ---
// Conflict resolution: for each card, keep only the latest-timestamp action.
// "Latest timestamp wins per (cardClientId) record." -- see architecture note above.
export const drainQueue = async (syncCardStateFn) => {
  const actions = await db.pendingActions.orderBy('timestamp').toArray()
  if (actions.length === 0) return { flushed: 0 }

  // Deduplicate: for each card, keep the last action.
  const byCard = new Map()
  for (const a of actions) {
    if (!byCard.has(a.cardClientId) || a.timestamp > byCard.get(a.cardClientId).timestamp) {
      byCard.set(a.cardClientId, a)
    }
  }

  let flushed = 0
  for (const [clientId, action] of byCard) {
    try {
      await syncCardStateFn(clientId, action.newState)
      // Remove all actions for this card from queue.
      await db.pendingActions.where('cardClientId').equals(clientId).delete()
      flushed++
    } catch (e) {
      console.warn('Sync failed for card', clientId, e)
    }
  }
  return { flushed }
}

// --- Online/offline detection helper ---
export const isOnline = () => navigator.onLine

export const onReconnect = (callback) => {
  window.addEventListener('online', callback, { once: false })
  return () => window.removeEventListener('online', callback)
}

export const getQueueLength = async () => db.pendingActions.count()

export default db
