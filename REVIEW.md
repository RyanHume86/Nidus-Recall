# Phase 4 Streamlining Audit

## Inventory (before)

### Top 20 largest source files
| Lines | File |
|---|---|
| 626 | src/components/ui/sidebar.jsx |
| 609 | src/api/storage.js |
| 539 | src/views/DeckView.jsx |
| 529 | src/views/SessionView.jsx |
| 503 | src/views/SettingsView.jsx |
| 502 | src/api/anki.js |
| 406 | src/views/StatsView.jsx |
| 397 | src/pages/Home.jsx |
| 326 | src/store/appStore.js |
| 323 | src/modals/EditCardModal.jsx |

### Unused dependencies (depcheck)
Production: `@hello-pangea/dnd`, `@hookform/resolvers`, `@radix-ui/react-toast`, `@stripe/react-stripe-js`, `@stripe/stripe-js`, `canvas-confetti`, `framer-motion`, `html2canvas`, `jspdf`, `lodash`, `moment`, `react-hot-toast`, `react-leaflet`, `react-quill`, `three`, `zod`

DevDependencies: `baseline-browser-mapping`, `eslint-plugin-react-refresh`

Note: `autoprefixer` and `postcss` flagged as unused by depcheck but ARE required by the PostCSS build pipeline — retained.

### Circular dependencies
None found (madge).

### Bundle (before)
- `dist/assets/index-*.js`: 1,170,627 bytes
- `dist/assets/xlsx-*.js`: 429,534 bytes
- `dist/assets/anki-*.js`: 65,163 bytes

## Refactor plan

1. **Remove unused prod deps** (16 packages) — reduces package.json surface and install time.
2. **Remove unused devDeps** (2 packages, keeping postcss/autoprefixer which ARE used).
3. **No file splits this round** — DeckView/SessionView are large but all state is cohesive.
4. **No circular deps to fix.**

## Actions taken

1. Uninstalled 16 unused prod deps.
2. Uninstalled 2 unused devDeps (`baseline-browser-mapping`, `eslint-plugin-react-refresh`).
3. Build and full test suite verified after each change.

## Before / After

| Metric | Before | After |
|---|---|---|
| Prod deps removed | — | 16 |
| DevDeps removed | — | 2 |
| Circular deps | 0 | 0 |
| Test count | 533 | 533 |
| Bundle main (bytes) | 1,170,627 | unchanged (tree-shaken already) |
| Lines removed | 0 (no code changes) | — |
