# Performance Results — Post-Virtualisation

Session 4 changes applied. Compare against [PERF_BASELINE.md](PERF_BASELINE.md).

## Changes Delivered

### Phase 2 — Virtualisation (`@tanstack/react-virtual` v3)

| Component | Threshold | Strategy |
|---|---|---|
| LibraryView deck list | > 50 decks | Fixed-height scroll container, `estimateSize: 84 px`, `measureElement` |
| DeckView flat card list | > 100 cards | `calc(100vh - 540px)` scroll container, `measureElement` (handles accordion expand) |
| StatsView session log | > 200 entries | `min(600px, calc(100vh - 400px))` scroll container, `measureElement` |
| CardHistoryModal history list | > 50 versions | `calc(min(80vh, 600px) - 140px)` scroll container, `measureElement` |

Below threshold: each component falls through to the normal `map()` render path — no virtualiser overhead on small datasets.

### Phase 3 — Chunked card loading

- `loadAll()` fetches only the first **200 cards** on startup (was: all cards).
- Remaining cards are loaded in **500-card background pages** via `loadCardsPage(skip, limit)`.
- `cardsFullyLoaded` store flag gates the Study screen: button is disabled and a "Loading cards…" banner appears until the background pass completes.
- Study screen is unblocked as soon as all pages are fetched.

## Expected Performance (post-optimisation)

| View | Condition | Expected TTI | FPS |
|---|---|---|---|
| LibraryView | 80 decks (virtualised) | < 150 ms | 60 fps |
| DeckView | 250 cards per deck (virtualised) | < 300 ms | 60 fps |
| DeckView | 5000 cards in one deck | < 500 ms | 58+ fps |
| StatsView | 300 log entries (virtualised) | < 200 ms | 60 fps |
| Initial load | 5000 cards total | First-paint with 200 cards, remainder in background | — |

## Test Coverage

Automated timing regression tests in `src/__tests__/perf/virtualisation.test.jsx`:
- StatsView with 1000 log entries renders in < 2000 ms (jsdom, 4× CPU)
- LibraryView with 200 decks renders in < 2000 ms (jsdom, 4× CPU)
- Both below-threshold and above-threshold paths mount without error

## Notes

- jsdom has no layout engine, so virtualiser items aren't culled in unit tests.
  Real-browser measurements require DevTools profiling with the synthetic load from `scripts/synthetic-load.js`.
- The `enabled: items.length > THRESHOLD` option in `useVirtualizer` avoids even constructing the virtualiser for small lists.
- DeckView `groupBySource` mode is excluded from virtualisation (nested group structure; below typical thresholds).
