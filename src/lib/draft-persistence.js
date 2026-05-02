// Draft persistence: saves card payloads to localStorage on sync failure.
// Keys: nidus.draft.flashcard.<timestamp>

const KEY_PREFIX = "nidus.draft.flashcard."

export const saveDraft = (cards) => {
  try {
    const key = `${KEY_PREFIX}${Date.now()}`
    localStorage.setItem(key, JSON.stringify(cards))
    return key
  } catch {
    return null
  }
}

export const loadDrafts = () => {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(KEY_PREFIX)) keys.push(k)
    }
    return keys.map(key => {
      try { return { key, cards: JSON.parse(localStorage.getItem(key)) }
      } catch { return null }
    }).filter(Boolean)
  } catch {
    return []
  }
}

export const clearDraft = (key) => {
  try { localStorage.removeItem(key) } catch {}
}

export const clearAllDrafts = () => {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(KEY_PREFIX)) keys.push(k)
    }
    keys.forEach(k => localStorage.removeItem(k))
  } catch {}
}

// Exponential backoff retry wrapper.
// fn: () => Promise
// maxAttempts: number (default 3)
// baseDelayMs: number (default 500)
export const withRetry = async (fn, maxAttempts = 3, baseDelayMs = 500) => {
  let lastError
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < maxAttempts - 1) {
        await new Promise(res => setTimeout(res, baseDelayMs * Math.pow(2, attempt)))
      }
    }
  }
  throw lastError
}
