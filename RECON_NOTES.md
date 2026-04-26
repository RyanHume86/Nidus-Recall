# Nidus Recall - Session 1 Reconnaissance Notes

## 1. Project Structure

**Routing layer:** No react-router-dom routing in use for page navigation. Instead a
single-file component pattern: `Home.jsx` holds all views and switches between them
via a `view` state string ("library", "deck", "study-select", "session", "free-study",
"stats", "settings"). `App.jsx` wraps `Home` in an auth-gated route via `ProtectedRoute`.

**Component tree (all inside Home.jsx):**
- `Home` (root) - holds all state: cards, decks, log, settings, view
  - `LibraryView` - deck list, sleep banner
  - `DeckView` - card list, add-card form, edit card modal
    - `EditCardModal`
  - `StudySelectView` - mode/deck picker
  - `SessionView` - FSRS review loop
  - `FreeStudyView` - browse without scheduling
  - `StatsView` - retention, calibration chart, session log
  - `SettingsView` - study/sleep/data tabs
    - `ImportExportPanel` - Notion, Excel, JSON backup
  - `OnboardingView` - first use
  - `ReturnOnboardingCard` - gap-after-absence re-entry

**State management:** Pure React `useState` / `useEffect`. No Zustand, Redux, or
context (aside from `AuthContext.jsx` for auth). Settings are persisted to
`localStorage` via helpers (`lsGet`/`lsSet`). Cards and log are persisted to
Base44 via `storage.js`.

**Base44 SDK pattern:** `base44Client.js` exports a `base44` singleton from
`@base44/sdk`. `storage.js` is a thin adapter that maps app objects to Base44
entity shapes, maintains in-memory ID maps, and provides `loadAll`, `syncCards`,
`appendLog`, `updateLog`, `adjustDeckCount`, `recalculateDeckCount`, `ensureDeck`.

**Entity schemas (base44/entities/):**
- `Deck.jsonc` - title, card_count
- `Flashcard.jsonc` - front, back, contentType, elaboration, status, nextReview,
  interval, reviewCount, stability, difficulty, lapses, lastReview, anchor,
  stakes_flag, connects_to, tags, ratingHistory, source, prerequisite_card_id
- `SessionLog.jsonc` - date, reviewed, failed, newAdded, frictionNote,
  intensity_score, status
- `User.jsonc` - role, sleep_bedtime, sleep_window_minutes, sleep_banner_enabled,
  mature_card_threshold, mature_mode_enabled, intensity_prompts_enabled,
  intensity_threshold, fatigue_alerts_enabled, attention_declaration_enabled,
  first_study_completed

**Build scripts:** `vite dev`, `vite build`, `vite preview`. ESLint via
`eslint.config.js`. TypeScript type-check via `tsc -p jsconfig.json`. No test runner.

## 2. FSRS Implementation

**Location:** Inline in `Home.jsx` starting at line 118, labelled "FSRS v4".

**Library:** Hand-rolled - no ts-fsrs or other off-the-shelf package. Implements the
full FSRS v4 algorithm: stability initialization (`fsrsS0`), difficulty initialization
(`fsrsD0`), retrievability (`fsrsR`), stability-after-recall (`fsrsSRecall`),
stability-after-forgetting (`fsrsSForget`), difficulty update (`fsrsDUpdate`),
interval computation (`fsrsInterval`).

**Parameter set (W array, 17 params):**
`[0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0589, 1.5330,
0.1544, 1.0071, 1.9442, 0.1100, 0.2900, 2.2700, 0.2500, 2.9898]`

These are the published FSRS v4 default weights, not user-optimized.

**Per-user parameter optimisation:** Not implemented. W is a module-level constant.

**Entry point:** `fsrsSchedule(card, ratingStr, target=0.9)` - called in `handleRate`
in `SessionView`.

**Due-card selection:** `getDueWithCatchup(cs, cap, days, allCards)` - filters by
`nextReview <= today`, respects prerequisite stability >= 7 gate, then caps via
`Math.ceil(all.length / days)` up to `cap`.

## 3. Card Creation

**Supported card types (contentType):**
Factual, Mechanism, Clinical Reasoning, Anatomy, Pathology

**Editor component:** No dedicated editor component. Card creation lives inline in
`DeckView` (full form) and a "Quick add" mini-form. Fields: front, back, tags,
contentType, source, stakesFlag, note (elaboration), anchor, connects_to,
prerequisite_card_id.

**AI-assist:** No AI-assist call site found in the codebase. Card creation is manual only.

**Notion import/export:** `src/api/notion.js` - `testConnection`, `exportToNotion`,
`importFromNotion`. Uses Notion integration token + database ID stored in localStorage.

**Excel import/export:** `src/api/excel.js` - `exportToExcel`, `importFromExcel`.
Uses the `xlsx` npm package (.xlsx/.xls/.ods/.csv support).

**JSON backup:** Inline in `Home.jsx` - `handleExport` / `handleImport`. Full JSON
including cards, log, decks at version 3.

## 4. Styling System

**Approach:** Plain CSS injected via a template literal string (`CSS`) inside
`Home.jsx`. No Tailwind utilities used in Home.jsx (Tailwind config exists for the
shadcn/ui components in `src/components/ui/`).

**Colour palette:** Defined in the `C` object at the top of Home.jsx:
- `bg`: `#F4F7F5` (light cream-green)
- `surface`: `#EBF0ED`
- `elevated`: `#DFE8E3`
- `text`: `#1C2820` (dark green-black)
- `textSec`: `#3A5246` (medium green)
- `textMut`: `#7BA090` (muted sage)
- `accent`: `#2D6E52` (primary green)
- `accentDk`: `var(--sage)` -> `#5C7A6A` light / `#5C7A65` dark
- `teal`: `#2E7B88`
- `border`: `#CFDBD5`
- `borderMd`: `#BFD0CA`
- Rating colours (again/hard/good/easy) with separate bg tokens
- `warning`: `#B87A30` / `warningBg`: `#FDF0DC` / `warningText`: `#5C3A00`

CSS also defines dark mode overrides via `@media (prefers-color-scheme: dark)`.

## 5. Data Shape

**FSRS scheduling state** is stored on the `Flashcard` entity:
- `stability` - FSRS stability (days to 90% retention)
- `difficulty` - FSRS difficulty (1-10)
- `interval` - current interval in days
- `nextReview` - YYYY-MM-DD string
- `lastReview` - YYYY-MM-DD string
- `reviewCount` - total reviews
- `lapses` - Again count
- `ratingHistory` - last 50 `{date, rating}` entries (used for calibration scoring)

No separate scheduling entity. All scheduling state lives on the Flashcard entity.

**Settings** are stored in localStorage only (not synced to User entity in Base44
in this implementation). The `User.jsonc` schema documents intended server-side
fields, but the app reads/writes `localStorage` via the `settingsGet`/`settingsSet`
helpers.
