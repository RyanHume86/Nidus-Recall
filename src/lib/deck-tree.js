// buildDeckTree: builds hierarchical deck list from parentMap (from storage.getDeckParentMap()).
// Falls back to "::" name convention when parentMap has no entries.
// After the 2026-04-26-deck-hierarchy migration runs, parentDeckId populates parentMap.
export const buildDeckTree = (deckNames, parentMap = new Map()) => {
  // If parentMap is populated, use parent/child relationships.
  if (parentMap && parentMap.size > 0) {
    const result = []
    const roots = deckNames.filter(n => !parentMap.has(n)).sort()
    const addNode = (name, depth) => {
      result.push({ name, displayName: name.split('::').pop().trim(), indent: depth })
      const children = deckNames.filter(n => parentMap.get(n) === name).sort()
      for (const child of children) addNode(child, depth + 1)
    }
    for (const root of roots) addNode(root, 0)
    // Include orphans (parentMap references non-existent parent).
    const seen = new Set(result.map(r => r.name))
    for (const name of deckNames) {
      if (!seen.has(name)) result.push({ name, displayName: name.split('::').pop().trim(), indent: 0 })
    }
    return result
  }
  // Fallback: derive hierarchy from "::" in name.
  return deckNames.map(name => ({
    name,
    displayName: name.includes('::') ? name.split('::').pop().trim() : name,
    indent: name.includes('::') ? (name.split('::').length - 1) : 0,
  }))
}
