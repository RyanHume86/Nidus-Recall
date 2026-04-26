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

- Review the `Flashcard.jsonc` and `User.jsonc` `—` JSON escape sequences and
  decide whether to replace with hyphens for source consistency.
