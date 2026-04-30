/**
 * Notion API client — direct browser calls.
 *
 * Requires a Notion Internal Integration Token and a database ID.
 * The database must have the integration added in its Connections settings.
 *
 * On first export, missing properties are created on the database automatically.
 */

const BASE    = 'https://api.notion.com/v1'
const VERSION = '2022-06-28'

const h = (token) => ({
  'Authorization':  `Bearer ${token}`,
  'Content-Type':   'application/json',
  'Notion-Version': VERSION,
})

// Property names used in the Notion database
const P = {
  front:       'Front',
  back:        'Back',
  contentType: 'Content Type',
  deck:        'Deck',
  elaboration: 'Elaboration',
  status:      'Status',
  nextReview:  'Next Review',
  interval:    'Interval',
  reviewCount: 'Review Count',
  stability:   'Stability',
  difficulty:  'Difficulty',
  lapses:      'Lapses',
  lastReview:  'Last Review',
  clientId:    'Client ID',
}

/** Parse a Notion database URL or bare ID into a clean UUID. */
export const parseDatabaseId = (raw) => {
  const s = raw.trim()
  // Full URL: notion.so/.../32hexchars or 32hexchars-with-dashes
  const m = s.match(/([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
  return m ? m[1].replace(/-/g, '') : s
}

const ok = async (res) => {
  if (res.ok) return res.json()
  const body = await res.json().catch(() => ({}))
  throw new Error(body.message || `Notion API error ${res.status}`)
}

/** Verify token + database are reachable. Returns the database title. */
export const testConnection = async (token, databaseId) => {
  const db = await ok(
    await fetch(`${BASE}/databases/${parseDatabaseId(databaseId)}`, { headers: h(token) })
  )
  return db.title?.[0]?.plain_text || 'Untitled'
}

/** Add any missing card properties to the Notion database schema. */
const ensureSchema = async (token, dbId) => {
  const db = await ok(
    await fetch(`${BASE}/databases/${dbId}`, { headers: h(token) })
  )
  const existing = Object.keys(db.properties || {})
  const missing  = {}

  /** @type {[string, object][]} */
  const need = [
    [P.back,        { rich_text: {} }],
    [P.contentType, { select: {} }],
    [P.deck,        { select: {} }],
    [P.elaboration, { rich_text: {} }],
    [P.status,      { select: {} }],
    [P.nextReview,  { date: {} }],
    [P.interval,    { number: { format: 'number' } }],
    [P.reviewCount, { number: { format: 'number' } }],
    [P.stability,   { number: { format: 'number' } }],
    [P.difficulty,  { number: { format: 'number' } }],
    [P.lapses,      { number: { format: 'number' } }],
    [P.lastReview,  { date: {} }],
    [P.clientId,    { rich_text: {} }],
  ]

  for (const [name, schema] of need) {
    if (!existing.includes(name)) missing[name] = schema
  }

  if (Object.keys(missing).length > 0) {
    await ok(
      await fetch(`${BASE}/databases/${dbId}`, {
        method: 'PATCH',
        headers: h(token),
        body: JSON.stringify({ properties: missing }),
      })
    )
  }
}

const cardToProps = (card) => ({
  [P.front]:       { title:     [{ text: { content: (card.front || '').slice(0, 2000) } }] },
  [P.back]:        { rich_text: [{ text: { content: (card.back  || '').slice(0, 2000) } }] },
  [P.contentType]: { select:    { name: card.contentType || 'Factual' } },
  [P.deck]:        { select:    { name: card.deck        || 'General' } },
  [P.elaboration]: { rich_text: [{ text: { content: (card.elaboration || '').slice(0, 2000) } }] },
  [P.status]:      { select:    { name: card.status || 'Active' } },
  [P.nextReview]:  card.nextReview ? { date: { start: card.nextReview } } : { date: null },
  [P.interval]:    { number: card.interval    || 1     },
  [P.reviewCount]: { number: card.reviewCount || 0     },
  [P.stability]:   { number: card.stability   ?? null  },
  [P.difficulty]:  { number: card.difficulty  ?? null  },
  [P.lapses]:      { number: card.lapses      || 0     },
  [P.lastReview]:  card.lastReview ? { date: { start: card.lastReview } } : { date: null },
  [P.clientId]:    { rich_text: [{ text: { content: card.id || '' } }] },
})

/**
 * Export all cards to a Notion database.
 * Creates new pages; does not check for duplicates.
 * onProgress(pct) is called after each batch.
 * Returns the count of pages created.
 */
export const exportToNotion = async (token, databaseId, cards, onProgress) => {
  const dbId = parseDatabaseId(databaseId)
  await ensureSchema(token, dbId)

  let created = 0
  const BATCH = 3  // stay under Notion's rate limit (3 req/s per integration)

  for (let i = 0; i < cards.length; i += BATCH) {
    const batch = cards.slice(i, i + BATCH)

    await Promise.all(
      batch.map(async card => {
        await ok(
          await fetch(`${BASE}/pages`, {
            method: 'POST',
            headers: h(token),
            body: JSON.stringify({
              parent:     { database_id: dbId },
              properties: cardToProps(card),
            }),
          })
        )
        created++
      })
    )

    onProgress?.(Math.round(((i + batch.length) / cards.length) * 100))

    // Brief pause between batches to respect rate limits
    if (i + BATCH < cards.length) await new Promise(r => setTimeout(r, 340))
  }

  return created
}

// ── Read helpers ──────────────────────────────────────────────────────────────
const rTitle  = p => p?.title?.[0]?.plain_text   || ''
const rText   = p => p?.rich_text?.[0]?.plain_text || ''
const rSelect = p => p?.select?.name              || ''
const rNum    = p => p?.number ?? null
const rDate   = p => p?.date?.start               || null

/**
 * Import all cards from a Notion database (auto-paginates).
 * Returns an array of card objects in the app's format.
 */
export const importFromNotion = async (token, databaseId) => {
  const dbId  = parseDatabaseId(databaseId)
  const cards = []
  let cursor  = undefined

  do {
    const body = { page_size: 100 }
    if (cursor) body.start_cursor = cursor

    const data = await ok(
      await fetch(`${BASE}/databases/${dbId}/query`, {
        method: 'POST',
        headers: h(token),
        body: JSON.stringify(body),
      })
    )

    for (const page of data.results) {
      const pr = page.properties
      const front = rTitle(pr[P.front])
      const back  = rText(pr[P.back])
      if (!front || !back) continue

      cards.push({
        id:          rText(pr[P.clientId]) || page.id,
        front,
        back,
        contentType: rSelect(pr[P.contentType]) || 'Factual',
        deck:        rSelect(pr[P.deck])        || 'General',
        elaboration: rText(pr[P.elaboration])   || '',
        status:      rSelect(pr[P.status])      || 'Active',
        nextReview:  rDate(pr[P.nextReview]),
        interval:    rNum(pr[P.interval])       ?? 1,
        reviewCount: rNum(pr[P.reviewCount])    ?? 0,
        stability:   rNum(pr[P.stability]),
        difficulty:  rNum(pr[P.difficulty]),
        lapses:      rNum(pr[P.lapses])         ?? 0,
        lastReview:  rDate(pr[P.lastReview]),
      })
    }

    cursor = data.has_more ? data.next_cursor : undefined
  } while (cursor)

  return cards
}
