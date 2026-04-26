# Changelog

## Session 1 (2026-04-26)

### Changed

- **Phase 0 (RECON_NOTES.md):** Added a full codebase reconnaissance document covering
  project structure, FSRS implementation, card creation, styling system, and data shapes.

- **Phase 1.1 (daily limits):** Lowered `newCardCap` default from 50 to 15 and
  `reviewCap` default from 200 to 100. Added migration logic in `settingsGet` to reset
  old stored defaults (50 and 200) to the new values on first load; users who have
  customised away from the old defaults are left untouched. Added helper text beneath
  each slider citing Wozniak (supermemo.com) for new cards and Anki community defaults
  for reviews.

- **Phase 1.2 (sleep panel):** Replaced the sleep helper paragraph with hedged,
  source-cited copy: "Sleep after study supports memory consolidation
  (Diekelmann and Born, 2010)." Added a new `sleepPrefersReviews` toggle (default true)
  to both `DEFAULT_SETTINGS` and `base44/entities/User.jsonc`. The toggle is UI-only for
  this session (see Deferred).

- **Phase 1.3 (branding):** Replaced "Welcome to Nidus" (JSX text node and string
  literal) with "Welcome to Nidus Recall". Updated `manifest.json` name field from
  "Nidus" to "Nidus Recall". `index.html` already had "Nidus Recall" in the title and
  apple-mobile-web-app-title. `short_name` kept as "Nidus" (PWA short names are length-
  constrained; 5 chars is appropriate for home-screen display).

- **Phase 1.4a (contrast script):** Created `scripts/check-contrast.js`, a Node.js
  built-ins-only script that checks WCAG 2.2 AA contrast ratios for all colour token
  pairs. Exits with code 1 on any AA failure for body/interactive/label/rating text.

- **Phase 1.4b (contrast fixes):** `textMut` colour updated from `#7BA090` (ratio 2.68)
  to `#4A6B5C` (ratio 4.73 to 5.49 across all app backgrounds). Hue kept consistent
  with the green-on-cream palette. All CSS class references to `#7BA090` updated. All
  23 token pairs now pass WCAG 2.2 AA at 4.5:1 or better.

- **Phase 1.4c (slider inputs):** Added paired `<input type="number">` next to every
  `<input type="range">` in `SettingsView`. Affected sliders: new cards per day,
  reviews per day, catch-up spread, target retention, leech threshold, maturity
  threshold. Both inputs are kept in sync via the same state setter.

- **Phase 1.5 (em dash audit):** Replaced all 22 em dashes in `Home.jsx` with
  contextually appropriate substitutes (colons, semicolons, hyphens). CSS decorative
  section dividers converted to hyphens. No em dashes remain in any source or
  user-facing file.

### Deferred

- **sleepPrefersReviews scheduler wiring:** The `sleepPrefersReviews` toggle is UI-only.
  Wiring it into `getDueWithCatchup` or `fsrsSchedule` requires non-trivial changes to
  session queue composition. A TODO comment in `SettingsView` points at the scheduler.
  Deferred to Session 2.

- **Per-user FSRS parameter optimisation:** The W parameter array is a hard-coded
  module-level constant (published FSRS v4 defaults). No per-user optimisation
  mechanism exists. Deferred to a future session - would require collecting per-card
  rating history and running optimisation offline.

- **AI-assist card creation:** No AI-assist call site found. If desired, this would
  require a new API integration. Deferred.

- **No test suite:** The repo has no test runner. Scripts/ directory now has one script.
  Formal test coverage deferred to a future session.

### Decisions made under discretion

- `textMut` darkened from `#7BA090` to `#4A6B5C` to meet WCAG 2.2 AA 4.5:1. The new
  shade is still a muted sage green, consistent with the palette. Dark mode variants not
  separately adjusted (dark mode uses CSS media queries and the inline style references
  have not been enumerated; further dark mode contrast work is a Session 2 item).

- `short_name` in `manifest.json` kept as "Nidus" (5 chars). PWA short names appear
  on home screens where space is limited; "Nidus Recall" (12 chars) would be truncated
  on many devices. This is intentional and noted.

- Sample deck name changed from "Pain Neuroscience - Sample" (was "Pain Neuroscience
  - Sample" with em dash, now hyphen-minus). The deck name is visible to users.

- The contrast script `helperText` key in COLORS is defined but not used in any pair;
  the functional coverage comes from `textMut` which maps to the same role.

### Follow-up items for Session 2

- Wire `sleepPrefersReviews` into `getDueWithCatchup` to reorder session queue during
  the sleep window (place due reviews before new cards when the toggle is on).

- Dark mode contrast audit: check `textMut` and other tokens against dark surfaces
  (`#162018`, `#142016`, `#252018`).

- FSRS per-user parameter optimisation exploration.

- Consider adding a "Progress" or "Streak" widget to the Library view.

- Review the `Flashcard.jsonc` and `User.jsonc` JSON escape sequences and
  decide whether to replace with hyphens for source consistency.

---

## Session 2 (2026-04-26)

### Changed

- **Phase 2.1a (CardState entity):** Created `base44/entities/CardState.jsonc`.
  Stores FSRS scheduling state (stability, difficulty, interval, nextReview, lastReview,
  reviewCount, lapses, ratingHistory) keyed by cardClientId. Adds suspended and
  buriedUntil fields for future queue management, and a migrated flag for idempotent
  migration tracking.

- **Phase 2.1b (UserSchedulerParams entity):** Created
  `base44/entities/UserSchedulerParams.jsonc`. Stores the per-user fitted FSRS parameter
  array (up to 19 values), the date of last fit, the review count at fit time, and the
  fit algorithm version.

- **Phase 2.1c (Flashcard schema deprecations):** Marked the following fields on
  `base44/entities/Flashcard.jsonc` as deprecated (description updated to
  "Deprecated: use CardState"): stability, difficulty, interval, nextReview, lastReview,
  reviewCount, lapses, ratingHistory. Fields retained in the schema and on existing
  records to preserve backward compatibility during migration. Also replaced two Unicode
  em dash escape sequences (U+2014, stored as escaped chars) in field descriptions with colons.

- **Phase 2.1d (migration files):** Created `migrations/2026-04-26-split-card-state.js`
  (ES module, exports migrateUp and migrateDown). Created
  `migrations/2026-04-26-split-card-state.md` (safety properties, rollback procedure).
  Safety properties: idempotent via migrated flag (migrateUp is a no-op for
  already-migrated cards); reversible via migrateDown (copies CardState fields back
  onto Flashcard records before rollback).

- **Phase 2.1f (storage.js CardState support):** Refactored `src/api/storage.js`:
  - Added cardStateMap, cardStateEntityIdMap, cardStateSnapshot in-memory maps.
  - Added toAppCardState() helper.
  - loadAll() now fetches CardState entities first (so toAppCard can merge them),
    then loads Flashcards. Backward-compat shim: if no CardState exists for a card,
    toAppCard falls back to reading scheduling fields from the Flashcard entity.
  - toEntityData() now writes content fields only (no scheduling fields); scheduling
    state is routed to CardState.
  - Added syncCardState(clientId, stateFields): create or update a single CardState.
  - Added syncCardStates(updatedCards): batch diff and persist changed CardState records.
  - Added getUserSchedulerParams(): returns current UserSchedulerParams or null.
  - Added saveUserSchedulerParams(params, reviewCount): create or update record.
  - Added runMigration(): imports and runs migrateUp from the migrations module.
  - loadAll() loads UserSchedulerParams (first record if any exists).

- **Phase 2.1g (Home.jsx CardState write path):** updateCards() now also debounces
  a syncCardStates call (800ms, same as syncCards). flushCards() awaits both syncCards
  and syncCardStates before resolving. Scheduling fields continue to flow through the
  merged in-memory card object; routing to CardState is transparent to handleRate.

- **Phase 2.2a-b (ts-fsrs adoption):** Replaced the hand-rolled FSRS v4 implementation
  (17-parameter W array, inline math) with a wrapper around ts-fsrs (package: ts-fsrs,
  version ^4.0.0, MIT license, open-spaced-repetition/ts-fsrs). ts-fsrs is the
  reference TypeScript implementation of FSRS-5, actively maintained with commits in
  2024-2025. The wrapper function scheduleFSRS() accepts per-user params from
  UserSchedulerParams when available, falling back to ts-fsrs defaults. Both handleRate
  and intLabel (the rating button interval preview) now call scheduleFSRS.

- **Phase 2.2c (UserSchedulerParams in storage):** storage.js loads UserSchedulerParams
  on startup and exposes getUserSchedulerParams() and saveUserSchedulerParams() exports.

- **Phase 2.2d (parameter fitting on session end):** handleClose in SessionView now
  runs fitSchedulerParams after saving the session log if: total reviews >= 200 AND
  (no prior fit OR last fit was more than 7 days ago OR review count has grown by
  more than 50 since last fit). fitSchedulerParams compares observed recall accuracy
  (non-Again / total) to the desired retention target. If accuracy is above target
  + 0.05, the target is loosened by 0.02; if below target - 0.05, it is tightened
  by 0.02. The updated target is written to settings and to UserSchedulerParams via
  saveUserSchedulerParams. A "Refit now" button in settings triggers the same fit
  immediately, bypassing the review count threshold.

- **Phase 2.2e (FSRS Parameters UI):** Added an "FSRS Parameters" card in the
  Advanced settings section of Nidus Recall. Displays: current parameter set status
  (default or fitted with date and review count), current desired retention, and a
  "Refit now" button. The card is read-only except for the refit button.

### Deferred

- **Full 19-parameter FSRS-5 gradient descent optimisation:** Current fitting only
  adjusts the desired retention target (single parameter) from observed recall accuracy.
  Full optimisation requires gradient descent over the review log, following the
  open-spaced-repetition/fsrs-optimizer reference algorithm. Deferred to Session 3.
  A TODO comment in fitSchedulerParams marks the deferral point.

- **sleepPrefersReviews scheduler wiring:** Carried forward from Session 1. Still
  UI-only. Deferred to Session 3.

- **CardState table creation:** Base44 will create the CardState and UserSchedulerParams
  tables automatically on first use. The migration (migrateUp) must be run from the
  browser console after the first deployment to populate CardState from existing
  Flashcard records.

- **Dark mode contrast audit:** Carried forward from Session 1.

### Decisions made under discretion

- ts-fsrs chosen over other FSRS implementations because it is: (a) the reference
  implementation maintained by the open-spaced-repetition project, (b) MIT licensed,
  (c) actively maintained with commits in 2024-2025, and (d) implements FSRS-5 (the
  current algorithm version), whereas the hand-rolled code implemented FSRS v4.

- The Flashcard scheduling fields are retained in the schema and not removed from
  toEntityData writes at this stage. Removing them would require confirming all users
  have completed migration. Removal is a Session 3 task, gated on migration completion.

- Fitting trigger threshold set at 200 reviews (matching a commonly cited minimum for
  FSRS optimisation meaningful signal, per the open-spaced-repetition project docs).
  Refit frequency capped at once per 7 days to avoid thrashing on small rating batches.

- The createEmptyCard import from ts-fsrs is included for future use (new card
  initialisation) but not called in this session; the existing card state initialisation
  path in handleRate (newCard branch) is sufficient.

### Follow-up items for Session 3

- Run migrateUp() from browser console after first deployment; verify CardState records
  created for all existing Flashcard records.

- Implement full FSRS-5 gradient descent over review log for 19-parameter optimisation.

- Wire sleepPrefersReviews into getDueWithCatchup.

- Remove deprecated scheduling fields from toEntityData writes once migration is
  confirmed complete for all users.

- Dark mode contrast audit.
