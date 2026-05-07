/**
 * Applies Row-Level Security rules to all six Nidus Recall entities.
 *
 * Rules:
 *   create — authenticated users only (role: "user")
 *   read   — record owner OR admin
 *   update — record owner OR admin
 *   delete — record owner OR admin
 *
 * CardState, CardHistory, and UserSchedulerParams must be registered in the
 * Base44 dashboard before this script is run against them. See
 * scripts/schema/manual-setup.md for instructions.
 *
 * Auth: reads BASE44_TOKEN from the environment or .env.local
 * Usage: BASE44_TOKEN=<token> npm run schema:apply-rls
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const APP_ID   = '69eb23a1d22acead8735ff3c'
const API_BASE = 'https://base44.app/api'

const RLS = {
  create: { user_condition: { role: 'user' } },
  read:   { $or: [{ created_by: '{{user.email}}' }, { user_condition: { role: 'admin' } }] },
  update: { $or: [{ created_by: '{{user.email}}' }, { user_condition: { role: 'admin' } }] },
  delete: { $or: [{ created_by: '{{user.email}}' }, { user_condition: { role: 'admin' } }] },
}

function loadToken(): string {
  if (process.env.BASE44_TOKEN) return process.env.BASE44_TOKEN.trim()
  const envPath = resolve(process.cwd(), '.env.local')
  try {
    const content = readFileSync(envPath, 'utf-8')
    const match   = content.match(/^BASE44_TOKEN=(.+)$/m)
    if (match) return match[1].trim()
  } catch { /* file not found */ }
  throw new Error('BASE44_TOKEN not set. See scripts/seed/onboarding-deck.ts for instructions.')
}

async function applyRls(token: string, entityName: string, currentSchema: object) {
  const url = `${API_BASE}/apps/${APP_ID}/entities/${entityName}/schema`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization:  `Bearer ${token}`,
      'X-App-Id':     APP_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...currentSchema, rls: RLS }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`PUT ${entityName} schema → ${res.status}: ${text}`)
  }
  process.stdout.write(`  ✓ ${entityName} RLS applied\n`)
}

async function getSchema(token: string, entityName: string): Promise<object> {
  const res = await fetch(`${API_BASE}/apps/${APP_ID}/entities/${entityName}/schema`, {
    headers: { Authorization: `Bearer ${token}`, 'X-App-Id': APP_ID },
  })
  if (!res.ok) throw new Error(`GET ${entityName} schema → ${res.status}`)
  return res.json() as Promise<object>
}

async function run() {
  const token = loadToken()
  process.stdout.write('\n🔒  Nidus Recall — applying RLS rules (6 entities)\n\n')

  for (const entity of ['Deck', 'Flashcard', 'SessionLog', 'CardState', 'CardHistory', 'UserSchedulerParams']) {
    const schema = await getSchema(token, entity)
    await applyRls(token, entity, schema)
  }

  process.stdout.write('\n✅  Done\n\n')
}

run().catch((err) => {
  process.stderr.write(`\n❌  ${err.message}\n\n`)
  process.exit(1)
})
