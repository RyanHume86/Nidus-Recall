/**
 * Read-only audit: count and list records with suspicious created_by values
 * ("anonymous", "", null) across all seven Base44 entities.
 *
 * Does NOT issue any PUT, POST, or DELETE requests.
 *
 * Auth: reads BASE44_TOKEN from the environment or .env.local
 * Usage:
 *   BASE44_TOKEN=<token> BASE44_APP_URL=<your-app>.base44.app npm run audit:anonymous
 *
 * BASE44_APP_URL is required — Base44 enforces an origin allowlist on data
 * endpoints. Set it to the deployed app origin, e.g.:
 *   https://nidus-recall-abc12345.base44.app
 * Get it: open the app → DevTools Console → window.location.origin
 *
 * Output: stdout table + scripts/audits/2026-05-anonymous-audit-output.json
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ID   = '69eb23a1d22acead8735ff3c'
const API_BASE = 'https://base44.app/api'

const ENTITIES = [
  'Deck',
  'Flashcard',
  'SessionLog',
  'CardState',
  'CardHistory',
  'Image',
  'UserSchedulerParams',
] as const

type EntityName = typeof ENTITIES[number]

// ── Credentials ───────────────────────────────────────────────────────────────

function loadToken(): string {
  if (process.env.BASE44_TOKEN) return process.env.BASE44_TOKEN.trim()
  const envPath = resolve(process.cwd(), '.env.local')
  try {
    const content = readFileSync(envPath, 'utf-8')
    const match   = content.match(/^BASE44_TOKEN=(.+)$/m)
    if (match) return match[1].trim()
  } catch { /* file not present */ }
  throw new Error(
    'BASE44_TOKEN not set.\n' +
    'Set it as an env var or add BASE44_TOKEN=<token> to .env.local.\n' +
    'Get your token: open the app → DevTools Console → ' +
    "localStorage.getItem('base44_access_token')"
  )
}

function loadAppUrl(): string {
  if (process.env.BASE44_APP_URL) return process.env.BASE44_APP_URL.trim().replace(/\/$/, '')
  const envPath = resolve(process.cwd(), '.env.local')
  try {
    const content = readFileSync(envPath, 'utf-8')
    const match   = content.match(/^BASE44_APP_URL=(.+)$/m)
    if (match) return match[1].trim().replace(/\/$/, '')
  } catch { /* file not present */ }
  throw new Error(
    'BASE44_APP_URL not set.\n' +
    'Base44 enforces an origin allowlist on data endpoints. Set the deployed app URL:\n' +
    '  export BASE44_APP_URL=https://your-app-name.base44.app\n' +
    'Get it: open the app → DevTools Console → window.location.origin'
  )
}

// ── API helpers ───────────────────────────────────────────────────────────────

type AuditRecord = { id: string; created_date?: string; updated_date?: string }
type ApiResult   = { entities: AuditRecord[] }

// null count means the API rejected the query (unsupported filter)
type QueryResult = AuditRecord[] | null

async function apiGet(token: string, appUrl: string, path: string): Promise<ApiResult> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: {
      Authorization:   `Bearer ${token}`,
      'X-App-Id':      APP_ID,
      'Content-Type':  'application/json',
      // Base44 data endpoints enforce an origin allowlist.
      // X-Origin-URL is what the browser SDK sends (window.location.href).
      'X-Origin-URL':  `${appUrl}/`,
      'Origin':        appUrl,
      'Referer':       `${appUrl}/`,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Base44 GET ${path} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<ApiResult>
}

function entityPath(name: string): string {
  return `/apps/${APP_ID}/entities/${name}`
}

async function queryAnonymous(token: string, appUrl: string, entity: string): Promise<AuditRecord[]> {
  const q    = JSON.stringify({ created_by: 'anonymous' })
  const path = `${entityPath(entity)}?q=${encodeURIComponent(q)}&limit=1000`
  const result = await apiGet(token, appUrl, path)
  return (result.entities ?? []).map(r => ({
    id:           r.id,
    created_date: r.created_date,
    updated_date: r.updated_date,
  }))
}

// Base44 may not support empty-string or null filter values; returns null if
// the API rejects the query with 4xx rather than returning an empty list.
async function queryOptional(
  token: string,
  appUrl: string,
  entity: string,
  value: string | null,
): Promise<QueryResult> {
  const q    = JSON.stringify({ created_by: value })
  const path = `${entityPath(entity)}?q=${encodeURIComponent(q)}&limit=1000`
  try {
    const result = await apiGet(token, appUrl, path)
    return (result.entities ?? []).map(r => ({
      id:           r.id,
      created_date: r.created_date,
      updated_date: r.updated_date,
    }))
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    if (/40[0-9]|422/.test(message)) return null   // unsupported filter value
    throw err
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type BucketKey = 'anonymous' | 'empty' | 'null'

type EntityResult = {
  entity:    EntityName
  anonymous: AuditRecord[]   // always present — hard failure if API rejects
  empty:     QueryResult     // null = API rejected the filter
  null:      QueryResult     // null = API rejected the filter
}

type OutputJson = {
  audited_at: string
  app_id:     string
  results:    EntityResult[]
  summary: {
    total_anonymous: number
    total_empty:     number | 'n/a'
    total_null:      number | 'n/a'
    grand_total:     number
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const token  = loadToken()
  const appUrl = loadAppUrl()

  process.stdout.write('\n🔍  Nidus Recall — anonymous record audit (read-only)\n')
  process.stdout.write(`    App:    ${APP_ID}\n`)
  process.stdout.write(`    Origin: ${appUrl}\n`)
  process.stdout.write(`    Time:   ${new Date().toISOString()}\n\n`)

  const results: EntityResult[] = []

  for (const entity of ENTITIES) {
    process.stdout.write(`  Querying ${entity}...`)
    // anonymous is strict — a failure here means auth/origin is broken
    const anonymous   = await queryAnonymous(token, appUrl, entity)
    // empty/null are best-effort — Base44 may not support these filter values
    const [empty, nullRecords] = await Promise.all([
      queryOptional(token, appUrl, entity, ''),
      queryOptional(token, appUrl, entity, null),
    ])
    results.push({ entity, anonymous, empty, null: nullRecords })
    const emptyStr = empty   === null ? 'n/a' : String(empty.length)
    const nullStr  = nullRecords === null ? 'n/a' : String(nullRecords.length)
    process.stdout.write(` anonymous=${anonymous.length}  empty=${emptyStr}  null=${nullStr}\n`)
  }

  // ── Table ──────────────────────────────────────────────────────────────────

  const COL = { entity: 20, anon: 24, empty: 16, null: 16 }
  const pad = (s: string | number, n: number) => String(s).padEnd(n)
  const sep = '-'.repeat(COL.entity + COL.anon + COL.empty + COL.null + 3)
  const fmt = (q: QueryResult) => q === null ? 'n/a' : String(q.length)

  process.stdout.write('\n')
  process.stdout.write(
    pad('Entity', COL.entity) + '| ' +
    pad('created_by="anonymous"', COL.anon) + '| ' +
    pad('created_by=""', COL.empty) + '| ' +
    'created_by=null\n'
  )
  process.stdout.write(sep + '\n')

  for (const r of results) {
    process.stdout.write(
      pad(r.entity, COL.entity) + '| ' +
      pad(r.anonymous.length, COL.anon) + '| ' +
      pad(fmt(r.empty), COL.empty) + '| ' +
      fmt(r.null) + '\n'
    )
  }

  process.stdout.write(sep + '\n')

  // ── Detail rows ────────────────────────────────────────────────────────────

  let anyDetail = false

  for (const r of results) {
    if (r.anonymous.length > 0) {
      anyDetail = true
      process.stdout.write(`\n  ${r.entity} — created_by="anonymous" (${r.anonymous.length} record(s)):\n`)
      for (const rec of r.anonymous) {
        process.stdout.write(
          `    id=${rec.id}  created=${rec.created_date ?? 'n/a'}  updated=${rec.updated_date ?? 'n/a'}\n`
        )
      }
    }
    for (const [key, label] of [['empty', 'created_by=""'], ['null', 'created_by=null']] as const) {
      const records = r[key]
      if (records === null || records.length === 0) continue
      anyDetail = true
      process.stdout.write(`\n  ${r.entity} — ${label} (${records.length} record(s)):\n`)
      for (const rec of records) {
        process.stdout.write(
          `    id=${rec.id}  created=${rec.created_date ?? 'n/a'}  updated=${rec.updated_date ?? 'n/a'}\n`
        )
      }
    }
  }

  if (!anyDetail) {
    process.stdout.write('\n  ✅  No records found with anonymous, empty, or null created_by.\n')
  }

  // ── JSON output ────────────────────────────────────────────────────────────

  const totalAnonymous = results.reduce((s, r) => s + r.anonymous.length, 0)
  const anyEmptyUnsupported = results.some(r => r.empty === null)
  const anyNullUnsupported  = results.some(r => r.null  === null)
  const totalEmpty: number | 'n/a' = anyEmptyUnsupported ? 'n/a' : results.reduce((s, r) => s + (r.empty?.length ?? 0), 0)
  const totalNull:  number | 'n/a' = anyNullUnsupported  ? 'n/a' : results.reduce((s, r) => s + (r.null?.length  ?? 0), 0)
  const grandTotal = totalAnonymous +
    (typeof totalEmpty === 'number' ? totalEmpty : 0) +
    (typeof totalNull  === 'number' ? totalNull  : 0)

  const output: OutputJson = {
    audited_at: new Date().toISOString(),
    app_id:     APP_ID,
    results,
    summary: {
      total_anonymous: totalAnonymous,
      total_empty:     totalEmpty,
      total_null:      totalNull,
      grand_total:     grandTotal,
    },
  }

  const __dirname = dirname(fileURLToPath(import.meta.url))
  const outPath   = resolve(__dirname, '2026-05-anonymous-audit-output.json')

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8')

  process.stdout.write(`\n  📄  JSON report written to:\n      ${outPath}\n`)
  process.stdout.write(`\n  Summary: anonymous=${totalAnonymous}  empty=${totalEmpty}  null=${totalNull}  total=${grandTotal}\n\n`)
}

run().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(`\n❌  ${message}\n\n`)
  process.exit(1)
})
