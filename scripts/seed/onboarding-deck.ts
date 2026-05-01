/**
 * Idempotent seed script — wipes anonymous test data and ensures the
 * "How to use Nidus Recall" onboarding deck exists with its five cards.
 *
 * Auth: reads BASE44_TOKEN from the environment or from .env.local.
 * To get your token: open the Nidus app, open DevTools → Console, and run:
 *   localStorage.getItem('base44_access_token')
 *
 * Usage:
 *   BASE44_TOKEN=<token> npm run seed:onboarding
 *   # or: echo "BASE44_TOKEN=<token>" > .env.local && npm run seed:onboarding
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const APP_ID   = '69eb23a1d22acead8735ff3c'
const API_BASE = 'https://base44.app/api'

const TEST_DECK_ID = '69ef69e98a58dc6595135503' // "Happy" test deck

const ONBOARDING_DECK = {
  title:       'How to use Nidus Recall',
  color:       '#2D6E52',
  is_sample:   true,
  description: "A guided introduction to Nidus Recall's key features — active recall, scheduling, and card authoring tools.",
}

const ONBOARDING_CARDS = [
  {
    clientId:    'onboarding-active-recall-001',
    front:       'What is active recall, and why does Nidus Recall ask you to type your answer before revealing it?',
    back:        'Active recall means retrieving a memory without seeing the answer first. The act of retrieval strengthens the memory trace far more than re-reading. Typing your answer forces effortful retrieval even when you score poorly — this is the testing effect.',
    contentType: 'Factual',
    stakes_flag: false,
    status:      'Active',
  },
  {
    clientId:    'onboarding-stakes-flag-001',
    front:       'What does the stakes_flag field do on a flashcard?',
    back:        'Marking a card with stakes_flag=true tells Nidus to prioritise it in the session queue — it appears earlier and is harder to defer. Use it for cards where a wrong answer in real life has high consequences (e.g., drug dosing, critical diagnoses, emergency protocols).',
    contentType: 'Factual',
    stakes_flag: false,
    status:      'Active',
  },
  {
    clientId:    'onboarding-anchor-field-001',
    front:       'What should you write in the anchor field when creating a card?',
    back:        'The anchor is a personal memory hook — a real case, vivid moment, or story that links the new fact to something you already know. A strong anchor can replace months of repetition. Example: "The patient with the bell-clapper deformity on my urology rotation."',
    contentType: 'Factual',
    stakes_flag: false,
    status:      'Active',
  },
  {
    clientId:    'onboarding-prerequisite-card-001',
    front:       'What does setting prerequisite_card_id on a card do?',
    back:        'The card is held out of your review queue until the prerequisite card reaches a stability of ≥ 7 days. Use it to sequence learning: if Card B only makes sense once Card A is consolidated, set Card A\'s clientId as Card B\'s prerequisite_card_id.',
    contentType: 'Factual',
    stakes_flag: false,
    status:      'Active',
  },
  {
    clientId:    'onboarding-mature-mode-001',
    front:       'When does a card enter "mature" mode in the SRS schedule, and how can you check it?',
    back:        'A card is considered mature once its stability reaches ≥ 21 days — it will appear infrequently but remain in the queue indefinitely. Open the CardHistory drawer (⏱ icon) on any card to see its stability, interval, and rating history.',
    contentType: 'Factual',
    stakes_flag: false,
    status:      'Active',
  },
]

// ── helpers ────────────────────────────────────────────────────────────────

function loadToken(): string {
  if (process.env.BASE44_TOKEN) return process.env.BASE44_TOKEN.trim()
  const envPath = resolve(process.cwd(), '.env.local')
  try {
    const content = readFileSync(envPath, 'utf-8')
    const match   = content.match(/^BASE44_TOKEN=(.+)$/m)
    if (match) return match[1].trim()
  } catch { /* file not found */ }
  throw new Error(
    'BASE44_TOKEN not set.\n' +
    'Set it as an env var or add BASE44_TOKEN=<token> to .env.local.\n' +
    'Get your token: open the app → DevTools Console → ' +
    "localStorage.getItem('base44_access_token')"
  )
}

type FetchOptions = { method?: string; body?: unknown }

async function api<T>(token: string, path: string, opts: FetchOptions = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method:  opts.method ?? 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-App-Id':      APP_ID,
      'Content-Type':  'application/json',
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Base44 ${opts.method ?? 'GET'} ${path} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

function entityPath(name: string) { return `/apps/${APP_ID}/entities/${name}` }

async function listEntities<T>(token: string, name: string, query?: Record<string, unknown>): Promise<T[]> {
  const path   = entityPath(name)
  const url    = query ? `${path}?q=${encodeURIComponent(JSON.stringify(query))}` : path
  const result = await api<{ entities: T[] }>(token, url)
  return result.entities
}

async function deleteById(token: string, name: string, id: string) {
  await api(token, `${entityPath(name)}/${id}`, { method: 'DELETE' })
}

async function deleteMany(token: string, name: string, query: Record<string, unknown>) {
  await api(token, entityPath(name), { method: 'DELETE', body: query })
}

async function createEntity<T>(token: string, name: string, data: Record<string, unknown>): Promise<T> {
  return api<T>(token, entityPath(name), { method: 'POST', body: data })
}

function log(msg: string) { process.stdout.write(`  ${msg}\n`) }

// ── main ───────────────────────────────────────────────────────────────────

async function run() {
  const token = loadToken()
  process.stdout.write('\n🌱  Nidus Recall — onboarding deck seed\n\n')

  // ── 1. Count before ───────────────────────────────────────────────────────
  const decksBefore      = await listEntities<{ id: string }>(token, 'Deck')
  const flashcardsBefore = await listEntities<{ id: string }>(token, 'Flashcard')
  const logsBefore       = await listEntities<{ id: string; created_by: string }>(token, 'SessionLog')

  process.stdout.write(
    `Before: ${decksBefore.length} deck(s), ` +
    `${flashcardsBefore.length} flashcard(s), ` +
    `${logsBefore.length} session log(s)\n\n`
  )

  // ── 2a. Delete test deck ──────────────────────────────────────────────────
  const testDeckExists = decksBefore.some((d: any) => d.id === TEST_DECK_ID)
  if (testDeckExists) {
    log(`Deleting test deck ${TEST_DECK_ID}`)
    await deleteById(token, 'Deck', TEST_DECK_ID)
  } else {
    log(`Test deck ${TEST_DECK_ID} already gone`)
  }

  // ── 2b. Delete flashcards for test deck ───────────────────────────────────
  const testCards = flashcardsBefore.filter((c: any) => c.deckId === TEST_DECK_ID)
  if (testCards.length > 0) {
    log(`Deleting ${testCards.length} flashcard(s) in test deck`)
    await deleteMany(token, 'Flashcard', { deckId: TEST_DECK_ID })
  } else {
    log('No test flashcards to delete')
  }

  // ── 2c. Delete anonymous session logs ────────────────────────────────────
  const anonLogs = logsBefore.filter((l) => l.created_by === 'anonymous')
  if (anonLogs.length > 0) {
    log(`Deleting ${anonLogs.length} anonymous session log(s)`)
    await deleteMany(token, 'SessionLog', { created_by: 'anonymous' })
  } else {
    log('No anonymous session logs to delete')
  }

  // ── 2d. Confirm zero test records remain ─────────────────────────────────
  const decksAfterWipe      = await listEntities<any>(token, 'Deck', { id: TEST_DECK_ID })
  const cardsAfterWipe      = await listEntities<any>(token, 'Flashcard', { deckId: TEST_DECK_ID })
  const anonLogsAfterWipe   = await listEntities<any>(token, 'SessionLog', { created_by: 'anonymous' })

  if (decksAfterWipe.length || cardsAfterWipe.length || anonLogsAfterWipe.length) {
    throw new Error(`Wipe incomplete: ${decksAfterWipe.length} decks, ${cardsAfterWipe.length} cards, ${anonLogsAfterWipe.length} logs remain`)
  }
  log('Wipe confirmed ✓')

  // ── 3. Ensure onboarding deck exists ─────────────────────────────────────
  const existingOnboarding = await listEntities<any>(token, 'Deck', { is_sample: true, title: ONBOARDING_DECK.title })
  let deckId: string

  if (existingOnboarding.length > 0) {
    deckId = existingOnboarding[0].id
    log(`Onboarding deck already exists (${deckId})`)
  } else {
    log('Creating onboarding deck')
    const created = await createEntity<any>(token, 'Deck', ONBOARDING_DECK)
    deckId = (created as any).id ?? (created as any).entities?.[0]?.id
    log(`Created deck ${deckId}`)
    // is_sample may default to false; patch it
    await api(token, `${entityPath('Deck')}/${deckId}`, {
      method: 'PUT',
      body: { is_sample: true },
    })
  }

  // ── 4. Ensure all five onboarding cards exist ────────────────────────────
  const existingCards = await listEntities<any>(token, 'Flashcard', { deckId })
  const existingIds   = new Set(existingCards.map((c: any) => c.clientId))

  for (const card of ONBOARDING_CARDS) {
    if (existingIds.has(card.clientId)) {
      log(`Card ${card.clientId} already exists`)
    } else {
      log(`Creating card ${card.clientId}`)
      await createEntity(token, 'Flashcard', { ...card, deckId })
    }
  }

  // ── Final counts ─────────────────────────────────────────────────────────
  const decksAfter     = await listEntities<any>(token, 'Deck')
  const flashcardsAfter = await listEntities<any>(token, 'Flashcard')
  const logsAfter      = await listEntities<any>(token, 'SessionLog')

  process.stdout.write(
    `\nAfter:  ${decksAfter.length} deck(s), ` +
    `${flashcardsAfter.length} flashcard(s), ` +
    `${logsAfter.length} session log(s)\n\n` +
    '✅  Seed complete\n\n'
  )
}

run().catch((err) => {
  process.stderr.write(`\n❌  ${err.message}\n\n`)
  process.exit(1)
})
