# Phase 5 Streamlining Audit

## Inventory (before)

### Top 10 largest source files
| Lines | File |
|---|---|
| 626 | src/components/ui/sidebar.jsx |
| 609 | src/api/storage.js |
| 539 | src/views/DeckView.jsx |
| 529 | src/views/SessionView.jsx |
| 503 | src/views/SettingsView.jsx |
| 502 | src/api/anki.js |
| 406 | src/views/StatsView.jsx |
| 401 | src/pages/Home.jsx |
| 344 | src/store/appStore.js |
| 323 | src/modals/EditCardModal.jsx |

### Unused dependencies (depcheck)
None found. Phase 5 additions (5.1 + 5.2) used only already-installed deps:
- `vite-plugin-pwa` — already present pre-phase
- `dexie` — already present pre-phase
- No new production dependencies added.

### Circular dependencies
None found (madge).

### Bundle (after Phase 5)
- `dist/assets/index-*.js`: 1,171,487 bytes (+860 bytes vs p4 — PWA/offline code adds <1 KB to main bundle)
- `dist/assets/xlsx-*.js`: 429,534 bytes (unchanged)
- `dist/assets/anki-*.js`: 65,163 bytes (unchanged)

## Refactor plan

1. **No unused deps to remove** — depcheck clean.
2. **No file splits this round** — Phase 5 files (offline-store.js 109 lines, pwa.js 43 lines) are small and cohesive.
3. **No circular deps to fix.**

## Actions taken

1. Ran depcheck — clean.
2. Ran madge circular check — clean.
3. Ran full build and confirmed bundle size unchanged within noise.
4. 557 tests confirmed passing.

## Before / After

| Metric | Before (p4 end) | After (p5 end) |
|---|---|---|
| Prod deps added | — | 0 |
| Circular deps | 0 | 0 |
| Test count | 547 | 557 |
| Bundle main (bytes) | 1,170,627 | 1,171,487 (+860) |
| Lines added (Phase 5) | — | +348 (offline-store, pwa, tests) |
