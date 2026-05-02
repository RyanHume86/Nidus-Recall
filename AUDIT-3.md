# Nidus Recall — Codebase Audit (Third Run)

Date: 2026-05-02  
Head: `487a3f6` (after PR #50)  
Previous: `AUDIT-2.md` (2026-05-02, post PR #49)

---

## Phase 1 — CI

### CI-01: GITHUB_TOKEN permissions
**Status: ✅ Fixed (PR #47)** — `permissions: contents: read` at workflow level on both files. Jobs needing `upload-artifact` declare `actions: write` explicitly.

### CI-02: Mutable action version tags
**Status: ⚠ Medium — open**  
All four `uses:` references in both workflows pin to `@v4` floating tags, not commit SHAs.

```
actions/checkout@v4        ← in ci.yml (×2) and e2e.yml (×1)
actions/setup-node@v4      ← in ci.yml (×2) and e2e.yml (×1)
```

`@v4` is a mutable pointer. SHA-pinning is required for SLSA level 2 compliance and is recommended by the OpenSSF Scorecard. A tag can be repointed to a malicious commit between runs without any change to the workflow file.

**Fix:** replace each tag with its SHA and an inline version comment, e.g.:
```yaml
uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4.2.2
```
Tool: `npx pin-github-action .github/workflows/ci.yml`

### CI-03: No concurrency group
**Status: ⚠ Low — open**  
Neither workflow has a `concurrency:` block. Rapid updates to the same branch queue redundant runs that waste CI minutes.

**Fix (3 lines per workflow):**
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

---

## Phase 2 — Security

### SEC-01: PWA dev service worker in production
**Status: ✅ Fixed (PR #46)**

### SEC-02: Notion token transits browser
**Status: ⚠ Medium — accepted**  
Credentials are stored server-side in the Base44 User entity. However `src/api/notion.js` makes fetch requests to `https://api.notion.com/v1` directly from the browser using the token fetched at call time. The token is visible in DevTools → Network on every export/import operation.

No quick fix without a server-side proxy. Accepted: token is user-provided, single-workspace scoped, and only used on explicit user action.

### SEC-03: npm audit — 7 vulnerabilities
**Status: ⚠ Partially accepted — unchanged**

| Count | Severity | Package | Advisory | Fix path |
|---|---|---|---|---|
| 5 | High | `vite-plugin-pwa@0.21` → `workbox-build` → `@rollup/plugin-terser` → `serialize-javascript ≤7.0.4` | GHSA-5c6j-r48x-rmvq (RCE via RegExp.flags); GHSA-qj8w-gfj5-8c6v (CPU exhaustion) | `npm audit fix --force` downgrades `vite-plugin-pwa` to `0.19.8` (breaking). **Deferred — monitor upstream.** |
| 2 | Moderate | `@base44/sdk ≥0.7.5` → `uuid <14` | GHSA-w5hq-g745-h8pq (OOB write in uuid v3/v5/v6) | `npm audit fix --force` downgrades `@base44/sdk` to `0.7.4` (breaking). **Deferred — awaiting SDK patch.** |
| 2 | High | `xlsx *` | GHSA-4r6h-8v6p-xvw6 (prototype pollution); GHSA-5pgg-2g8v-p4x9 (ReDoS) | No fix on npm. **Accepted exception** — xlsx is export-only; no attacker-controlled input is parsed. |

All remaining 7 are in platform/build-tool dependency chains or have no upstream fix. None are in code paths that accept untrusted user input for the affected operations.

### SEC-04: `requiresAuth: false` on SDK client
**Status: ⚠ Low — open**  
`src/api/base44Client.js:12` sets `requiresAuth: false`. All mutating functions in `storage.js` begin with `requireAuth(...)` (11 call sites), but read functions (`loadAll`, `loadCardsPage`, `listCardStates`, `listCardHistory`) do not. There is no SDK-level backstop preventing unauthenticated reads if `requiresAuth: false` and the bearer token is absent.

**Fix:** change to `requiresAuth: true` once the auth gate in `App.jsx` is confirmed stable for all code paths.

### SEC-05–09: Remaining security checks — all clean
- Source maps: ✅ None in `dist/`
- API keys in bundle: ✅ None (`ANTHROPIC_API_KEY`, `SECRET`, `PRIVATE_KEY` — no matches)
- Auth tokens in localStorage: ✅ Application code writes no raw tokens; Base44 SDK manages session
- Account deletion cascade: ✅ `storage.deleteAllUserData()` at line 503 with two-step UI confirmation
- User-data `console.log` in production: ✅ Application `console.log`/`console.warn` calls use `[Nidus Recall]` prefix and log only migration status and FSRS tuning metrics — no PII

---

## Phase 3 — Redundancy

### RED-01: Dead code removals
**Status: ✅ All fixed**

| PR | Removed |
|---|---|
| #48 | `Badge.jsx`, `ProtectedRoute.jsx`, `ui/sonner.jsx`, `ui/toaster.jsx`, `ui/use-toast.jsx`, `isIframe` export, `sonner` package |
| #50 | All 46 `src/components/ui/` files, 37 packages (26 Radix + 11 ancillaries including `lucide-react`, `date-fns`, `next-themes`) |

### RED-02: `ImageOcclusionEditor.jsx` — unused component
**Status: ⚠ Medium — new finding**  
`src/components/ImageOcclusionEditor.jsx` has zero import sites in the application. `OcclusionCardRenderer.jsx` (the playback component) is actively used in `SessionView.jsx`, but the editor half is never mounted. Occlusion card *creation* in `DeckView.jsx` (`addMode === "occlusion"` branch) renders image upload UI via `ImageUpload` and uses `createOcclusionCards` from `src/lib/occlusion.js` directly — the editor component is bypassed.

**Fix:** delete `src/components/ImageOcclusionEditor.jsx` unless there is a plan to wire it in.

### RED-03: `workbox-window` package — not imported
**Status: ⚠ Low — new finding**  
`workbox-window` is listed in `dependencies` but is never imported anywhere in the source. `src/lib/pwa.js` mentions it in a comment but uses the native `beforeinstallprompt` browser event directly. The service worker lifecycle is managed by `vite-plugin-pwa` (which has its own internal dependency on `workbox-build`), not by `workbox-window`.

**Fix:** `npm uninstall workbox-window`

### RED-04: `depcheck` false positives
**Status: ✅ Not issues**  
`autoprefixer` and `postcss` are flagged by depcheck because it doesn't scan `postcss.config.js`. Both are required by the PostCSS → Tailwind build pipeline.

---

## Phase 4 — Code Quality / Standards

### STD-01: ESLint suppressions
**Status: ✅ Zero** — `grep -rn "eslint-disable" src/` returns no output.

### STD-02: `console.error` in `AuthContext.jsx`
**Status: ⚠ Low — open**  
Three `console.error` calls at lines 56, 87, 107 log raw error objects (including SDK error messages and stack traces) in production. Not a PII leakage vector, but exposes internal error details in any open DevTools session.

**Fix:** gate behind `import.meta.env.DEV`:
```js
if (import.meta.env.DEV) console.error('App state check failed:', appError)
```

### STD-03: Read operations not guarded by `requireAuth`
**Status: ⚠ Low — same as SEC-04**  
`loadAll`, `loadCardsPage`, `listCardStates`, `listCardHistory` (`storage.js` lines 194, 299, 493, 606) make entity reads without calling `requireAuth`. Writes are all guarded (11 call sites). Reads are not. This is only a risk if the Base44 platform's server-side RLS is the sole multi-tenant guard — which it is. Acceptable if platform RLS is trusted; worth documenting.

### STD-04: `logLevel: 'error'` in `vite.config.js` suppresses bundle warnings
**Status: ⚠ Low**  
`vite.config.js:22` sets `logLevel: 'error'`, which silences the default Vite chunk-size warning. The main bundle is 1.17 MB — well above Vite's default 500 KB threshold — but the warning is suppressed so it never surfaces in CI. Consider removing this suppression so future size regressions are visible.

---

## Phase 5 — Bundle

### BUN-01: Main bundle — 1.17 MB
**Status: ⚠ Medium — open**  
`dist/assets/index-DjCrYmcV.js`: **1,174,805 bytes (1.12 MB gzip-uncompressed text)**. Vite's default 500 KB warning is suppressed by `logLevel: 'error'`.

Primary contributor: `recharts` (~200 KB), used only in `StatsView.jsx` which is never on the critical path (user must navigate to "Progress" explicitly).

**Fix:** wrap `StatsView` in `React.lazy` + `Suspense` to shift recharts out of the initial parse:
```jsx
// In Home.jsx
const StatsView = React.lazy(() => import('@/views/StatsView'))
// Wrap render: <Suspense fallback={<div />}><StatsView .../></Suspense>
```

Other large chunks are already lazy:
| Chunk | Size | Status |
|---|---|---|
| `xlsx-*.js` | 419 KB | ✅ Dynamic import via `api/excel.js` |
| `anki-*.js` | 64 KB | ✅ Dynamic import via `api/anki.js` |
| `aiAssist-*.js` | 1.2 KB | ✅ Dynamic import |
| `fsrs-optimizer-*.js` | 1.2 KB | ✅ Dynamic import |
| `sql-wasm.wasm` | 644 KB | ✅ Demand-loaded by sql.js |

---

## Phase 6 — Dependencies

### DEP-01: `ts-fsrs` one major version behind
**Status: ⚠ Medium — open, requires deliberate migration**  
Current: `4.7.1`. Latest: `5.3.2`. FSRS-5 introduces algorithm changes. The existing `src/lib/__tests__/fsrs-regression.test.js` provides a regression harness but the migration requires validation of scheduling outputs, not just a `npm update`.

### DEP-02: Major version gaps (informational)

| Package | Current | Latest | Notes |
|---|---|---|---|
| `react` / `react-dom` | 18.3.1 | 19.2.5 | React 19 — concurrent features, stable |
| `react-router-dom` | 6.30.3 | 7.14.2 | v7 has breaking API changes |
| `recharts` | 2.15.4 | 3.8.1 | v3 API changes |
| `tailwindcss` | 3.4.19 | 4.2.4 | v4 is config-less, significant DX change |
| `vite` | 6.4.2 | 8.0.10 | v7/v8 have config changes |
| `@vitejs/plugin-react` | 4.7.0 | 6.0.1 | follows Vite major |
| `typescript` | 5.9.3 | 6.0.3 | minor breaking changes |
| `eslint` | 9.39.2 | 10.3.0 | — |

None of these require immediate action. All are within reasonable lag for a production app.

---

## Summary

### Baseline health (as of this audit)
- ✅ Build: passing
- ✅ Tests: 557 passing, 0 failing
- ✅ Lint: zero warnings or errors
- ✅ ESLint suppressions: zero
- ✅ Dead code: minimal (ImageOcclusionEditor only)
- ✅ Unused dependencies: 1 (`workbox-window`)
- ✅ Source maps in dist: none
- ✅ API keys in bundle: none
- ✅ GITHUB_TOKEN permissions: least-privilege

### Open findings

| ID | Severity | Finding | Effort |
|---|---|---|---|
| CI-02 | Medium | Action refs not SHA-pinned | Low — tooling available (`pin-github-action`) |
| CI-03 | Low | No concurrency group on workflows | Trivial — 3 lines per workflow |
| SEC-02 | Medium | Notion token transits browser on API calls | High — requires server-side proxy |
| SEC-03 | High×5, Mod×2 | npm: serialize-javascript RCE chain; @base44/sdk uuid; xlsx (accepted) | Blocked on upstream patches |
| SEC-04 | Low | `requiresAuth: false` on SDK; reads unguarded | Low — 1-line config change when ready |
| RED-02 | Medium | `ImageOcclusionEditor.jsx` has zero import sites | Trivial — delete 1 file |
| RED-03 | Low | `workbox-window` package unused | Trivial — `npm uninstall workbox-window` |
| STD-02 | Low | `console.error` in `AuthContext.jsx` exposed in production | Low — gate behind `import.meta.env.DEV` |
| STD-04 | Low | `logLevel: 'error'` silences bundle-size warnings | Trivial — remove 1 config line |
| BUN-01 | Medium | 1.17 MB main bundle; `recharts` not lazy-loaded | Low — `React.lazy` + `Suspense` in `Home.jsx` |
| DEP-01 | Medium | `ts-fsrs` 4.7.1 vs 5.3.2 (FSRS-5 algorithm) | Medium — regression test suite exists |

### Quick wins (< 30 min each)
1. `npm uninstall workbox-window` — removes unused package
2. Delete `src/components/ImageOcclusionEditor.jsx` — zero consumers
3. Add `concurrency:` block to both workflow files (CI-03)
4. Remove `logLevel: 'error'` from `vite.config.js` (STD-04)
5. Gate `console.error` calls in `AuthContext.jsx` behind `import.meta.env.DEV` (STD-02)
