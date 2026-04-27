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
import { unzipSync, zipSync } from 'fflate'

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

// _setSqlJs: test-only escape hatch. Allows tests to inject a pre-loaded sql.js
// instance (loaded from the filesystem) without needing a browser WASM loader.
export const _setSqlJs = (instance) => { SQL = instance }

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

// ── Export ─────────────────────────────────────────────────────────────────────

// noteGuid: compact base-62 encoding of a note ID for Anki's guid column.
const noteGuid = (id) => {
  const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  let n = Math.abs(id)
  let s = ''
  do { s = CHARS[n % 62] + s; n = Math.floor(n / 62) } while (n > 0)
  return s.padStart(7, '0')
}

// strHash: djb2 hash used for Anki's sfld checksum (duplicate detection; non-critical).
const strHash = (s) => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// buildApkg: builds an Anki .apkg archive from Nidus Recall cards.
// Returns a Uint8Array ready for download as filename.apkg.
//
// Card type mapping:
//   basic          -> Anki Basic model (Front / Back)
//   cloze          -> Anki Cloze model (Text / Back Extra); grouped by clozeText
//   image_occlusion -> "Nidus Image Occlusion" 5-field model with SVG mask at field[2];
//                      one note per region so round-tripping back into Nidus preserves geometry.
//
// Scheduling state is intentionally discarded; all exported cards are new (type=0).
export const buildApkg = async (cards) => {
  const SqlJs = await getSql()
  const db = new SqlJs.Database()

  db.run(`CREATE TABLE col (id INTEGER, crt INTEGER, mod INTEGER, scm INTEGER, ver INTEGER, dty INTEGER, usn INTEGER, ls INTEGER, conf TEXT, models TEXT, decks TEXT, dconf TEXT, tags TEXT)`)
  db.run(`CREATE TABLE notes (id INTEGER PRIMARY KEY, guid TEXT, mid INTEGER, mod INTEGER, usn INTEGER, tags TEXT, flds TEXT, sfld TEXT, csum INTEGER, flags INTEGER, data TEXT)`)
  db.run(`CREATE TABLE cards (id INTEGER PRIMARY KEY, nid INTEGER, did INTEGER, ord INTEGER, mod INTEGER, usn INTEGER, type INTEGER, queue INTEGER, due INTEGER, ivl INTEGER, factor INTEGER, reps INTEGER, lapses INTEGER, left INTEGER, odue INTEGER, odid INTEGER, flags INTEGER, data TEXT)`)
  db.run(`CREATE TABLE revlog (id INTEGER PRIMARY KEY, cid INTEGER, usn INTEGER, ease INTEGER, ivl INTEGER, lastIvl INTEGER, factor INTEGER, time INTEGER, type INTEGER)`)
  db.run(`CREATE TABLE graves (usn INTEGER, oid INTEGER, type INTEGER)`)

  const now = Math.floor(Date.now() / 1000)
  const BASE = Date.now()
  const MODEL_BASIC = BASE
  const MODEL_CLOZE = BASE + 1
  const MODEL_OCCL  = BASE + 2

  const CSS = '.card { font-family: arial; font-size: 20px; color: black; background-color: white; } img { max-width: 100%; height: auto; }'
  const LATEX_PRE  = '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n'
  const LATEX_POST = '\\end{document}'
  const fld = (name, ord) => ({ name, ord, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] })
  const tmpl = (name, ord, qfmt, afmt) => ({ name, ord, qfmt, afmt, bqfmt: '', bafmt: '', did: null, bfont: '', bsize: 0 })

  const models = {
    [MODEL_BASIC]: {
      id: MODEL_BASIC, name: 'Basic', type: 0, mod: now, usn: -1, sortf: 0, did: null, css: CSS,
      latexPre: LATEX_PRE, latexPost: LATEX_POST, req: [[0, 'any', [0]]],
      flds: [fld('Front', 0), fld('Back', 1)],
      tmpls: [tmpl('Card 1', 0, '{{Front}}', '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}')],
    },
    [MODEL_CLOZE]: {
      id: MODEL_CLOZE, name: 'Cloze', type: 1, mod: now, usn: -1, sortf: 0, did: null, css: CSS,
      latexPre: LATEX_PRE, latexPost: LATEX_POST, req: [[0, 'all', [0]]],
      flds: [fld('Text', 0), fld('Back Extra', 1)],
      tmpls: [tmpl('Cloze', 0, '{{cloze:Text}}', '{{cloze:Text}}<br>\n{{Back Extra}}')],
    },
    [MODEL_OCCL]: {
      id: MODEL_OCCL, name: 'Nidus Image Occlusion', type: 0, mod: now, usn: -1, sortf: 0, did: null, css: CSS,
      latexPre: LATEX_PRE, latexPost: LATEX_POST, req: [[0, 'any', [0]]],
      // 5-field layout mirrors Image Occlusion Enhanced so parseApkg can round-trip the regions.
      flds: [fld('Header', 0), fld('Image', 1), fld('Image Occlusion Mask', 2), fld('Footer', 3), fld('Back Extra', 4)],
      tmpls: [tmpl('Card 1', 0, '{{Header}}<br>{{Image}}', '{{FrontSide}}<hr id=answer>{{Header}}')],
    },
  }

  // Build deck entries
  let deckCtr = BASE + 10
  const deckIdByName = {}
  const decksJson = {
    1: { id: 1, name: 'Default', conf: 1, desc: '', dyn: 0, collapsed: false, mod: now, usn: -1, lrnToday: [0,0], revToday: [0,0], newToday: [0,0], timeToday: [0,0] },
  }
  for (const name of [...new Set(cards.map(c => c.deck || 'Default'))]) {
    const did = ++deckCtr
    deckIdByName[name] = did
    decksJson[did] = { id: did, name, conf: 1, desc: '', dyn: 0, collapsed: false, mod: now, usn: -1, lrnToday: [0,0], revToday: [0,0], newToday: [0,0], timeToday: [0,0] }
  }

  const dconf = { 1: { id: 1, mod: now, name: 'Default', usn: -1, maxTaken: 60, autoplay: true, timer: 0, replayq: true, new: { bury: false, delays: [1,10], initialFactor: 2500, ints: [1,4,0], order: 1, perDay: 20, separate: true }, lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 }, rev: { bury: false, ease4: 1.3, fuzz: 0.05, ivlFct: 1, maxIvl: 36500, minSpace: 1, perDay: 200 } } }
  const conf = { activeDecks: [1], curDeck: 1, newSpread: 0, collapseTime: 1200, timeLim: 0, estTimes: true, dueCounts: true, curModel: String(MODEL_BASIC), nextPos: 1, sortType: 'noteFld', sortBackwards: false, addToCur: true }

  db.run('INSERT INTO col VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [
    1, now, now, BASE, 11, 0, -1, 0,
    JSON.stringify(conf), JSON.stringify(models),
    JSON.stringify(decksJson), JSON.stringify(dconf), '{}',
  ])

  let noteIdCtr = BASE + 1000
  let cardIdCtr = BASE + 2000

  const insertNote = (mid, tags, flds, sfld) => {
    const nid = ++noteIdCtr
    const tagsStr = tags.length > 0 ? ` ${tags.join(' ')} ` : ' '
    db.run('INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [nid, noteGuid(nid), mid, now, -1, tagsStr, flds, sfld, strHash(sfld), 0, ''])
    return nid
  }

  const insertCard = (nid, did, ord) => {
    db.run('INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [++cardIdCtr, nid, did, ord, now, -1, 0, 0, 1, 0, 2500, 0, 0, 0, 0, 0, 0, ''])
  }

  // Media accumulator
  let mediaCtr = 0
  const mediaMap   = {} // numericId -> filename
  const mediaFiles = {} // numericId -> Uint8Array

  const packDataUri = (uri) => {
    const [head, b64] = (uri || '').split(',')
    if (!b64) return uri
    const mime = head.match(/data:([^;]+)/)?.[1] || ''
    const ext = mime === 'image/svg+xml' ? 'svg' : mime === 'image/png' ? 'png' : mime.includes('jpeg') ? 'jpg' : 'png'
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const numId  = String(mediaCtr++)
    mediaMap[numId]   = `${numId}.${ext}`
    mediaFiles[numId] = bytes
    return numId
  }

  // Classify and insert cards
  const basic = cards.filter(c => !c.cardType || c.cardType === 'basic')

  const clozeGroups = new Map()
  const occlusionGroups = new Map()
  for (const c of cards) {
    if (c.cardType === 'cloze' && c.clozeText) {
      const key = `${c.deck || 'Default'}\x00${c.clozeText}`
      if (!clozeGroups.has(key)) clozeGroups.set(key, [])
      clozeGroups.get(key).push(c)
    } else if (c.cardType === 'image_occlusion') {
      const key = `${c.deck || 'Default'}\x00${c.imageUrl || ''}`
      if (!occlusionGroups.has(key)) occlusionGroups.set(key, [])
      occlusionGroups.get(key).push(c)
    }
  }

  for (const c of basic) {
    const did = deckIdByName[c.deck || 'Default'] || 1
    const nid = insertNote(MODEL_BASIC, c.tags || [], `${c.front || ''}\x1f${c.back || ''}`, c.front || '')
    insertCard(nid, did, 0)
  }

  for (const [, group] of clozeGroups) {
    const c = group[0]
    const did = deckIdByName[c.deck || 'Default'] || 1
    const nid = insertNote(MODEL_CLOZE, c.tags || [], `${c.clozeText}\x1f${c.back || ''}`, c.clozeText)
    const sorted = [...group].sort((a, b) => (a.clozeIndex || 1) - (b.clozeIndex || 1))
    for (const card of sorted) insertCard(nid, did, (card.clozeIndex || 1) - 1)
  }

  for (const [, group] of occlusionGroups) {
    const c = group[0]
    const did = deckIdByName[c.deck || 'Default'] || 1
    let imgRef = c.imageUrl || ''
    if (imgRef.startsWith('data:')) imgRef = packDataUri(imgRef)
    const imgTag = `<img src="${imgRef}">`
    const allRegions = c.occlusionRegions || []

    for (const card of group) {
      const region = allRegions.find(r => r.id === card.occlusionRegionId) || {}
      const label  = region.label || card.front || 'Region'
      // SVG coordinate space 800x600; fractional coords -> pixels
      const SVG_W = 800, SVG_H = 600
      const rx = Math.round((region.x || 0) * SVG_W)
      const ry = Math.round((region.y || 0) * SVG_H)
      const rw = Math.round((region.width  || 0.1) * SVG_W)
      const rh = Math.round((region.height || 0.1) * SVG_H)
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_W} ${SVG_H}"><rect id="${region.id || 'r0'}" title="${label}" x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="#ffeba2" stroke="#2d6e52" stroke-width="2"/></svg>`
      // 5-field layout: Header \x1f Image \x1f Mask \x1f Footer \x1f Back Extra
      const flds = `${label}\x1f${imgTag}\x1f${svg}\x1f\x1f`
      const nid = insertNote(MODEL_OCCL, card.tags || [], flds, label)
      insertCard(nid, did, 0)
    }
  }

  const dbBytes = db.export()
  db.close()

  const zipInput = {
    'collection.anki2': [dbBytes, { level: 0 }],
    'media': [new TextEncoder().encode(JSON.stringify(mediaMap)), { level: 6 }],
  }
  for (const [numId, bytes] of Object.entries(mediaFiles)) zipInput[numId] = [bytes, { level: 0 }]

  return zipSync(zipInput)
}
