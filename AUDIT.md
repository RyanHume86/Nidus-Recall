# Nidus Recall — Codebase Audit (P0 Baseline)

Branch: `chore/p0-audit`
Date: 2026-05-01
Scope: read-only audit of the repository as of `main` HEAD.

## 1. File tree of `src/` with one-line descriptions

```
src/
├── App.jsx                                Root: AuthProvider → QueryClient → Router → AuthenticatedApp gate
├── main.jsx                               Vite entry; mounts <App/>, registers /sw.js, suppresses SW SecurityErrors
├── index.css                              Tailwind base layers
├── styles/app.css                         App-specific CSS (rapp-* classes, layout, theme)
│
├── pages/
│   └── Home.jsx                           Single shell page; renders one of seven views by local `view` state
│
├── views/
│   ├── LibraryView.jsx                    Deck browser, deck creation, sample-deck CTA, deck tree
│   ├── DeckView.jsx                       Per-deck card list, edit/archive, in-deck filtering
│   ├── StudySelectView.jsx                Mode picker (SRS / interleaved / free), deck selector, due/new counts
│   ├── SessionView.jsx                    Active SRS session: rates cards, calls scheduleFSRS, writes log
│   ├── FreeStudyView.jsx                  Free-browse mode (no scheduling writes)
│   ├── StatsView.jsx                      Heatmap + retention/intensity charts from SessionLog and ratingHistory
│   ├── SettingsView.jsx                   App settings, params re-fit, import/export, Notion/Anki/Excel hooks
│   ├── OnboardingView.jsx                 First-run onboarding card
│   └── ReturnOnboardingCard.jsx           Re-engagement card after >=7-day gap
│
├── api/
│   ├── base44Client.js                    Creates the Base44 SDK client from app-params (requiresAuth: false)
│   ├── storage.js                         Remote storage adapter — wraps Base44 entities; clientId↔entityId map
│   ├── notionSettings.js                  Notion credentials persistence to User entity (with localStorage fallback)
│   ├── notion.js                          Notion API integration helpers (export/import flashcards)
│   ├── anki.js                            Anki .apkg parser + import (uses sql.js + fflate)
│   ├── excel.js                           Excel/CSV import via xlsx (sheetjs)
│   ├── aiAssist.js                        AI-edit invocation; logs to CardHistory entity
│   └── storage.js                         (see above)
│
├── lib/
│   ├── AuthContext.jsx                    React context for auth state; calls public-settings + base44.auth.me()
│   ├── PageNotFound.jsx                   404 helper (also reads base44.auth.me())
│   ├── ProtectedRoute is in components/   (see below)
│   ├── fsrs.js                            scheduleFSRS (ts-fsrs wrapper), getDue, getNew, fitSchedulerParams
│   ├── fsrs-optimizer.js                  Async lazy-loaded FSRS-5 gradient-descent param fitter
│   ├── fit-params.js                      Synchronous retention-target adjuster (delegates to fsrs.js)
│   ├── offline-store.js                   Dexie/IndexedDB mirror + pendingActions queue + drainQueue resolver
│   ├── settings.js                        localStorage-backed settings (settingsGet/Set, deckMeta, sleep window)
│   ├── app-params.js                      Reads appId/token/etc from URL/localStorage/env
│   ├── query-client.js                    Shared TanStack Query client
│   ├── theme.js                           Color palette `C` (accent, again, warning, surface, text…)
│   ├── icons.jsx                          `Ico` namespace of Lucide icon wrappers
│   ├── greeting.js                        Time-of-day greeting helper
│   ├── dates.js                           localDateStr, addDays, genId
│   ├── deck-tree.js                       Builds parent→child deck hierarchy from deckParentMap
│   ├── heatmap.js                         Daily-review aggregation for StatsView heatmap
│   ├── stats.js                           Retention/intensity computations
│   ├── cloze.jsx                          Parses {{c1::…}} markup → multiple Flashcard records
│   ├── occlusion.js                       Image-occlusion region → multi-card expansion
│   ├── pwa.js                             beforeinstallprompt capture + triggerInstallPrompt
│   └── utils.js                           cn() classname helper
│
├── components/
│   ├── ProtectedRoute.jsx                 Auth gate (uses useAuth); currently NOT mounted in router
│   ├── UserNotRegisteredError.jsx         Empty-state shown when Base44 returns user_not_registered
│   ├── FirstRunOverlay.jsx                One-shot intro overlay (localStorage flag)
│   ├── NidusLogo.jsx                      SVG logo + wordmark
│   ├── VesicleDots.jsx                    Brand decorative element
│   ├── Badge.jsx, AnchorToggle, NoteToggle, TagInput, CharCount  Small form widgets
│   ├── CardPicker.jsx                     Modal picker for connects_to / prerequisite_card_id
│   ├── ImageOcclusionEditor.jsx           Region drawing UI for occlusion cards
│   ├── OcclusionCardRenderer.jsx          Display layer for occlusion cards
│   ├── ReviewHeatmap.jsx                  Calendar heatmap component
│   ├── ImportExportPanel.jsx              JSON/Anki/Excel/Notion import-export UI
│   └── ui/                                Shadcn/Radix primitives (~50 files, generated)
│
├── modals/
│   ├── EditCardModal.jsx                  Edit/create card form
│   ├── AIDiffModal.jsx                    AI-edit diff preview + accept/reject
│   └── CardHistoryModal.jsx               Lists CardHistory records for a card
│
├── hooks/
│   └── use-mobile.jsx                     window.matchMedia hook for mobile breakpoint
│
├── store/
│   └── appStore.js                        Zustand store: cards/log/decks/settings + sync/init/import actions
│
├── test/
│   ├── setup.js                           Vitest setup (jest-dom, jsdom)
│   └── smoke.test.js                      Trivial sanity test
│
├── utils/index.ts                         (TypeScript) general utility re-exports
│
└── __tests__/                             unit + snapshot tests
    ├── aiAssist.test.js                   AI assist + CardHistory create flow
    ├── anki-roundtrip.test.js             .apkg import/export round-trip
    ├── notionSettings.test.js             Notion credential migration
    ├── perf/virtualisation.test.jsx       List-virtualisation perf
    └── snapshots/views.test.jsx           View snapshot tests
```

Plus per-module `__tests__` under `src/lib/__tests__/` (`fsrs-optimizer`, `fsrs-regression`, `greeting`) and `src/modals/__tests__/CardHistoryModal.test.jsx`.

## 2. Routing map

Routing is **deliberately minimal**. There is exactly one mounted route:

| Route          | Component       | Registered in           | Notes |
|----------------|-----------------|--------------------------|-------|
| `/*` (catch-all) | `pages/Home.jsx` | `src/App.jsx:26` (`<Route path="/*" element={<Home />} />`) | All in-app navigation is handled via local React state in `Home.jsx` (`view` switches between `library`, `deck`, `study-select`, `session`, `free-study`, `stats`, `settings`). |

`react-router-dom` `<BrowserRouter>` wraps the app at `App.jsx:35`. There are **no nested routes, no `<Outlet/>` usage, no deep links**. `ProtectedRoute.jsx` exists but is **dead code in the router** — it is imported by no file mounted via `<Route>`; auth gating is done inside `AuthenticatedApp` in `App.jsx` instead.

Internal "views" inside `Home.jsx` (not URLs):

| `view` value     | Component rendered            |
|------------------|-------------------------------|
| `library`        | `LibraryView` (or `ReturnOnboardingCard` after long gap) |
| `deck`           | `DeckView`                     |
| `study-select`   | `StudySelectView`              |
| `session`        | `SessionView`                  |
| `free-study`     | `FreeStudyView`                |
| `stats`          | `StatsView`                    |
| `settings`       | `SettingsView`                 |

## 3. Entity access map (Base44)

All Base44 entity I/O is centralised in `src/api/storage.js` — application code does not call `base44.entities.*` directly except inside `src/api/notionSettings.js` (User auth) and three test files. Migration code in `migrations/2026-04-26-split-card-state.js` is also a writer.

### Deck
| File | Line | Operation |
|------|------|-----------|
| `src/api/storage.js` | 57 | `Deck.create({ title })` (in `ensureDeck`) |
| `src/api/storage.js` | 194 | `Deck.list()` (in `loadAll`) |
| `src/api/storage.js` | 488 | `Deck.update(id, { card_count: next })` (in `adjustDeckCount`) |
| `src/api/storage.js` | 499 | `Deck.update(id, { card_count: count })` (in `recalculateDeckCount`) |
| `src/store/appStore.js` | 106, 121 | indirect via `storage.ensureDeck` |

### Flashcard
| File | Line | Operation |
|------|------|-----------|
| `src/api/storage.js` | 195 | `Flashcard.list(undefined, INIT_LIMIT, 0)` (initial 200-card page) |
| `src/api/storage.js` | 257 | `Flashcard.list(undefined, limit, skip)` (background paging in `loadCardsPage`) |
| `src/api/storage.js` | 313 | `Flashcard.delete(entityId)` (in `_doSync`) |
| `src/api/storage.js` | 319 | `Flashcard.create(toEntityData(card, deckId))` |
| `src/api/storage.js` | 325 | `Flashcard.update(entityId, toEntityData(...))` |
| `src/store/appStore.js` | many | indirect via `storage.syncCards` / `storage.loadAll` |
| `src/views/SessionView.jsx`, `DeckView.jsx`, `StudySelectView.jsx`, `FreeStudyView.jsx`, `StatsView.jsx`, `pages/Home.jsx` | — | read in-memory `cards` from store; write via `useAppStore.updateCards` (which calls `storage.syncCards` debounced) |
| `src/modals/EditCardModal.jsx`, `AIDiffModal.jsx`, `CardHistoryModal.jsx` | — | mutate cards via the same store action |

### SessionLog
| File | Line | Operation |
|------|------|-----------|
| `src/api/storage.js` | 196 | `SessionLog.list()` (in `loadAll`) |
| `src/api/storage.js` | 459 | `SessionLog.create(...)` (in `appendLog`) |
| `src/api/storage.js` | 475 | `SessionLog.update(entityId, updates)` (in `updateLog`) |
| `src/store/appStore.js` | 92, 192 | indirect via `storage.appendLog` and `storage.updateLog` |
| `src/views/SessionView.jsx` | — | calls `onSaveLog` → `storage.appendLog` |
| `src/views/StatsView.jsx` | — | reads in-memory `log` from store |

### User
| File | Line | Operation |
|------|------|-----------|
| `src/lib/AuthContext.jsx` | 96 | `base44.auth.me()` |
| `src/lib/PageNotFound.jsx` | 14 | `base44.auth.me()` |
| `src/api/notionSettings.js` | 23, 67 | `base44.auth.me()` (read Notion fields off user) |
| `src/api/notionSettings.js` | 40, 51, 69 | `base44.auth.updateMe({ notion_integration_token, notion_database_id })` |

### Auxiliary entities (used but not in scope of the brief)
- **CardState**: `storage.js:185, 368, 370, 452` — list/create/update; primary persistence path for FSRS scheduling fields.
- **CardHistory**: `storage.js:511, 514, 528` — list/create for AI-edit version trail.
- **UserSchedulerParams**: `storage.js:243, 424, 426` — at-most-one record per user; FSRS optimizer params + lastFitDate.

## 4. Auth integration

**SDK init** (`src/api/base44Client.js`):
```js
createClient({ appId, token, functionsVersion, serverUrl: '', requiresAuth: false, appBaseUrl })
```
`requiresAuth: false` means the SDK does not enforce auth client-side. The token comes from `appParams` (URL `?access_token=…` → localStorage `base44_access_token`).

**Auth flow** (`src/lib/AuthContext.jsx`):
1. On mount, `checkAppState()` GETs `/api/apps/public/prod/public-settings/by-id/${appId}` with optional `Authorization: Bearer ${token}`.
2. If the response is 403 with `extra_data.reason === 'auth_required' | 'user_not_registered'`, an `authError` is set and `App.jsx:21` redirects via `base44.auth.redirectToLogin(...)` or shows `<UserNotRegisteredError/>`.
3. If 200 and a token exists, `checkUserAuth()` calls `base44.auth.me()` and stores the user in context state.
4. `App.jsx:25-28` only renders `<Routes>` once both loading flags are false and there's no fatal `authError`.

**Where session state lives**: in-memory React Context (`AuthProvider`). Token is in `localStorage` (`base44_access_token`), managed by the SDK. The `useAuth()` user object is **never read by feature code** — `useAppStore`, `storage.js`, the views, and the modals all operate as if the app were single-user.

**Do entity writes attach the authenticated user ID?**
- **No explicit `userId`/`owner_id` field is set on any write.** `toEntityData(card, deckId)` (`storage.js:137`) writes only content + scheduling fields; nothing user-scoped.
- Multi-tenant isolation, if any, depends entirely on Base44 server-side enforcement (the platform's Row-Level-Security analogue) using the bearer token. There are no client-side checks tying records to the current user.
- `notionSettings.js` is the only path that explicitly scopes data to the current user, via `base44.auth.updateMe(...)` (writing to the User entity itself).
- `Deck.list()` / `Flashcard.list()` / `SessionLog.list()` / `CardState.list()` / `UserSchedulerParams.list()` rely on the platform to filter by caller. **Any breach of that platform-level filter would expose all users' decks/cards/logs.**

This is the most material finding of the audit (see Section 8).

## 5. FSRS implementation

**Library**: `ts-fsrs ^4.0.0` (currently locked at 4.7.1 per `npm outdated`; latest 5.3.2 — major version behind).

**Core scheduling** (`src/lib/fsrs.js`):
- `scheduleFSRS(card, rating, retentionTarget, schedulerParams, now)` (`fsrs.js:18`) — wraps `ts-fsrs.fsrs(generatorParameters({ request_retention, w })).repeat(tsCard, now)` and returns `{ stability, difficulty, interval }`.
- `getDue` / `getNew` / `getDueWithCatchup` (`fsrs.js:81–101`) — selection helpers; date comparison is string-based on `nextReview` (YYYY-MM-DD).
- `fitSchedulerParams` (`fsrs.js:52`) — synchronous retention-target adjuster (only after >=200 reviews; nudges target by ±0.02).

**Async optimizer** (`src/lib/fsrs-optimizer.js`): full FSRS-5 gradient descent. Code-split out as a separate chunk (`dist/assets/fsrs-optimizer-*.js`), invoked from `SettingsView` "Refit parameters".

**Rating handlers**:
- Primary entry point: `SessionView.jsx:84` `handleRate(rating)` — calls `scheduleFSRS`, computes new `{ stability, difficulty, interval, nextReview, lastReview, reviewCount, lapses, ratingHistory }`, mutates the in-memory `cards` array via `onUpdateCards` (which is `useAppStore.updateCards`), and pushes to the offline queue if `!navigator.onLine` (`SessionView.jsx:102`).
- `intLabel` (`SessionView.jsx:168`) — calls `scheduleFSRS` to preview the projected interval on each rating button.
- `handleUndo` (`SessionView.jsx:123`) — restores from `lastAction` snapshot.

**Persistence path for stability / difficulty / nextReview**:
1. `useAppStore.updateCards(updated)` (`appStore.js:56`) sets a 800ms debounced timer.
2. On fire, calls `storage.syncCards(updated)` (content-only diff) **and** `storage.syncCardStates(updated)` (scheduling-only diff).
3. `syncCardState` (`storage.js:350`) writes to the `CardState` entity keyed by `cardClientId`, with fields `{ stability, difficulty, interval, nextReview, lastReview, reviewCount, lapses, ratingHistory[-50:], suspended, buriedUntil, clozeIndex, sourceCardClientId }`. Creates if no entity yet, otherwise updates.
4. Backward-compat shim: `toAppCard` (`storage.js:93`) reads `CardState` if present, else falls back to legacy fields on `Flashcard`. The migration to split state out of `Flashcard` lives in `migrations/2026-04-26-split-card-state.js`, auto-invoked from `appStore.init()` if any unmigrated card with state is detected.
5. Offline path: `offline-store.queueRating({ cardClientId, rating, timestamp, newState })` (`SessionView.jsx:103`) writes to Dexie; flushed on reconnect by `drainQueue(storage.syncCardState)` (`pages/Home.jsx:86`).

`flushCards` (`appStore.js:72`) is awaited at session-close before `addLog`, so a session-end always forces a flush.

## 6. Dependency audit

### `npm outdated` (highlights — full output captured during audit)

| Package | Current | Latest | Major behind? |
|---------|---------|--------|---------------|
| react / react-dom | 18.3.1 | 19.2.5 | yes (React 19) |
| react-router-dom | 6.30.3 | 7.14.2 | yes |
| ts-fsrs | 4.7.1 | 5.3.2 | **yes — FSRS-5 algorithm changes** |
| recharts | 2.15.4 | 3.8.1 | yes |
| tailwindcss | 3.4.19 | 4.2.4 | yes (v4 is config-less) |
| zod | 3.25.76 | 4.4.1 | yes |
| vite | 6.4.1 | 8.0.10 | yes (also vuln, see below) |
| date-fns | 3.6.0 | 4.1.0 | yes |
| @stripe/* | 5.x / 3.x | 9.x / 6.x | yes |
| react-day-picker | 8.10.1 | 9.14.0 | yes |
| react-resizable-panels | 2.1.9 | 4.10.0 | yes |
| framer-motion | 11.18.2 | 12.38.0 | yes |
| typescript | 5.9.3 | 6.0.3 | yes |
| @vitejs/plugin-react | 4.7.0 | 6.0.1 | yes |
| eslint | 9.39.2 | 10.3.0 | yes |
| eslint-plugin-react-hooks | 5.2.0 | 7.1.1 | yes |

(In addition, ~10 packages have minor/patch updates available within the same major.)

### `npm audit` summary

**21 vulnerabilities — 1 critical, 11 high, 9 moderate**.

| Severity | Package | Advisory | Fix path |
|----------|---------|----------|----------|
| **critical** | jspdf <=4.2.0 | PDF Object Injection via FreeText color (GHSA-7x6v-j9x4-qf24); HTML Injection in New Window (GHSA-wfv2-pwc8-crg5) | `npm audit fix` (in-range) |
| high | vite <=6.4.1 | Path traversal in optimized deps (GHSA-4w7w-66w2-5vf9); Arbitrary file read via dev-server WS (GHSA-p9ff-h696-f583) | `npm audit fix` |
| high | xlsx (sheetjs) | Prototype pollution (GHSA-4r6h-8v6p-xvw6); ReDoS (GHSA-5pgg-2g8v-p4x9) | **No fix on npm — sheetjs has been pulled from npm; must migrate to `@sheet/sheet` CDN tarball or replace with `exceljs`/`xlsx-populate`** |
| high | lodash | Code Injection in `_.template` (GHSA-r5fr-rjxr-66jc); prototype pollution in `_.unset/_.omit` (GHSA-f23m-r3pf-42rh) | `npm audit fix` |
| high | minimatch <=3.1.3, picomatch | Multiple ReDoS | `npm audit fix` |
| high | flatted <=3.4.1 | Unbounded recursion DoS, prototype pollution | `npm audit fix` |
| high | serialize-javascript / @rollup/plugin-terser / workbox-build / vite-plugin-pwa | RCE via RegExp.flags (GHSA-5c6j-r48x-rmvq) | `npm audit fix --force` (vite-plugin-pwa breaking) |
| high | socket.io-parser | Unbounded binary attachments (GHSA-677m-j7p3-52f9) | `npm audit fix` |
| moderate | dompurify <=3.3.3 | Multiple mXSS / XSS / ADD_ATTR bypass / USE_PROFILES proto-pollution | `npm audit fix` |
| moderate | axios 1.0.0–1.14.0 | NO_PROXY bypass SSRF; cloud metadata exfiltration | `npm audit fix` |
| moderate | uuid <14 / @base44/sdk | OOB write in v3/v5/v6 (GHSA-w5hq-g745-h8pq) | `npm audit fix --force` (downgrades sdk) |
| moderate | quill (via react-quill) | XSS (GHSA-4943-9vgg-gr5r) | requires breaking change; consider replacing react-quill |
| moderate | brace-expansion, follow-redirects, postcss <8.5.10 | misc | `npm audit fix` |

**Critical/high requiring action**:
1. **jspdf** — bump to 4.2.1 (in-range patch).
2. **xlsx** — no fix on npm; pick a replacement.
3. **vite** — bump to 6.4.2 (in-range patch).
4. **vite-plugin-pwa / workbox-build / serialize-javascript** — needs `--force` (downgrade vite-plugin-pwa to 0.19.8) **or** wait for upstream patch on a non-breaking 0.21.x release.
5. **lodash, dompurify, axios, postcss, follow-redirects** — all in-range patches via `npm audit fix`.

## 7. Bundle size

Production build (`npm run build`, Vite 6.4.1) succeeded with no chunk-size warnings emitted to stdout (Vite suppressed at default threshold). Output dir: `dist/`.

**Total `dist/` size: 2,307,295 bytes (~2.20 MB)** including PWA assets and sql-wasm.

### Five largest emitted chunks

| Rank | File | Size | Notes |
|------|------|------|-------|
| 1 | `dist/assets/index-BVqZgmqA.js` | **993,857 B (~970 KB)** | Main app bundle. Single chunk; everything that's not lazy-loaded ends up here, including ts-fsrs, recharts, react-quill, framer-motion, three.js, html2canvas, jspdf, react-leaflet, lucide-react. |
| 2 | `dist/sql-wasm.wasm` | 659,730 B (~644 KB) | sql.js wasm runtime (used by `api/anki.js` for .apkg parsing). Loaded on demand by sql.js but copied to `public/` at build time. |
| 3 | `dist/assets/xlsx-CkFp8p6R.js` | 429,534 B (~419 KB) | sheetjs (`xlsx`) — code-split via dynamic import in `api/excel.js`. Also flagged high-severity in npm audit. |
| 4 | `dist/assets/index-BRkUZJwj.css` | 79,663 B (~78 KB) | Tailwind + shadcn/ui CSS. |
| 5 | `dist/assets/anki-CVqxawB6.js` | 65,163 B (~64 KB) | Anki .apkg loader (`api/anki.js`) — code-split. |

Plus tiny code-split chunks: `aiAssist` (1.2 KB), `fsrs-optimizer` (1.2 KB), the migration script (638 B), and Workbox SW (21 KB).

**Concern**: the main `index-*.js` is ~970 KB unminified-text / well over Vite's default 500 KB warn threshold; it bundles several heavyweight libraries that are not needed on first paint (recharts → only StatsView, react-quill → only EditCardModal, three.js → only one decorative usage, html2canvas + jspdf → only export). Dynamic imports / `React.lazy` would shift these out of the critical path.

## 8. Cross-cutting findings flagged for follow-up phases

These are observations only; this audit changes no source files.

- **Identity-bound writes are absent.** Section 4: no client-side `userId` is written on Flashcard/Deck/SessionLog/CardState/UserSchedulerParams/CardHistory creates. Multi-tenant safety is 100% reliant on Base44's server-side scoping of the bearer token.
- **`ProtectedRoute.jsx` is unmounted dead code.** `App.jsx` does its own gating; the file is imported by no router. It should either be wired in or removed.
- **`requiresAuth: false` on the SDK client** (`base44Client.js:12`) — auth is enforced by us, not by the SDK. Tighter would be `requiresAuth: true` once the routing gate is firm.
- **`xlsx` (sheetjs) has no npm-side fix** for the prototype-pollution + ReDoS advisories, and remains in the bundle as a 419 KB chunk. Consider switching to `exceljs` or sheetjs-pulled-from-CDN, or removing Excel I/O.
- **Main bundle is one ~970 KB chunk.** Lazy-loading `recharts` (StatsView), `react-quill` (EditCardModal), `jspdf`+`html2canvas` (export), and `three` would meaningfully cut first-paint cost.
- **`ts-fsrs` is one major version behind (4.7.1 → 5.x).** FSRS-5 has algorithmic differences; a deliberate migration is warranted, not a passive update.
- **There is no integration test that exercises a full Base44 round-trip.** Tests are unit-level (`smoke`, `aiAssist`, `notionSettings`, FSRS regression, view snapshots). Phase 1 RLS/binding work will need a fixture user and seed deck cleanup harness given the two-real-user constraint.
