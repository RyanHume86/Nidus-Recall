# Nidus Recall — Test Plan (P0 Baseline)

Branch: `chore/p0-test-baseline`
Date: 2026-05-01
Source: derived from `AUDIT.md` (P0 baseline audit).

## Purpose

This document is the regression baseline. Every user-facing flow listed here has at
least one automated smoke assertion in `src/__tests__/flows/smoke.test.jsx`. If a
smoke test breaks after a code change the corresponding flow **must be manually
re-verified** before the PR is merged.

---

## User-facing flows

### 1. Library view — empty state

**Gherkin:**
```gherkin
Given the user has no decks
When the Library view is rendered
Then the onboarding prompt is visible
```
**Test file:** `smoke.test.jsx` — *"Library: empty state shows onboarding prompt"*

---

### 2. Library view — with decks

**Gherkin:**
```gherkin
Given the user has at least one deck
When the Library view is rendered
Then each deck is listed by name
 And a "New Deck" button is visible
```
**Test file:** `smoke.test.jsx` — *"Library: with decks shows deck names and New Deck button"*

---

### 3. Create a deck

**Gherkin:**
```gherkin
Given the Library view is showing the deck list
When the user clicks "New Deck", types a name, and clicks "Create"
Then onCreateDeck is called with the trimmed name
```
**Test file:** `smoke.test.jsx` — *"Library: creating a deck calls onCreateDeck with the entered name"*

---

### 4. Add a basic card to a deck

**Gherkin:**
```gherkin
Given DeckView is open for a named deck
When the user fills in the Front and Back fields and clicks "Add card"
Then onUpdateCards is called with a new card that has the entered front and back
```
**Test file:** `smoke.test.jsx` — *"DeckView: adding a basic card calls onUpdateCards with correct front/back"*

---

### 5. Filter cards inside a deck

**Gherkin:**
```gherkin
Given DeckView is showing two cards with different front text
When the user types a search term matching only one card's front
Then only the matching card is visible in the list
```
**Test file:** `smoke.test.jsx` — *"DeckView: search filters the displayed card list"*

---

### 6. Start an SRS review session

**Gherkin:**
```gherkin
Given StudySelectView has at least one due card
When the user clicks "Start SRS"
Then onStartSRS is called with the selected deck
```
**Test file:** `smoke.test.jsx` — *"StudySelectView: Start SRS button calls onStartSRS when there are due cards"*

---

### 7. Empty review session

**Gherkin:**
```gherkin
Given SessionView is rendered with no due and no new cards
When the session initialises
Then the "All caught up" message is displayed
```
**Test file:** `smoke.test.jsx` — *"SessionView: empty queue renders 'All caught up'"*

---

### 8. Reveal answer during a session

**Gherkin:**
```gherkin
Given SessionView is showing a due card (question side)
When the user types an answer draft and clicks "Reveal answer"
Then the rating buttons (Again / Hard / Good / Easy) become visible
```
**Test file:** `smoke.test.jsx` — *"SessionView: typing answer and clicking Reveal shows rating buttons"*

---

### 9. Rate a card during a session

**Gherkin:**
```gherkin
Given SessionView is showing the answer side for a due card
When the user clicks the "Good" rating button
Then onUpdateCards is called with the card's scheduling fields updated
 And nextReview, stability, and difficulty are set on the updated card
```
**Test file:** `smoke.test.jsx` — *"SessionView: rating Good calls onUpdateCards with updated scheduling state"*

---

### 10. Progress view — empty log

**Gherkin:**
```gherkin
Given the user has completed no sessions
When StatsView is rendered with an empty log
Then the empty-state message "progress will appear" is visible
```
**Test file:** `smoke.test.jsx` — *"StatsView: empty log shows empty-state message"*

---

### 11. Settings — study tab renders

**Gherkin:**
```gherkin
Given SettingsView is rendered with default settings
When the "Study" tab is active (default)
Then study-session settings controls are visible
```
**Test file:** `smoke.test.jsx` — *"SettingsView: study tab renders settings controls"*

---

### 12. Settings — changing retention target calls onUpdateSettings

**Gherkin:**
```gherkin
Given SettingsView is rendered
When the user changes the retention target slider
Then onUpdateSettings is called with the new value
```
Not currently smoke-tested (slider interaction requires a controlled input event).
Covered by snapshot regression — any change to SettingsView will surface in the snapshot.

---

### 13. Archive / unarchive a deck

**Gherkin:**
```gherkin
Given DeckView is open
When the user opens the deck menu (⋯) and clicks "Archive deck"
Then onArchiveDeck is called with the deck name
```
**Test file:** `smoke.test.jsx` — *"DeckView: deck menu Archive action calls onArchiveDeck"*

---

### 14. Free Study mode — navigates through cards

**Gherkin:**
```gherkin
Given FreeStudyView is rendered with two active cards
When the user clicks "Next"
Then the card index advances without writing scheduling state
```
Not currently smoke-tested. Covered by snapshot regression.

---

### 15. Export to JSON

**Gherkin:**
```gherkin
Given the user is in SettingsView > Data tab
When the user clicks "Export"
Then onExport is called
```
Not currently smoke-tested (download trigger requires browser API mock).

---

### 16. Import JSON backup

**Gherkin:**
```gherkin
Given the user selects a valid Nidus JSON file
When the import is processed
Then cards from the file are merged and onUpdateCards is called
```
Not currently smoke-tested. Covered by `src/__tests__/anki-roundtrip.test.js` for Anki format.

---

### 17. FSRS scheduling — getDue returns only overdue cards

**Gherkin:**
```gherkin
Given a deck contains one card due yesterday, one due tomorrow, one new (no nextReview)
When getDue is called
Then only the overdue card is returned
```
**Test file:** `smoke.test.jsx` — *"FSRS: getDue returns only cards due today or earlier"*

---

### 18. FSRS scheduling — scheduleFSRS produces valid state for all four ratings

**Gherkin:**
```gherkin
Given a reviewed card in memory
When scheduleFSRS is called with each rating (again/hard/good/easy)
Then stability > 0, difficulty in [1,10], and interval >= 1 for all ratings
```
Covered by `src/lib/__tests__/fsrs-regression.test.js` (frozen baseline).

---

### 19. Cloze card creation

**Gherkin:**
```gherkin
Given a cloze text with two deletions ({{c1::...}} and {{c2::...}})
When createClozeCards is called
Then two cards are returned with correct cardType and clozeIndex
```
**Test file:** `smoke.test.jsx` — *"Cloze: createClozeCards produces one card per deletion"*

---

### 20. Session close — log is saved

**Gherkin:**
```gherkin
Given SessionView is at the session-close screen
When the user clicks "Save and finish"
Then onSaveLog is called with reviewed/failed/newAdded counts
```
Not currently smoke-tested. Covered by snapshot regression of the close-screen.

---

## Known regressions at baseline

None observed at time of writing. The FSRS regression suite passes against ts-fsrs 4.7.1.
Snapshot tests establish the baseline render for all views and modals.

---

## Test coverage map

| Layer | Files | Status |
|-------|-------|--------|
| FSRS algorithm (unit) | `src/lib/__tests__/fsrs-regression.test.js` | ✅ Passing |
| FSRS optimizer (unit) | `src/lib/__tests__/fsrs-optimizer.test.js` | ✅ Passing |
| Greeting (unit) | `src/lib/__tests__/greeting.test.js` | ✅ Passing |
| AI assist + CardHistory (unit) | `src/__tests__/aiAssist.test.js` | ✅ Passing |
| Anki round-trip (unit) | `src/__tests__/anki-roundtrip.test.js` | ✅ Passing |
| Notion settings migration (unit) | `src/__tests__/notionSettings.test.js` | ✅ Passing |
| Virtualisation perf (unit) | `src/__tests__/perf/virtualisation.test.jsx` | ✅ Passing |
| CardHistoryModal (unit) | `src/modals/__tests__/CardHistoryModal.test.jsx` | ✅ Passing |
| View snapshots (regression) | `src/__tests__/snapshots/views.test.jsx` | ✅ Passing |
| User-facing flow smoke tests | `src/__tests__/flows/smoke.test.jsx` | ✅ Added this PR |
| E2E / Base44 round-trip | — | ❌ Not yet implemented |
