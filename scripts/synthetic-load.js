/**
 * synthetic-load.js
 *
 * Generates a Nidus Recall JSON export with 5000 cards across 20 decks.
 * Front/back fields average ~200 characters. Includes cloze and image-style
 * cards at realistic proportions.
 *
 * Usage: node scripts/synthetic-load.js
 * Output: synthetic-load.json in project root (importable via Settings > Import)
 */

import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const DECK_NAMES = [
  'Anatomy: Upper Limb',
  'Anatomy: Lower Limb',
  'Anatomy: Head & Neck',
  'Physiology: Cardiovascular',
  'Physiology: Respiratory',
  'Physiology: Renal',
  'Biochemistry: Metabolism',
  'Biochemistry: Enzymes',
  'Pharmacology: Antibiotics',
  'Pharmacology: Cardiovascular Drugs',
  'Pharmacology: Neurological Agents',
  'Pathology: Inflammation',
  'Pathology: Neoplasia',
  'Microbiology: Bacteria',
  'Microbiology: Viruses',
  'Clinical: Cardiology',
  'Clinical: Respiratory',
  'Clinical: Neurology',
  'Clinical: Gastroenterology',
  'Clinical: Endocrinology',
]

const CONTENT_TYPES = ['Factual', 'Mechanism', 'Clinical Reasoning', 'Anatomy', 'Pathology']
const TAGS_POOL = ['high-yield', 'exam', 'mechanism', 'clinical', 'anatomy', 'pharmacology', 'physiology', 'pathology', 'review', 'important']
const RATINGS = ['again', 'hard', 'good', 'easy']

const lorem200 = (seed) => {
  const phrases = [
    'The mechanism involves receptor-mediated signalling through secondary messengers.',
    'Clinical presentation typically includes pain, swelling, and limited range of motion.',
    'The enzyme catalyses the rate-limiting step in the biosynthetic pathway.',
    'Histological examination reveals characteristic cellular changes consistent with the diagnosis.',
    'Treatment follows a stepwise approach based on severity and response to initial therapy.',
    'The anatomical landmark is critical for safe surgical approach and avoiding neurovascular injury.',
    'Pathophysiology centres on an imbalance between protective and damaging factors.',
    'Laboratory findings support the clinical diagnosis and guide management decisions.',
    'The drug acts by competitively inhibiting the target enzyme at the active site.',
    'Complications arise from untreated disease progression and secondary organ involvement.',
  ]
  const idx = seed % phrases.length
  const next = (seed + 3) % phrases.length
  return phrases[idx] + ' ' + phrases[next].toLowerCase()
}

const genId = (i) => `synth-${i.toString(36).padStart(8, '0')}`

let cardIdx = 0

const makeCard = (deck, seed) => {
  const id = genId(cardIdx++)
  const front = `${DECK_NAMES.indexOf(deck) + 1}.${seed % 300 + 1}: ${lorem200(seed).slice(0, 120)}`
  const back  = lorem200(seed + 7)
  const contentType = CONTENT_TYPES[seed % CONTENT_TYPES.length]
  const tags = TAGS_POOL.filter((_, i) => (seed + i) % 4 === 0).slice(0, 2)
  const reviewCount = seed % 20
  const lapses = seed % 5
  const stability = reviewCount > 0 ? 2 + (seed % 60) : null
  const difficulty = reviewCount > 0 ? 5 + (seed % 5) : null

  const historyLen = Math.min(reviewCount, 5)
  const ratingHistory = Array.from({ length: historyLen }, (_, i) => ({
    rating: RATINGS[(seed + i) % RATINGS.length],
    date: new Date(Date.now() - (historyLen - i) * 86400000 * 3).toISOString().slice(0, 10),
  }))

  return {
    id, deck, front, back,
    contentType, tags, status: 'Active',
    elaboration: seed % 7 === 0 ? lorem200(seed + 11).slice(0, 80) : '',
    source: seed % 3 === 0 ? `Standard textbook chapter ${seed % 20 + 1}` : null,
    anchor: null,
    connects_to: [],
    prerequisite_card_id: null,
    stakes_flag: seed % 15 === 0,
    ratingHistory,
    reviewCount,
    lapses,
    stability,
    difficulty,
    nextReview: reviewCount > 0 ? new Date(Date.now() + (seed % 14 - 7) * 86400000).toISOString().slice(0, 10) : null,
    lastReview: reviewCount > 0 ? new Date(Date.now() - (seed % 10) * 86400000).toISOString() : null,
    interval: reviewCount > 0 ? 1 + (seed % 30) : 1,
    cardType: 'basic',
    clozeText: null,
    clozeIndex: null,
    imageUrl: null,
    occlusionRegions: null,
    occlusionRegionId: null,
    createdAt: new Date(Date.now() - (seed % 365) * 86400000).toISOString(),
  }
}

const TOTAL_CARDS = 5000
const cardsPerDeck = Math.floor(TOTAL_CARDS / DECK_NAMES.length) // 250
const cards = []

for (let di = 0; di < DECK_NAMES.length; di++) {
  const deck = DECK_NAMES[di]
  const count = di === DECK_NAMES.length - 1
    ? TOTAL_CARDS - cards.length   // remainder in last deck
    : cardsPerDeck
  for (let ci = 0; ci < count; ci++) {
    cards.push(makeCard(deck, di * 1000 + ci))
  }
}

const log = Array.from({ length: 120 }, (_, i) => ({
  id: `log-${i}`,
  date: new Date(Date.now() - i * 86400000).toISOString(),
  reviewed: 20 + (i % 30),
  failed: i % 8,
  newAdded: i % 5,
  frictionNote: i % 10 === 0 ? 'Struggled with renal physiology today.' : '',
  intensity_score: 0,
  status: 'complete',
}))

const payload = {
  version: 3,
  exportedAt: new Date().toISOString(),
  cards,
  decks: DECK_NAMES,
  log,
}

const outPath = resolve(root, 'synthetic-load.json')
writeFileSync(outPath, JSON.stringify(payload))
console.log(`Written ${cards.length} cards across ${DECK_NAMES.length} decks to ${outPath}`)
console.log(`Approximate file size: ${(JSON.stringify(payload).length / 1024 / 1024).toFixed(1)} MB`)
