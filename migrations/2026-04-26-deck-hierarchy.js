/**
 * Migration: detect "Parent::Child" deck names and convert to nested structure.
 * Idempotent: only processes decks where name contains "::" and parentDeckId is null.
 *
 * Run from the browser console after deployment:
 *   import { migrateUp } from '/migrations/2026-04-26-deck-hierarchy.js'
 *   await migrateUp(base44)
 */

export async function migrateUp(base44) {
  const decks = await base44.entities.Deck.list()
  const nameToId = new Map(decks.map(d => [d.title, d.id]))
  let created = 0, updated = 0

  for (const deck of decks) {
    if (!deck.title.includes('::')) continue
    if (deck.parentDeckId) continue // already migrated

    const parts = deck.title.split('::').map(s => s.trim())
    const parentName = parts[0]
    const childName = parts.slice(1).join(' :: ')

    // Create parent deck if it does not exist.
    let parentId = nameToId.get(parentName)
    if (!parentId) {
      const parent = await base44.entities.Deck.create({ title: parentName, card_count: 0 })
      parentId = parent.id
      nameToId.set(parentName, parentId)
      created++
    }

    // Update child deck: rename and set parentDeckId.
    await base44.entities.Deck.update(deck.id, { title: childName, parentDeckId: parentId })
    updated++
  }
  return { created, updated }
}

export async function migrateDown(base44) {
  // Reverse: flatten child decks back to "Parent::Child" names.
  const decks = await base44.entities.Deck.list()
  const idToTitle = new Map(decks.map(d => [d.id, d.title]))
  let updated = 0
  for (const deck of decks) {
    if (!deck.parentDeckId) continue
    const parentTitle = idToTitle.get(deck.parentDeckId)
    if (parentTitle) {
      await base44.entities.Deck.update(deck.id, { title: `${parentTitle}::${deck.title}`, parentDeckId: null })
      updated++
    }
  }
  return { updated }
}
