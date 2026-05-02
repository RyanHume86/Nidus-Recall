# Nidus Recall — Codebase Audit (Re-run)

Date: 2026-05-02  
Scope: read-only re-audit of `main` HEAD after PR #46–49.  
Previous audit: `AUDIT.md` (2026-05-01)

---

## Phase 1 — CI

### CI-01: GITHUB_TOKEN permissions
**Status: ✅ Fixed (PR #47)**  
Both workflows have `permissions: contents: read` at workflow level. Jobs that call `upload-artifact` declare `actions: write` explicitly.

### CI-02: Mutable action version tags
**Status: ⚠ Medium — new finding**  
All four `uses:` references pin to `@v4` floating tags, not commit SHAs.

| Workflow | Action | Current | Risk |
|---|---|---|---|
| ci.yml | `actions/checkout` | `@v4` | Tag can be repointed |
| ci.yml | `actions/setup-node` | `@v4` | Tag can be repointed |
| e2e.yml | `actions/checkout` | `@v4` | Tag can be repointed |
| e2e.yml | `actions/setup-node` | `@v4` | Tag can be repointed |

`@v4` is a mutable pointer — the upstream repo can push a new commit under it at any time. SHA-pinning (e.g. `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683`) is the supply-chain-safe alternative. OpenSSF Scorecard and SLSA level 2 both require this.

**Recommended fix:** Pin each action to its current SHA and add a comment with the version label.

### CI-03: No concurrency group
**Status: ⚠ Low — new finding**  
No `concurrency:` block exists on either workflow. Two rapid pushes to the same PR branch both queue and run in full; the earlier one is wasted. Cost only, no correctness issue.

**Recommended fix:**
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

---

## Phase 2 — Security

### SEC-01: PWA dev service worker in production
**Status: ✅ Fixed (PR #46)**  
`devOptions.enabled` is now `process.env.NODE_ENV !== 'production'`.

### SEC-02: Notion integration token — client-side transit
**Status: ⚠ Medium — architectural, no quick fix**  
Notion credentials are stored server-side in the Base44 User entity (not `localStorage`). However, the Notion API is called directly from the browser: `src/api/notion.js` makes fetch requests to `https://api.notion.com/v1` using the token fetched at call time.

Consequence: the integration token transits through the browser on every export/import. It is visible in DevTools → Network and in browser memory. A server-side proxy (Base44 cloud function or edge function) would keep the token out of the browser entirely.

**Decision (same as previous audit):** Accept for now. Mitigation: token is user-provided, scoped to one Notion workspace, and only active when the user explicitly triggers an import/export. Not a stored-credential-leak — the user consents to entering their token. Revisit when a server-side proxy layer is available.

### SEC-03: npm audit — 7 vulnerabilities remain
**Status: ⚠ Partially accepted — unchanged from previous audit**

| Severity | Package | Advisory | Action |
|---|---|---|---|
| High (×5) | `vite-plugin-pwa` → `workbox-build` → `@rollup/plugin-terser` → `serialize-javascript` | GHSA-5c6j-r48x-rmvq: RCE via RegExp.flags | Fix requires `--force` downgrade of `vite-plugin-pwa` to `0.19.8` (breaking). **Deferred — monitor for a non-breaking patch.** |
| High (×2) | `xlsx` | GHSA-4r6h-8v6p-xvw6 (prototype pollution), GHSA-5pgg-2g8v-p4x9 (ReDoS) | No npm fix. Accepted exception (export-only path, no parsing of attacker-controlled input). |
| Moderate (×2) | `@base44/sdk` → `uuid` | GHSA-w5hq-g745-h8pq: OOB write in uuid v3/v5/v6 | Fix requires `--force` downgrade of `@base44/sdk` to `0.7.4` (breaking). **Deferred — awaiting SDK patch.** |

**Summary:** All 7 remaining vulnerabilities have either no upstream fix or require a breaking-change downgrade that would affect core platform dependencies. None are in code paths that accept untrusted user input for the affected operations.

### SEC-04: `requiresAuth: false` on SDK client
**Status: ⚠ Low — unchanged finding**  
`src/api/base44Client.js:12` sets `requiresAuth: false`. Application-level auth enforcement is delegated entirely to `requireAuth()` in `src/api/storage.js` (called at the top of every mutating function). This is a defence-in-depth gap: if any new storage function is added without calling `requireAuth`, unauthenticated writes would succeed at the SDK level.

**Recommended fix:** Change to `requiresAuth: true` once confident the auth gate in `App.jsx` is stable and all entry points are covered.

### SEC-05: Source maps — clean
**Status: ✅** `dist/assets/*.map` — no files found.

### SEC-06: No API keys in bundle — clean
**Status: ✅** No `ANTHROPIC_API_KEY`, `SECRET`, or `PRIVATE_KEY` strings in `dist/assets/`.

### SEC-07: Auth tokens not in localStorage — clean
**Status: ✅** No application code writes raw tokens to `localStorage`. Base44 SDK handles session management.

### SEC-08: Account deletion cascade — implemented
**Status: ✅** `storage.deleteUserData()` exists at `src/api/storage.js:504` with a two-step UI confirmation.

### SEC-09: No user-data console.log in production — clean
**Status: ✅** `console.log` calls in the bundle are from third-party libs (scheduler, workbox). Application `console.log` calls use the `[Nidus Recall]` prefix and log migration status only, no PII.

---

## Phase 3 — Redundancy

### RED-01: Dead code removed
**Status: ✅ Fixed (PR #48)**  
`Badge.jsx`, `ProtectedRoute.jsx`, `ui/sonner.jsx`, `ui/toaster.jsx`, `ui/use-toast.jsx`, `isIframe` export, and the `sonner` package are all gone.

### RED-02: Entire `src/components/ui/` scaffolding is unused
**Status: ⚠ Medium — new finding**  
All 46 shadcn/ui wrapper files in `src/components/ui/` have zero import sites outside the folder itself. The application builds its own custom components (CardPicker, TagInput, NoteToggle, etc.) with plain HTML/CSS/Lucide and does not call any Radix primitive through these wrappers.

Consequence:
- 46 files of dead code in the repository
- 26 `@radix-ui/*` packages installed in `node_modules` (total ~4 MB on disk) but tree-shaken out of the production bundle
- `class-variance-authority`, `cmdk`, `input-otp`, `vaul`, `embla-carousel-react`, `react-day-picker`, `react-hook-form`, `react-resizable-panels` are similarly installed but only referenced from within `src/components/ui/`
- `next-themes` has zero import sites anywhere (not even in `src/components/ui/`) — confirmed by depcheck

**Recommended action:** Two options:
1. **Adopt** — begin using the shadcn components in place of custom implementations (reduces bespoke CSS, gains accessible primitives). Higher effort.
2. **Remove** — delete `src/components/ui/`, uninstall ~26 Radix packages + ancillary packages. Removes ~4 MB from `node_modules`, simplifies dep surface. Lower effort, no behavioural change.

Either way, `next-themes` should be uninstalled now — it has no import sites at all.

### RED-03: `autoprefixer` / `postcss` flagged by depcheck
**Status: ✅ Not an issue**  
depcheck reports these as unused because it doesn't scan `postcss.config.js`. They are required by the PostCSS → Tailwind build pipeline.

---

## Phase 4 — Code Quality / Standards

### STD-01: ESLint suppressions
**Status: ✅ Clean**  
`grep -rn "eslint-disable"` across `src/` returns zero results. The last suppression (`react-hooks/exhaustive-deps` in `Home.jsx:99`) was removed in PR #49.

### STD-02: Stale closure in Home.jsx
**Status: ✅ Fixed (PR #49)**  
`log` and `incompleteSession` added as proper dependencies.

### STD-03: `console.error` in AuthContext.jsx
**Status: ⚠ Low — new finding**  
Three `console.error` calls in `src/lib/AuthContext.jsx` (lines 56, 87, 107) log raw `appError` and `error` objects in production. In a browser with DevTools open, these expose internal SDK error messages. Not a leakage vector for PII, but it adds diagnostic noise and may expose stack traces to curious users.

**Recommended fix:** Gate behind `import.meta.env.DEV` or replace with a silent no-op in production:
```js
if (import.meta.env.DEV) console.error('App state check failed:', appError)
```

---

## Phase 5 — Bundle

### BUN-01: Main bundle size
**Status: ⚠ Unchanged**  
`dist/assets/index-*.js` is **1,174,805 bytes (~1.12 MB)**. This is above Vite's default 500 KB warning threshold (suppressed by `logLevel: 'error'` in `vite.config.js`).

Largest contributors that could be lazy-loaded:
| Library | Use site | Lazy-load candidate? |
|---|---|---|
| `recharts` | `StatsView.jsx` only | ✅ Yes — view is not on first paint |
| `xlsx` (sheetjs) | `api/excel.js` (dynamic import) | Already lazy ✅ |
| `anki.js` / `sql.js` | `api/anki.js` (dynamic import) | Already lazy ✅ |
| `ts-fsrs` | Core scheduler — used on every session | ❌ No |
| `workbox-window` | `main.jsx` | Small (~21 KB) |

`recharts` is the best remaining candidate: `StatsView` is only reached after the user navigates to "Progress" and is never on first paint. Wrapping it in `React.lazy` + `Suspense` would shift ~200 KB out of the initial parse cost.

### BUN-02: `sql-wasm.wasm` in dist root
**Status: ✅ Expected**  
`dist/sql-wasm.wasm` (644 KB) is the sql.js runtime. It is loaded on demand by `api/anki.js` and only fetched when the user opens the Anki import dialog. Not a first-paint concern.

---

## Phase 6 — Dependency currency

### DEP-01: `ts-fsrs` one major version behind
**Status: ⚠ Medium — unchanged**  
Current: `4.7.1`. Latest: `5.3.2`. FSRS-5 has algorithm changes; this requires a deliberate migration and regression testing against the existing scheduler tests.

### DEP-02: Shadcn/Radix ecosystem version drift
**Status: ℹ Informational**  
26 Radix packages are installed but unused (see RED-02). If the decision is to remove them, no version chase is needed. If the decision is to adopt them, they should be bumped before first use.

---

## Summary table

| ID | Phase | Severity | Status | Description |
|---|---|---|---|---|
| CI-01 | CI | High | ✅ Fixed | GITHUB_TOKEN default permissions |
| CI-02 | CI | Medium | ⚠ Open | Mutable `@v4` action tags — not SHA-pinned |
| CI-03 | CI | Low | ⚠ Open | No concurrency group — wasted parallel runs |
| SEC-01 | Security | Critical | ✅ Fixed | PWA dev service worker shipped to production |
| SEC-02 | Security | Medium | ⚠ Accepted | Notion token transits browser on API calls |
| SEC-03 | Security | High×5+2 | ⚠ Deferred | npm: serialize-javascript RCE (no non-breaking fix); xlsx (no fix) |
| SEC-04 | Security | Low | ⚠ Open | `requiresAuth: false` on SDK — no SDK-level auth backstop |
| RED-01 | Redundancy | Medium | ✅ Fixed | Dead components, toast system, isIframe |
| RED-02 | Redundancy | Medium | ⚠ Open | Entire shadcn/ui scaffolding unused; 26 Radix packages installed |
| RED-03 | Redundancy | — | ✅ Not an issue | autoprefixer/postcss depcheck false positive |
| STD-01 | Standards | — | ✅ Clean | Zero ESLint suppressions |
| STD-02 | Standards | Medium | ✅ Fixed | Stale closure in Home.jsx incomplete-session effect |
| STD-03 | Standards | Low | ⚠ Open | `console.error` calls exposed in production DevTools |
| BUN-01 | Bundle | Medium | ⚠ Open | 1.12 MB main chunk — recharts not lazy-loaded |
| DEP-01 | Deps | Medium | ⚠ Open | ts-fsrs 4.7.1 vs 5.3.2 — FSRS-5 migration needed |

### Open items by priority

**Do now (quick wins):**
- `next-themes` — zero consumers, uninstall (`npm uninstall next-themes`)
- CI-03 — add 3-line concurrency block to both workflows

**Plan for a sprint:**
- RED-02 — decide: adopt shadcn or remove it. Either resolves ~26 unused deps.
- BUN-01 — lazy-load `recharts` behind `React.lazy` in `StatsView`
- CI-02 — SHA-pin the four action refs (tooling: `pin-github-action` CLI)

**Monitor / revisit:**
- SEC-03 — `vite-plugin-pwa` and `@base44/sdk` chain: wait for upstream patches that don't require a breaking downgrade
- DEP-01 — ts-fsrs 5.x migration (algorithm differences need careful regression testing)
- SEC-02 — Notion proxy: revisit when a Base44 server-side function layer is available
- SEC-04 — `requiresAuth: true` once SDK gate is confirmed stable
