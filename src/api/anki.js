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

// parseOcclusionSvg: extracts rectangular mask regions from Image Occlusion Enhanced SVG masks.
// Image Occlusion Enhanced stores geometry in field index 2 of the note as inline SVG.
// Returns array of { id, label, type:"rect", x, y, width, height } in fractional coords.
// Falls back to empty array if the SVG cannot be parsed or contains no rects.
const parseOcclusionSvg = (svgString) => {
  if (!svgString || !svgString.includes('<svg')) return []
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(svgString, 'image/svg+xml')
    const rects = Array.from(doc.querySelectorAll('rect'))
    const regions = []
    // Determine SVG coordinate space from viewBox or width/height attributes.
    const svgEl = doc.querySelector('svg')
    const vb = svgEl?.getAttribute('viewBox')?.split(/[,\s]+/).map(Number)
    const svgW = (vb && vb.length >= 4 ? vb[2] : null)
      || parseFloat(svgEl?.getAttribute('width') || '800') || 800
    const svgH = (vb && vb.length >= 4 ? vb[3] : null)
      || parseFloat(svgEl?.getAttribute('height') || '600') || 600
    for (const rect of rects) {
      const id = rect.getAttribute('id') || `region-${regions.length + 1}`
      const label = rect.getAttribute('title') || rect.getAttribute('data-title') || id
      const x = parseFloat(rect.getAttribute('x') || '0')
      const y = parseFloat(rect.getAttribute('y') || '0')
      const w = parseFloat(rect.getAttribute('width') || '0')
      const h = parseFloat(rect.getAttribute('height') || '0')
      if (w <= 0 || h <= 0) continue
      regions.push({
        id, label, type: 'rect',
        x: x / svgW, y: y / svgH,
        width: w / svgW, height: h / svgH,
      })
    }
    return regions
  } catch (_) {
    return []
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
      // Image Occlusion Enhanced format:
      // fields[0] = header/title, fields[1] = image HTML, fields[2] = SVG masks
      // fields[3] = footer (optional), fields[4] = back extra (optional).
      const svgMasks = fields[2] || ''
      const regions = parseOcclusionSvg(svgMasks)

      // Extract image src from the image HTML field.
      let imageUrl = null
      const imgMatch = (fields[1] || '').match(/<img[^>]+src=["']([^"']+)["']/i)
      if (imgMatch) imageUrl = imgMatch[1]

      if (regions.length > 0) {
        // Successfully parsed geometry: create one card per region.
        for (const region of regions) {
          cards.push({
            id: genId(),
            front: region.label,
            back: region.label,
            deck: deckName,
            cardType: 'image_occlusion',
            imageUrl,
            occlusionRegions: regions,
            occlusionRegionId: region.id,
            contentType: 'Factual',
            tags, status: 'Active', interval: 1, reviewCount: 0, lapses: 0,
            ratingHistory: [], connects_to: [], stakes_flag: false,
            stability: null, difficulty: null, nextReview: null, lastReview: null,
            elaboration: '', anchor: null, source: 'Anki import', prerequisite_card_id: null,
            clozeText: null, clozeIndex: null,
          })
        }
      } else {
        // Fallback: SVG parse failed or no regions found; import as basic with warning.
        warnings.push(`Note ${note.noteId}: image occlusion note detected but SVG geometry could not be parsed. Imported as basic card.`)
        cards.push({
          id: genId(), front: fields[0] || '(Image Occlusion card -- edit to add regions)',
          back: fields[3] || fields[1] || '', deck: deckName,
          cardType: 'basic', contentType: 'Factual',
          tags, status: 'Active', interval: 1, reviewCount: 0, lapses: 0,
          ratingHistory: [], connects_to: [], stakes_flag: false,
          stability: null, difficulty: null, nextReview: null, lastReview: null,
          elaboration: '', anchor: null, source: 'Anki import', prerequisite_card_id: null,
          clozeText: null, clozeIndex: null, imageUrl,
          occlusionRegions: null, occlusionRegionId: null,
        })
      }
    }
  }

  return { cards, warnings }
}
