/**
 * One-time migration: reassign all records with created_by="anonymous" to the
 * admin account (ryanhumepersonal@gmail.com) before RLS hard-enforces.
 *
 * Idempotent: exits 0 with a message if no anonymous records are found.
 *
 * Auth: reads BASE44_TOKEN from the environment or .env.local
 * Usage: BASE44_TOKEN=<token> npm run migrate:assign-anonymous
 *
 * Get your token: open the app → DevTools Console →
 *   localStorage.getItem('base44_access_token')
 */

import { readFileSync } from 'node:fs'
import { resolve }       from 'node:path'

const APP_ID        = '69eb23a1d22acead8735ff3c'
const API_BASE      = 'https://base44.app/api'
const TARGET_OWNER  = 'ryanhumepersonal@gmail.com'
const ENTITIES      = ['Deck', 'Flashcard', 'SessionLog'] as const

// ── Token ─────────────────────────────────────────────────────────────────────

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

// ── API helpers ───────────────────────────────────────────────────────────────

type FetchOpts = { method?: string; body?: unknown }

async function api<T>(token: string, path: string, opts: FetchOpts = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method:  opts.method ?? 'GET',
    headers: {
      Authorization:  `Bearer ${token}`,
      'X-App-Id':     APP_ID,
      'Content-Type': 'application/json',
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

async function countAnonymous(token: string, entity: string): Promise<number> {
  const path = `${entityPath(entity)}?q=${encodeURIComponent(JSON.stringify({ created_by: 'anonymous' }))}`
  const result = await api<{ entities: unknown[] }>(token, path)
  return result.entities.length
}

async function reassignAnonymous(token: string, entity: string): Promise<number> {
  // Fetch all anonymous records (paginated via limit=1000; Base44 default is usually 500)
  const path = `${entityPath(entity)}?q=${encodeURIComponent(JSON.stringify({ created_by: 'anonymous' }))}&limit=1000`
  const result = await api<{ entities: { id: string }[] }>(token, path)
  const records = result.entities

  if (records.length === 0) return 0

  // Update each record's created_by field individually
  // (Base44 does not support bulk field updates via the public API)
  let updated = 0
  for (const record of records) {
    await api(token, `${entityPath(entity)}/${record.id}`, {
      method: 'PUT',
      body:   { created_by: TARGET_OWNER },
    })
    updated++
  }
  return updated
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const token = loadToken()
  process.stdout.write('\n🔄  Nidus Recall — anonymous record migration\n\n')

  // Count before
  const beforeCounts: Record<string, number> = {}
  let totalBefore = 0
  for (const entity of ENTITIES) {
    const count = await countAnonymous(token, entity)
    beforeCounts[entity] = count
    totalBefore += count
    process.stdout.write(`  Before — ${entity}: ${count} anonymous record(s)\n`)
  }

  if (totalBefore === 0) {
    process.stdout.write('\n✅  No anonymous records found. Migration already complete (idempotent).\n\n')
    process.exit(0)
  }

  process.stdout.write(`\n  Total to migrate: ${totalBefore}\n\n`)

  // Reassign
  const updatedCounts: Record<string, number> = {}
  for (const entity of ENTITIES) {
    if (beforeCounts[entity] === 0) {
      updatedCounts[entity] = 0
      process.stdout.write(`  ${entity}: nothing to update\n`)
      continue
    }
    process.stdout.write(`  Migrating ${entity}...`)
    const updated = await reassignAnonymous(token, entity)
    updatedCounts[entity] = updated
    process.stdout.write(` done (${updated} updated)\n`)
  }

  // Verify after
  process.stdout.write('\n  Verifying...\n')
  let totalAfter = 0
  for (const entity of ENTITIES) {
    const count = await countAnonymous(token, entity)
    totalAfter += count
    process.stdout.write(`  After  — ${entity}: ${count} anonymous record(s)\n`)
  }

  if (totalAfter > 0) {
    throw new Error(`Migration incomplete: ${totalAfter} anonymous records remain.`)
  }

  process.stdout.write(`
Migration complete ✓
  Migrated to ${TARGET_OWNER}:
${ENTITIES.map(e => `    ${e}: ${updatedCounts[e]} record(s)`).join('\n')}
  Zero anonymous records remain.
\n`)
}

run().catch((err) => {
  process.stderr.write(`\n❌  ${err.message}\n\n`)
  process.exit(1)
})
