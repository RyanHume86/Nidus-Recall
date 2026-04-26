// anki.js: Anki .apkg import parser for Nidus Recall.
//
// Library choices:
// sql.js: MIT license, sql-js/sql.js, SQLite-WASM for browser use.
// fflate: MIT license, 101arrowz/fflate, fast zip in pure JavaScript.
//
// Anki .apkg format: a ZIP archive containing collection.anki2 (SQLite),
// a media JSON mapping, and media files. This parser extracts notes and
// deck structure. Anki scheduling state (SM-2 intervals, ease factors) is
// intentionally discarded: FSRS and SM-2 parameters are not interchangeable,
// and a silent conversion would produce misleading schedules. All imported
// cards start with fresh CardState (new, unreviewed).
//
// Reference: Anki file format documentation at github.com/ankidroid/Anki-Android/wiki

import initSqlJs from 'sql.js'
import { unzipSync } from 'fflate'

// sql.js WASM file must be served from public/. Added via postinstall script in package.json.
// The WASM is loaded lazily so it does not block the initial app load.
let SQL = null
const getSql = async () => {
  if (!SQL) {
    // sql.js locates its WASM via locateFile. We serve sql-wasm.wasm from public/.
    SQL = await initSqlJs({ locateFile: file => `/${file}` })
  }
  return SQL
}

// parseApkg: accepts a File or ArrayBuffer, returns parsed import data.
export const parseApkg = async (fileOrBuffer) => {
  const buffer = fileOrBuffer instanceof ArrayBuffer
    ? new Uint8Array(fileOrBuffer)
    : new Uint8Array(await fileOrBuffer.arrayBuffer())

  // Unzip the .apkg archive.
  const unzipped = unzipSync(buffer)

  // Find the SQLite database file (anki2 or anki21 format).
  const dbKey = Object.keys(unzipped).find(k => k.endsWith('.anki2') || k.endsWith('.anki21'))
  if (!dbKey) throw new Error('No Anki database found in .apkg file.')

  const mediaKey = Object.keys(unzipped).find(k => k === 'media')
  const mediaMap = mediaKey
    ? JSON.parse(new TextDecoder().decode(unzipped[mediaKey]))
    : {}

  const SqlJs = await getSql()
  const db = new SqlJs.Database(unzipped[dbKey])

  // Parse col table for decks and models.
  const colRow = db.exec('SELECT decks, models FROM col')[0]?.values?.[0]
  if (!colRow) throw new Error('Anki collection table missing.')
  const decksJson = JSON.parse(colRow[0])
  const modelsJson = JSON.parse(colRow[1])

  // Build deck id to name map.
  const deckMap = {}
  for (const [id, deck] of Object.entries(decksJson)) {
    deckMap[id] = deck.name
  }

  // Build model id to model map.
  const modelMap = {}
  for (const [id, model] of Object.entries(modelsJson)) {
    modelMap[id] = {
      name: model.name,
      flds: model.flds.map(f => f.name),
      tmpls: model.tmpls.map(t => t.name),
      type: model.type, // 0=standard, 1=cloze
    }
  }

  // Parse notes.
  const notesResult = db.exec('SELECT id, mid, tags, flds FROM notes')
  const notes = (notesResult[0]?.values || []).map(([id, mid, tags, flds]) => ({
    id: String(id),
    modelId: String(mid),
    tags: tags.trim().split(' ').filter(Boolean),
    fields: flds.split('\x1f'),
  }))

  // Parse cards (to get deck assignment and ord).
  const cardsResult = db.exec('SELECT id, nid, did, ord FROM cards')
  // Group cards by note id.
  const cardsByNote = {}
  for (const [cid, nid, did, ord] of (cardsResult[0]?.values || [])) {
    const nidStr = String(nid)
    if (!cardsByNote[nidStr]) cardsByNote[nidStr] = []
    cardsByNote[nidStr].push({ cardId: String(cid), deckId: String(did), ord })
  }

  db.close()

  // Categorise notes by type.
  const summary = { decks: new Set(), basic: 0, cloze: 0, imageOcclusion: 0, unknown: 0 }
  const parsedNotes = []

  for (const note of notes) {
    const model = modelMap[note.modelId]
    if (!model) { summary.unknown++; continue }

    const noteCards = cardsByNote[note.id] || []
    for (const nc of noteCards) {
      summary.decks.add(deckMap[nc.deckId] || 'Default')
    }

    const deckName = noteCards.length > 0 ? (deckMap[noteCards[0].deckId] || 'Default') : 'Default'

    // Detect note type.
    let cardType = 'basic'
    if (model.type === 1 || model.name.toLowerCase().includes('cloze')) {
      cardType = 'cloze'
      summary.cloze++
    } else if (model.name.toLowerCase().includes('occlusion') || model.name.toLowerCase().includes('image')) {
      cardType = 'image_occlusion'
      summary.imageOcclusion++
    } else {
      summary.basic++
    }

    parsedNotes.push({
      noteId: note.id,
      cardType,
      deckName,
      fields: note.fields,
      tags: note.tags,
      model,
      noteCards,
    })
  }

  return {
    notes: parsedNotes,
    deckNames: [...summary.decks],
    summary: {
      decks: summary.decks.size,
      basic: summary.basic,
      cloze: summary.cloze,
      imageOcclusion: summary.imageOcclusion,
      unknown: summary.unknown,
      totalNotes: notes.length,
    },
    mediaMap,
    mediaFiles: unzipped,
  }
}

// convertToNidusCards: converts parsed Anki notes to Nidus Recall card objects.
// Scheduling state is intentionally discarded. See module comment above.
export const convertToNidusCards = (parsedNotes, genId) => {
  const cards = []
  const warnings = []

  // Cloze regex matches {{c1::answer}} and {{c1::answer::hint}} syntax.
  const CLOZE_RE = /\{\{c(\d+)::([^:}]+)(?:::([^}]+))?\}\}/g

  for (const note of parsedNotes) {
    const { cardType, deckName, fields, tags, model } = note

    if (cardType === 'basic') {
      const front = fields[0] || ''
      const back = fields[1] || ''
      cards.push({
        id: genId(), front, back, deck: deckName,
        cardType: 'basic', contentType: 'Factual',
        tags, status: 'Active', interval: 1, reviewCount: 0, lapses: 0,
        ratingHistory: [], connects_to: [], stakes_flag: false,
        stability: null, difficulty: null, nextReview: null, lastReview: null,
        elaboration: '', anchor: null, source: 'Anki import', prerequisite_card_id: null,
        clozeText: null, clozeIndex: null, imageUrl: null,
        occlusionRegions: null, occlusionRegionId: null,
      })
    } else if (cardType === 'cloze') {
      const clozeText = fields[0] || ''
      const indices = new Set()
      let m
      CLOZE_RE.lastIndex = 0
      while ((m = CLOZE_RE.exec(clozeText)) !== null) indices.add(Number(m[1]))
      const sortedIndices = [...indices].sort((a, b) => a - b)

      if (sortedIndices.length === 0) {
        // Treat as basic if no cloze markers found.
        cards.push({
          id: genId(), front: fields[0] || '', back: fields[1] || fields[0] || '',
          deck: deckName, cardType: 'basic', contentType: 'Factual',
          tags, status: 'Active', interval: 1, reviewCount: 0, lapses: 0,
          ratingHistory: [], connects_to: [], stakes_flag: false,
          stability: null, difficulty: null, nextReview: null, lastReview: null,
          elaboration: '', anchor: null, source: 'Anki import', prerequisite_card_id: null,
          clozeText: null, clozeIndex: null, imageUrl: null,
          occlusionRegions: null, occlusionRegionId: null,
        })
        warnings.push(`Note ${note.noteId}: cloze model but no cloze markers found; imported as basic.`)
      } else {
        for (const idx of sortedIndices) {
          CLOZE_RE.lastIndex = 0
          const front = clozeText.replace(CLOZE_RE, (_, i, ans, hint) =>
            Number(i) === idx ? (hint ? `[${hint}]` : '[...]') : ans)
          CLOZE_RE.lastIndex = 0
          const back = clozeText.replace(CLOZE_RE, (_, _i, ans) => ans)
          CLOZE_RE.lastIndex = 0
          cards.push({
            id: genId(), front, back, deck: deckName,
            cardType: 'cloze', clozeText, clozeIndex: idx,
            contentType: 'Factual', tags, status: 'Active', interval: 1,
            reviewCount: 0, lapses: 0, ratingHistory: [], connects_to: [],
            stakes_flag: false, stability: null, difficulty: null,
            nextReview: null, lastReview: null, elaboration: '', anchor: null,
            source: 'Anki import', prerequisite_card_id: null,
            imageUrl: null, occlusionRegions: null, occlusionRegionId: null,
          })
        }
      }
    } else if (cardType === 'image_occlusion') {
      // Image Occlusion Enhanced format is complex; import as basic with warning.
      warnings.push(`Note ${note.noteId}: image occlusion note type detected. Imported as basic card with image reference. Full occlusion geometry is not supported in this import version.`)
      cards.push({
        id: genId(), front: fields[0] || '(Image Occlusion card -- edit to add regions)',
        back: fields[1] || '', deck: deckName,
        cardType: 'basic', contentType: 'Factual',
        tags, status: 'Active', interval: 1, reviewCount: 0, lapses: 0,
        ratingHistory: [], connects_to: [], stakes_flag: false,
        stability: null, difficulty: null, nextReview: null, lastReview: null,
        elaboration: '', anchor: null, source: 'Anki import', prerequisite_card_id: null,
        clozeText: null, clozeIndex: null, imageUrl: null,
        occlusionRegions: null, occlusionRegionId: null,
      })
    }
  }

  return { cards, warnings }
}
