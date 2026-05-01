# Nidus Recall: Build Plan (continued)

This file picks up from Prompt 1.4. For Phases 0 to 1.3, see the previous build plan document.

App ID: `69eb23a1d22acead8735ff3c`
Repo: assumed as the working directory of the Claude Code session.
Default branch: `main`.

## How to use this plan

1. Run prompts in numeric order through Phase 5.
2. After every phase, run **Prompt R.1** (streamlining audit).
3. Phase 6 prompts are post-launch and can run in parallel.
4. Run all of Phase 7 once before public ship and again after any high-impact change.
5. Run **Prompt R.2** (architectural review) once per quarter.

---

## PHASE 1: Tier 0 ship blockers (continued)

### Prompt 1.4: Migrate orphaned anonymous records

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. Admin ryanhumepersonal@gmail.com (id 69eb23a2d22acead8735ff3e), user drryanhume@gmail.com (id 69efc04ba3925756940e529e). No secrets. PR link + summary.

Task: assign existing anonymous-owned records to the correct owner before RLS hard-enforces.

Steps:
1. Branch: chore/p1-orphan-migration.
2. Create scripts/migrations/2026-05-assign-anonymous.ts that:
   a. Counts records with created_by="anonymous" across Deck, Flashcard, SessionLog.
   b. Aborts with exit 0 if zero records (idempotency).
   c. Updates all to created_by="ryanhumepersonal@gmail.com".
   d. Logs before and after counts.
3. Add npm script "migrate:assign-anonymous".
4. Run the script against the live app. Capture log output.
5. Verify in Base44 console that zero anonymous records remain.
6. Document in MIGRATIONS.md (create if missing): date, purpose, command run, result.
7. Commit: "chore(data): migrate anonymous records to admin owner".
8. Push, PR, auto-merge, cleanup.
9. Output: PR link, migration log, MIGRATIONS.md entry.
````

### Prompt 1.5: Card count drift fix

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: Deck.card_count is stored but not maintained ("Happy" deck had count 2 with 3 actual cards). Fix.

Steps:
1. Branch: fix/p1-card-count.
2. Choose option A unless there is a measurable read-perf reason for B:
   A. Remove Deck.card_count. Compute on read by counting Flashcards where deckId matches and status="Active". Memoise per deck per session.
   B. Keep card_count and add a centralised Flashcard mutation wrapper that increments/decrements atomically. One-time reconciliation.
3. If A: update schema, update read sites to use count query, remove all writes to card_count.
4. If B: add wrapper, run reconciliation script.
5. Tests: create deck, add and delete cards, assert displayed count tracks reality.
6. Commit: "fix(deck): compute card count on read, remove stale stored value" (or B equivalent).
7. Push, PR, auto-merge, cleanup.
8. Output: PR link, A vs B decision rationale, reconciliation result if B.
````

### Prompt 1.6: FSRS end-to-end validation

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: confirm FSRS actually works. Every card currently has stability/difficulty/nextReview null, meaning the engine has never run successfully end to end.

Steps:
1. Branch: fix/p1-fsrs-e2e.
2. Locate the rating handler and FSRS implementation. If not using a maintained library, replace with ts-fsrs (npm: ts-fsrs).
3. Verify the handler:
   a. Calls FSRS with current stability, difficulty, last review date, and the new rating.
   b. Persists returned stability, difficulty, nextReview to the Flashcard record.
   c. Appends to ratingHistory (does not overwrite).
   d. Increments reviewCount.
   e. Increments lapses only on "again".
   f. Sets lastReview to today (YYYY-MM-DD).
4. Write integration test src/lib/srs/__tests__/fsrs.integration.test.ts:
   - Create card.
   - Rate "again": assert lapses=1, stability decreased.
   - Rate "good": assert stability increased.
   - Rate "easy" twice more: assert nextReview pushes further out.
   - Assert ratingHistory has four entries with correct date/rating.
5. Run on a real deck. Confirm in Base44 console that fields populate.
6. Commits: ts-fsrs adoption, handler fix, tests.
7. Push, PR, auto-merge, cleanup.
8. Output: PR link, test output, sample card record showing populated FSRS fields.
````

### Prompt 1.7: Default route fix

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: app currently opens into a deck's Add Card panel. Change to Library root.

Steps:
1. Branch: feat/p1-default-route.
2. Set default authenticated route to /library.
3. Library root must show: deck list, "+ New deck" button, search box. Empty state with "Create your first deck" CTA when zero decks.
4. Add a "Recent" section above the deck list showing the last three decks worked on (Base44 query Deck sorted by -updated_date, limit 3).
5. Remove any auto-resume logic that lands the user inside a specific deck on app open.
6. Tests: route renders Library on root, deck list populates, empty state shows when no decks.
7. Commit: "feat(routing): land at Library root on app open".
8. Push, PR, auto-merge, cleanup.
9. Output: PR link, screenshots of empty and populated Library.
````

### Prompt 1.8: POPIA compliance surface

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. SA clinical app context: HPCSA references where relevant; SA English. No secrets. PR link + summary.

Task: build the POPIA-required surface. Mandatory before public ship.

Steps:
1. Branch: feat/p1-popia.
2. Pages /privacy, /terms, /data-processing. Place content in /src/content/legal as MDX or markdown rendered via react-markdown. Plain SA English. Reference HPCSA where relevant. Cover:
   /privacy: data collection, processing purpose, storage, retention, third-party processors (Base44, Anthropic if AI ships, analytics), POPIA Section 23 to 25 rights, Information Regulator complaint procedure.
   /terms: acceptable use, content ownership, prohibited content (no PII), educational tool disclaimer, liability limit.
   /data-processing: plain language: where stored, how long, who can access.
3. Settings > Privacy section linking all three plus:
   "Export my data" button: downloads JSON of decks, cards, session logs. Server endpoint /api/me/export.
   "Delete my account" button with two-step confirmation. Endpoint /api/me/delete cascades all owned records and the User record. Document a 30-day SLA.
4. Sign-up flow: insert checkbox "I have read and agree to the Privacy Policy and Terms of Use." Block account creation without it. Persist agreement_accepted_at on User.
5. Add User schema fields: agreement_accepted_at (datetime optional), agreement_version (string optional default "v1.0").
6. Tests: legal pages render, export endpoint returns valid JSON, delete endpoint requires confirmation token, sign-up blocks without checkbox.
7. Commits: schema, legal content, settings UI, sign-up gate, endpoints, tests.
8. Push, PR, auto-merge, cleanup.
9. Output: PR link, deployed legal page links once merged.
````

---

## PHASE 2: Schema upgrades (run before Phase 3 UI work)

### Prompt 2.1: Image entity for occlusion cards

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: add an Image entity so occlusion cards can work at scale.

Steps:
1. Branch: feat/p2-image-entity.
2. Create Base44 Image entity:
   - ownerId (string required, equals authenticated user email)
   - url (string required)
   - mimeType (string required, enum image/png, image/jpeg, image/webp)
   - width, height (numbers required)
   - altText (string optional)
   - occlusionRegions (array of {id, x, y, width, height, label})
   - linkedCardIds (array of strings)
   RLS: same pattern as Flashcard.
3. Add Flashcard.imageId (string optional). Occlusion cards must reference an imageId.
4. Build src/components/cards/ImageUpload.tsx:
   - Drag and drop, max 5MB.
   - Auto-compress to 1920px max dimension client-side via canvas.
   - Preview with region-drawing UI.
   - Persist regions on save.
5. Wire Occlusion type into Add Card form to require an Image.
6. Tests: upload flow, region drawing, region persistence, occlusion review reveals regions in order.
7. Commits: schema, upload component, occlusion review wiring, tests.
8. Push, PR, auto-merge, cleanup.
9. Output: PR link, sample uploaded image record.
````

### Prompt 2.2: Tags on Flashcard

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: persist tags. UI shows a tag input but the schema has no tags field, meaning entries may be silently dropped.

Steps:
1. Branch: feat/p2-tags.
2. Add Flashcard.tags (array of strings, max 10, lowercase, alphanumeric and hyphens only).
3. Client normalisation: lowercase, replace whitespace with hyphens, strip other punctuation.
4. Build TagInput with autocomplete sourced from the user's existing tags across all decks. Debounce 200ms. Top 8 suggestions.
5. Library filter: multi-select tag filter on deck list and per-deck card list.
6. Migration: ensure existing cards have tags=[] (verify Base44 default behaviour).
7. Tests: enter mixed-case tag with spaces, assert normalised, assert persists, assert filter works.
8. Commits: schema, normalisation utility, TagInput, filter, tests.
9. Push, PR, auto-merge, cleanup.
10. Output: PR link, tag schema confirmation.
````

### Prompt 2.3: Expand SessionLog with rating breakdown

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: enrich SessionLog so progress dashboards have data to compute.

Steps:
1. Branch: feat/p2-session-fields.
2. Add SessionLog fields: again_count, hard_count, good_count, easy_count, mature_reviewed, young_reviewed, total_session_seconds, median_card_seconds (optional), contentType_breakdown (object: Factual, Mechanism, "Clinical Reasoning", Anatomy, Pathology), focus_declared (boolean optional), system_note (string optional).
3. Stop writing system flags into frictionNote. Move "[Intensity: X.X]" and "[Focused: yes/no]" into intensity_score (existing) and focus_declared and system_note.
4. Update session-end persistence in src/lib/study/session.ts (or wherever it lives) to populate all new fields.
5. Migration scripts/migrations/2026-05-session-fields.ts: parse existing frictionNote, extract intensity and focus, write to new fields, clean frictionNote to user-only content (empty string if just system flags).
6. Tests: end a session, assert all new fields populate, frictionNote contains only user content.
7. Commits: schema, session-end logic, migration, tests.
8. Push, PR, auto-merge, cleanup.
9. Output: PR link, sample SessionLog before/after migration.
````

### Prompt 2.4: Clinical accuracy fields on Flashcard

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. SA clinical context. No secrets. PR link + summary.

Task: clinical content needs versioning and review tracking.

Steps:
1. Branch: feat/p2-clinical-accuracy.
2. Add Flashcard fields: clinical_review_status (enum draft/verified/needs_review, default draft), last_reviewed_for_accuracy (YYYY-MM-DD optional), last_reviewed_by (email optional), guideline_version (string optional max 200).
3. Card edit UI: collapsible "Clinical accuracy" section exposing all four.
4. Review mode: when last_reviewed_for_accuracy is older than 365 days, show small flag "Last accuracy review: [date]". Do not block.
5. Tests: set verified status, mock date, assert flag appears at 365+ days.
6. Commits: schema, edit UI, review-mode flag, tests.
7. Push, PR, auto-merge, cleanup.
8. Output: PR link.
````

### Prompt 2.5: Migrate prerequisite_card_id to entity ID

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: prerequisite_card_id stores clientId (fragile). Migrate to entity id references.

Steps:
1. Branch: feat/p2-prereq-entity-id.
2. Add Flashcard.prerequisite_id (string optional, references Flashcard.id).
3. Migration: for every Flashcard with prerequisite_card_id set, look up the matching clientId card and write its entity id into prerequisite_id. Log orphans.
4. Update scheduler to read prerequisite_id, not prerequisite_card_id.
5. Mark prerequisite_card_id deprecated in schema descriptions. Stop all writes.
6. Add a removal calendar entry: 30 days from merge, run a follow-up to drop prerequisite_card_id entirely.
7. Tests: card with prerequisite chain, assert scheduler honours stability >= 7 gating via the new field.
8. Commits: schema, migration, scheduler update, tests.
9. Push, PR, auto-merge, cleanup.
10. Output: PR link, orphan count.
````

### Prompt 2.6: Raise card text limits

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: front 500 chars and back 1000 chars are too tight for clinical case stems.

Steps:
1. Branch: feat/p2-text-limits.
2. Update schema: front max 1500, back max 3000, elaboration max 5000, anchor max 600.
3. Update UI counters to match new limits.
4. Counter colour states: default <80%, yellow 80 to 94%, red >=95%.
5. Audit script: list cards within 5% of the old limit (potentially awkward truncations). Output to stdout for manual review.
6. Tests: counter colour transitions, save accepts up to new max, rejects beyond.
7. Commits: schema, counters, audit script, tests.
8. Push, PR, auto-merge, cleanup.
9. Output: PR link, audit list of borderline cards.
````

---

## PHASE 3: Tier 1 UI fixes

### Prompt 3.1: Library deck view layout

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: restructure the deck detail view. Current layout wastes ~40% horizontal space.

Steps:
1. Branch: feat/p3-deck-view-layout.
2. Two-column layout on desktop:
   Left 60%: card list. Each row shows front truncated 80 chars, contentType badge, stakes_flag star, last review date, next review date, status. Click row to open edit in right column. Sort dropdown: Recent, Front A-Z, Next due, Most lapsed. Filter by tag, contentType, status. Top of list: "+ Add card" button.
   Right 40%: Add or Edit form. Collapsed by default. Sticky submit at the bottom.
3. Mobile (<768px): single column. Card list default. "+ Add card" as FAB. Form opens as full-screen modal.
4. Tests: layout snapshot at 1440px, 1024px, 768px, 375px. Click row, edit, save, assert list updates.
5. Commits: layout shell, card list, sort/filter, edit-in-drawer.
6. Push, PR, auto-merge, cleanup.
7. Output: PR link, screenshots at three breakpoints.
````

### Prompt 3.2: Breadcrumbs

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: add a breadcrumb component to every authenticated page.

Steps:
1. Branch: feat/p3-breadcrumbs.
2. src/components/layout/Breadcrumbs.tsx using semantic <nav aria-label="Breadcrumb"><ol>.
3. Patterns: Library > [Deck] > Add card; Library > [Deck] > Edit: [front 30 chars]; Study > [Session in progress]; Progress; Settings > Privacy.
4. Place below the top app bar. Each segment except last is a link. Match existing palette.
5. Tests: render at five distinct routes, assert correct trail.
6. Commit: "feat(nav): add breadcrumbs across authenticated pages".
7. Push, PR, auto-merge, cleanup.
8. Output: PR link.
````

### Prompt 3.3: Icon labels and tooltips

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: every icon-only button must have aria-label and a hover tooltip.

Steps:
1. Branch: feat/p3-icon-a11y.
2. Audit /src for icon-only buttons. Specifically:
   - Green leaf in FRONT field: identify purpose. If AI-suggest, label "Generate suggestion with AI". If no purpose, remove.
   - Quick add lightning: label "Quick add a card with minimal fields".
   - "..." overflow: label "Deck actions" with menu Rename/Archive/Export/Share/Delete.
   - Back chevron: label "Back to Library".
3. Build Tooltip primitive (or use Radix Tooltip if installed). 300ms delay. Keyboard accessible.
4. Add aria-labels everywhere even when a tooltip is present.
5. Tests: jest-axe snapshot every icon button has accessible name.
6. Commits: tooltip primitive, icon audit fixes, tests.
7. Push, PR, auto-merge, cleanup.
8. Output: PR link, axe report before/after.
````

### Prompt 3.4: Surface contentType taxonomy

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: replace hidden dropdown with visible chip selector for contentType.

Steps:
1. Branch: feat/p3-content-type-chips.
2. Horizontal chip selector: Factual, Mechanism, Clinical Reasoning, Anatomy, Pathology. Tooltip per chip:
   - Factual: discrete facts, definitions, values, drug doses.
   - Mechanism: how does it work? Pathways, signalling, physiology.
   - Clinical Reasoning: when do you do what? Decision points, differential thinking.
   - Anatomy: structural relationships, surface markings, imaging.
   - Pathology: disease processes, presentations, diagnostics.
3. Persist last selection per session in localStorage key "nidus.lastContentType". Default new cards to that value.
4. Tests: select Mechanism, save card, open new card form, assert Mechanism preselected.
5. Commit: "feat(cards): visible contentType chip selector with sticky last selection".
6. Push, PR, auto-merge, cleanup.
7. Output: PR link.
````

### Prompt 3.5: Search

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: global and per-deck search.

Steps:
1. Branch: feat/p3-search.
2. Global search: sidebar trigger plus "/" shortcut. Modal with input. Tabs All/Decks/Cards. Result rows link to deck or card edit. Debounce 200ms. Limit 50 per scope. Search fields: deck title, card front/back/elaboration/anchor/source.
3. Per-deck search above the card list. Same input, scoped. Combine with existing tag/contentType/status filters.
4. Tests: type query, assert correct rows, click result, assert navigation.
5. Commits: global search modal, per-deck search, keyboard shortcut.
6. Push, PR, auto-merge, cleanup.
7. Output: PR link.
````

### Prompt 3.6: Empty states, skeletons, error states

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: every list and async load needs designed empty, loading, and error states.

Steps:
1. Branch: feat/p3-states.
2. Empty: Library no decks (hero CTA), Deck no cards (CTA), Study no due (count of next due hours, CTA), Progress no history, tag autocomplete no matches.
3. Loading: skeleton blocks for deck rows, card rows, progress charts. No spinners under 200ms; skeletons only above.
4. Error: failed query inline alert with Retry; failed save preserves draft locally and offers Retry.
5. Tests: render each state, snapshot.
6. Commits per state type.
7. Push, PR, auto-merge, cleanup.
8. Output: PR link, screenshot grid.
````

### Prompt 3.7: Review session controls

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: full Study session experience.

Steps:
1. Branch: feat/p3-study-session.
2. Pre-session selector: cards count (10/20/30/50/custom), time (5/10/15/30/no limit), deck scope (all due, specific deck, tag subset), Stakes-only toggle. Cards take precedence if both set.
3. In-session: spacebar reveals back; rating buttons Again(1)/Hard(2)/Good(3)/Easy(4) with shortcut hints; Undo (u); Edit card (side drawer, preserves position); Pause (saves session state, returns to Library); End session (skip to summary); progress "12/30" + elapsed time.
4. Mature mode: when card stability >= user.mature_card_threshold, show modified prompt "Apply this card to a recent case or scenario" alongside normal rating. Setting controlled.
5. Session summary: counts, retention %, optional friction note input, persist to SessionLog with all Phase 2.3 fields.
6. Tests: keyboard shortcuts, undo, pause/resume, mature-mode prompt at threshold.
7. Commits: pre-session, in-session controls, mature mode, summary.
8. Push, PR, auto-merge, cleanup.
9. Output: PR link, video or screenshot of full flow.
````

### Prompt 3.8: Mobile responsive audit

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: verify and fix mobile.

Steps:
1. Branch: fix/p3-mobile.
2. Viewports: 375px, 414px, 768px, 1024px. Pages: Library, Deck view, Add card, Study, Progress, Settings, all legal pages.
3. Verify: no horizontal scroll, touch targets >=44x44px, form fits, review session thumb-operable (rating buttons in bottom third), sidebar collapses to hamburger or bottom nav, modals fill screen, text legible without zoom.
4. Use Playwright or @vitest/browser for breakpoint tests if not already set up.
5. Output SCREEN_AUDIT.md with viewport-by-page table of pass/fail and fixes applied.
6. Commits per page or per viewport.
7. Push, PR, auto-merge, cleanup.
8. Output: PR link, SCREEN_AUDIT.md link.
````

---

## PHASE 4: Tier 2 polish

### Prompt 4.1: Stakes prioritisation logic and "Always covered" badge

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: clarify and implement the stakes_flag prioritisation.

Steps:
1. Branch: feat/p4-stakes.
2. Update toggle help text to: "High-stakes card. When a study session is shorter than 15 minutes, these cards surface first. They also count toward an 'Always covered' badge on Progress."
3. Implement scheduler change: when session length < 15 minutes (set in pre-session selector), promote stakes_flag=true cards to the front of the queue.
4. Add Progress stat "Always covered": percentage of stakes_flag=true cards reviewed in past 7 days. Green >=90, yellow 70 to 89, red <70.
5. Tests: 10-min session shows stakes-first ordering; 7-day stakes coverage computes correctly.
6. Commits: copy update, scheduler logic, Progress stat, tests.
7. Push, PR, auto-merge, cleanup.
8. Output: PR link.
````

### Prompt 4.2: Flat decks plus namespaced tag tree

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: keep decks flat. Use namespaced tags for hierarchy.

Steps:
1. Branch: feat/p4-tag-tree.
2. Tag convention: colon-namespacing e.g. "neuro:stroke:ischaemic".
3. Add Deck.default_tags (array of strings, max 10). Cards created in this deck auto-receive these tags on save.
4. Library tag tree component on left rail: parses all tags, builds a tree by colon levels, click a node to filter the deck list.
5. Tests: create deck with default_tags, add card, assert inheritance; tag tree renders correctly with three-level hierarchy.
6. Commits: schema (default_tags), inheritance logic, tag tree component, tests.
7. Push, PR, auto-merge, cleanup.
8. Output: PR link.
````

### Prompt 4.3: Deck archive and status

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: deck-level lifecycle.

Steps:
1. Branch: feat/p4-deck-status.
2. Add Deck fields: status (enum active/archived, default active), archived_at (ISO date optional).
3. Library default filter: active only. Toggle "Show archived". Archived decks read-only; review session skips them.
4. Restore: one click sets status active.
5. Delete: separate, destructive, two-step confirmation. Cascades to delete all cards in the deck.
6. Tests: archive deck, confirm hidden by default, restore, delete cascades.
7. Commits: schema, archive UI, restore, delete cascade, tests.
8. Push, PR, auto-merge, cleanup.
9. Output: PR link.
````

### Prompt 4.4: Progress page

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: build /progress.

Steps:
1. Branch: feat/p4-progress.
2. Sections:
   a. 365-day heatmap. Hover shows date and counts.
   b. Headline stats row: reviews today, cards due today, current streak (consecutive days with >=1 review), 7-day retention % (good+easy / total).
   c. 30-day forecast bar chart (cards due per day).
   d. Maturity distribution stacked bar: new (reviewCount=0), learning (stability < 7), young (7 <= stability < 30), mature (stability >= 30).
   e. Content-type breakdown donut from past 30 days.
   f. Friction notes log: SessionLog frictionNote where non-empty, reverse chronological.
   g. Always-covered badge from Phase 4.1.
3. Pull from SessionLog and Flashcard. Cache aggregates 5 min.
4. Tests: each section renders with mocked data, with empty state when no sessions.
5. Commits: page shell, then one per section.
6. Push, PR, auto-merge, cleanup.
7. Output: PR link, screenshot of populated page.
````

### Prompt 4.5: Settings depth

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. SA context (default tz Africa/Johannesburg). No secrets. PR link + summary.

Task: build /settings.

Steps:
1. Branch: feat/p4-settings.
2. Sections:
   A. Profile: name, email read-only, role read-only.
   B. Schedule: sleep_bedtime, sleep_window_minutes, sleep_banner_enabled, mature_card_threshold, intensity_threshold, intensity_prompts_enabled, fatigue_alerts_enabled, attention_declaration_enabled, plus new User fields daily_new_card_limit (default 20) and daily_review_limit (default 200).
   C. Time zone: IANA dropdown. Default browser detection. Fallback Africa/Johannesburg.
   D. Algorithm: read-only FSRS params display. "Show advanced" toggle for editing request_retention (default 0.9) and maximum_interval (default 36500).
   E. Data: Export all (JSON), Import Anki .apkg (placeholder, defer to Phase 6.5), Import CSV.
   F. Privacy: links to /privacy, /terms, /data-processing, account deletion button.
   G. About: app version, last update timestamp, feedback link.
3. Add User schema fields: daily_new_card_limit, daily_review_limit.
4. Tests: change a setting, assert persists, assert respected by relevant logic (e.g. daily limits cap session pre-selector).
5. Commits per section.
6. Push, PR, auto-merge, cleanup.
7. Output: PR link.
````

### Prompt 4.6: Error handling and local draft persistence

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: handle network drops without losing user work.

Steps:
1. Branch: feat/p4-resilience.
2. Wrap every entity create/update in try/catch with exponential backoff (3 attempts).
3. On final failure persist payload to localStorage key nidus.draft.flashcard.<timestamp> (or analogous per entity).
4. On app load scan localStorage for drafts. Show non-blocking banner "You have unsaved work. [Restore] [Discard]".
5. After successful save of restored draft, clear the localStorage key.
6. Test: throttle network, attempt save, kill network, confirm draft persists, restore network, confirm restore prompt appears, restore, confirm save succeeds.
7. Commits: retry wrapper, draft persistence, restore banner, tests.
8. Push, PR, auto-merge, cleanup.
9. Output: PR link.
````

### Prompt 4.7: Browser support matrix

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: define and enforce browser support.

Steps:
1. Branch: chore/p4-browsers.
2. /docs/SUPPORT.md and /settings/about list:
   Supported: Chrome 110+, Edge 110+, Firefox 110+, Safari 16.4+ (macOS and iOS), Samsung Internet 21+.
   Not supported: IE, pre-2023 Safari.
3. Runtime check on app load. If below minimum, render non-dismissable banner: "Your browser may not display Nidus Recall correctly. Please use Chrome, Edge, Firefox, or Safari 16.4 or later." Do not hard-block.
4. Tests: mock UA strings, assert banner appears for unsupported.
5. Commits: doc, runtime check, tests.
6. Push, PR, auto-merge, cleanup.
7. Output: PR link.
````

---

## PHASE 5: PWA and offline

### Prompt 5.1: Manifest and service worker

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: convert app to PWA.

Steps:
1. Branch: feat/p5-pwa.
2. Install vite-plugin-pwa.
3. manifest.webmanifest:
   - name "Nidus Recall"
   - short_name "Nidus"
   - icons 192px and 512px (generate from existing logo)
   - start_url "/library"
   - display "standalone"
   - background_color "#FFFFFF"
   - theme_color "#2D6E52"
4. Service worker cache strategy:
   - App shell (HTML/JS/CSS): cache-first, update on new build.
   - API entity reads: stale-while-revalidate, max age 5 minutes.
   - Images: cache-first, 30-day expiry.
5. Install prompt after 3 logged sessions. Dismissable, remember 30 days.
6. Lighthouse PWA score >=90.
7. Tests: install prompt logic, cache strategies via mock fetch.
8. Commits: plugin install + manifest, service worker config, install prompt, tests.
9. Push, PR, auto-merge, cleanup.
10. Output: PR link, Lighthouse PWA report.
````

### Prompt 5.2: IndexedDB cache for offline review

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: full offline review via IndexedDB.

Steps:
1. Branch: feat/p5-offline.
2. Use idb library. On login sync user's decks, flashcards, past 30 days of session logs to IndexedDB.
3. Mirror writes: every entity write while online also writes to IndexedDB.
4. While offline:
   a. Library, deck view, review session work from IndexedDB.
   b. Writes (new cards, ratings) queue to a pending-writes queue.
   c. Show offline indicator in top bar.
5. On reconnect drain queue in order. Conflicts: server-wins for the same record with non-blocking notice if user data was overwritten.
6. Test: full plane-mode flow: add card offline, rate cards offline, reconnect, assert sync.
7. Commits: idb setup, sync on login, write mirroring, offline UI, queue + reconcile, tests.
8. Push, PR, auto-merge, cleanup.
9. Output: PR link, plane-mode test recording.
````

---

## PHASE 6: Differentiators (post-launch)

### Prompt 6.1: Claude API card generation from notes

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets in commits, ANTHROPIC_API_KEY only on server. PR link + summary.

Task: generate flashcards from pasted notes via Claude API. Single biggest moat over Anki.

Steps:
1. Branch: feat/p6-ai-generate.
2. Page /generate or modal from deck view: textarea max 10000 chars.
3. Server-side proxy /api/generate-cards (so the API key stays off the client). POST to https://api.anthropic.com/v1/messages with model "claude-sonnet-4-6" by default. System prompt:
   "You convert clinical study material into spaced-repetition flashcards. For each card produce: a front (a question that forces retrieval, not recognition), a back (concise answer, one idea), a contentType (Factual, Mechanism, Clinical Reasoning, Anatomy, Pathology), and optional tags. Avoid yes/no questions. Avoid cards that just rephrase the source. Output strict JSON: { cards: [...] }. No prose."
4. Render returned cards in editable table. User ticks/unticks, edits any field, bulk-saves to a deck.
5. Persist source = "Generated from notes [timestamp]".
6. Rate limit: 5 generation calls per user per day. Show remaining count.
7. Tests: mock API response, assert table renders editable, save persists with source.
8. Commits: server proxy, client UI, rate limit, tests.
9. Push, PR, auto-merge, cleanup.
10. Output: PR link.
````

### Prompt 6.2: PMID/DOI source resolver

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: resolve PMID and DOI in the Source field.

Steps:
1. Branch: feat/p6-source-resolver.
2. On Source field blur, regex-detect PMID (\b[0-9]{7,9}\b) or DOI (10\.\d{4,9}/[-._;()/:A-Z0-9]+ case-insensitive).
3. If detected call PubMed E-utilities for PMID, Crossref for DOI. Fetch authors, title, journal, year.
4. Store both: source_raw (original text) and source_citation (object: authors, title, journal, year, doi, pmid).
5. Display formatted citation under the field once resolved. User can clear and replace.
6. In review mode, "Show source" expands to formatted citation.
7. Tests: mock PubMed/Crossref, assert resolution and persistence.
8. Commits: schema additions, regex detect, API calls, UI, tests.
9. Push, PR, auto-merge, cleanup.
10. Output: PR link.
````

### Prompt 6.3: Surface anchor and connects_to

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: lift two underused schema features into the UI.

Steps:
1. Branch: feat/p6-knowledge-graph.
2. Anchor: move out of collapsed section. Top-level field on Add Card form below Back. Prompt: "What case, image, or moment will help you remember this?" In review mode, after rating display the anchor (if set) for 2 seconds before advancing.
3. connects_to: multi-select on edit form, search cards in same deck.
4. /graph view per deck using react-flow (or d3-force). Cards as nodes, connects_to as edges. Click node opens card. Power-user feature behind "Show graph" button.
5. Tests: anchor display in review, connects_to persists, graph renders with mocked deck.
6. Commits: anchor surfacing, connects_to UI, graph view, tests.
7. Push, PR, auto-merge, cleanup.
8. Output: PR link, graph screenshot.
````

### Prompt 6.4: Confidence rating

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: confidence rating separate from correctness.

Steps:
1. Branch: feat/p6-confidence.
2. After Again/Hard/Good/Easy, second prompt "How confident were you?" Low/Medium/High.
3. Persist to ratingHistory entries: { date, rating, confidence }. Update Flashcard schema accordingly.
4. Add User.confidence_step_enabled (boolean default true) so users can disable.
5. Progress: add "Calibration" stat: percent of high-confidence answers rated Good or Easy. Low scores = overconfidence.
6. Tests: rate with confidence, assert persistence, calibration computation.
7. Commits: schema, in-session prompt, settings toggle, calibration stat, tests.
8. Push, PR, auto-merge, cleanup.
9. Output: PR link.
````

### Prompt 6.5: Anki .apkg import

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: Anki .apkg import. Removes the single biggest switching cost.

Steps:
1. Branch: feat/p6-anki-import.
2. File picker accepts .apkg.
3. Server-side or client-side: unzip via JSZip, parse SQLite via sql.js, extract notes/decks/cards/media.
4. Field mapping: front, back, tags. Default contentType Factual, status Active.
5. Import images (write to Image entity). Audio out of scope v1; warn.
6. Hierarchy: Anki "biology::cells::membrane" becomes tag "biology:cells:membrane".
7. Preview before commit: "Import N cards into M decks. Skipped X due to unsupported types."
8. Rate limit: 1 per minute.
9. Tests: import sample.apkg, assert correct counts, tag namespacing, image upload.
10. Commits: dependencies, parser, mapper, preview UI, rate limit, tests.
11. Push, PR, auto-merge, cleanup.
12. Output: PR link, sample.apkg test result.
````

### Prompt 6.6: Read-only deck sharing

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. SA context (PII warning). No secrets. PR link + summary.

Task: read-only deck sharing.

Steps:
1. Branch: feat/p6-share.
2. Add Deck.shared_token (string optional, UUID v4).
3. Share action on deck overflow menu generates the token. Public route /shared/:token shows deck and cards read-only, no login. Banner "Read-only shared deck".
4. Owner can revoke from Deck > Share > Revoke.
5. Anonymous unique-visit count, surfaced in Share dialog.
6. Hard rule: PII warning at share time: "By sharing, you confirm no patient identifiable information is present."
7. Defer "Fork to my library" to a later PR.
8. Tests: generate token, visit anonymously, revoke, assert 404 after revoke.
9. Commits: schema, token gen, public route, revoke, visit count, warning, tests.
10. Push, PR, auto-merge, cleanup.
11. Output: PR link.
````

### Prompt 6.7: SA exam blueprint deck templates

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. SA context. No secrets. PR link + summary.

Task: distribution wedge for SA market.

Steps:
1. Branch: feat/p6-templates.
2. New Base44 entity DeckTemplate (mirror of Deck plus exam_code, blueprint_section, clinical_review_status fields).
3. /templates page surfaces curated templates by exam: HPCSA UG curriculum, College of Surgeons SA primaries (Anatomy, Physiology), College of Surgeons SA finals per specialty, College of Anaesthetists SA primaries and finals, DCH, DA, FCP, MMed cores.
4. "Add to my library" forks all cards into the user's library with status Active and clinical_review_status carried over.
5. Curate first three templates: pick highest-volume exams. Use authoritative sources. Mark all cards verified with real guideline_version.
6. Tests: fork template, assert correct deck and cards, tags include exam_code.
7. Commits: schema, /templates page, fork action, three curated template seeders, tests.
8. Push, PR, auto-merge, cleanup.
9. Output: PR link, list of three curated templates with citation sources.
````

---

## Code review for redundancy and duplication (run after every phase)

### Prompt R.1: Streamlining audit

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: code review pass. Find redundancies, duplicates, dead code, oversized modules, structural smells. Refactor without changing user-facing behaviour.

Steps:
1. git checkout main; git pull. Branch: chore/refactor-<phase>-streamline (e.g. chore/refactor-p3-streamline).
2. Run inventory and capture to REVIEW.md:
   - npx jscpd ./src --min-lines 5 --min-tokens 50 --reporters json (install if missing).
   - npx ts-prune (unused exports; install if missing).
   - npx depcheck (unused deps).
   - npx madge --circular ./src (circular deps).
   - npm run build, capture bundle stats, list five largest chunks and main contributors.
   - PowerShell: list top 20 largest .ts/.tsx/.js/.jsx source files by line count.
```powershell
     git ls-files | Where-Object { $_ -match '\.(tsx?|jsx?)$' } | ForEach-Object {
       $lines = (Get-Content $_ | Measure-Object -Line).Lines
       [PSCustomObject]@{ File = $_; Lines = $lines }
     } | Sort-Object Lines -Descending | Select-Object -First 20
```
3. From inventory, propose refactor plan in REVIEW.md with concrete targets:
   - Duplicated blocks above 5 lines: extract to /src/lib or /src/components/common.
   - Files above 300 lines: split by responsibility.
   - Components with >5 pieces of related state: lift to a custom hook.
   - Repeated Base44 query patterns: consolidate into /src/lib/api/<entity>.ts with typed wrappers.
   - Inline string literals used >3 times: extract to /src/lib/constants.
   - Type duplication: consolidate into /src/types.
   - Unused exports from ts-prune: delete or mark internal.
   - Unused deps from depcheck: uninstall.
   - Circular deps: break by dependency inversion or relocation.
4. Execute refactor in small commits. Each commit must:
   - Touch one logical refactor target.
   - Pass lint, typecheck, full test suite.
   - Be reverted if any user-facing test fails.
5. Hard rules:
   - No behaviour changes. If a refactor would change behaviour, stop and ask.
   - No new features in this branch.
   - No dependency upgrades except removal of unused.
   - Public API of every component and hook stays stable; rename only at module-internal boundaries.
6. After refactor, re-run the inventory and append a "Before/After" section to REVIEW.md.
7. Open PR titled "chore(refactor): streamline <phase>". Body lists every target addressed with line-count reductions and bundle delta.
8. CI must pass. Auto-merge.
9. Output: PR link, REVIEW.md link, summary table of (a) lines removed, (b) duplicates collapsed, (c) deps removed, (d) bundle delta.

Stop conditions:
- Refactor would require touching >20 files in one commit -> split.
- Test fails after a refactor and is not trivially restorable -> revert that commit, flag in PR.
- Bundle gets larger after streamlining -> flag and investigate before merging.
````

### Prompt R.2: Architectural review (quarterly)

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: deeper architectural review. Run quarterly or after a major feature wave.

Steps:
1. Branch: chore/arch-review-<YYYYMMDD>.
2. Produce ARCHITECTURE_REVIEW.md covering:
   - Layering: separation between UI components, hooks, business logic, API/data, types. Flag leaks.
   - State management: where state lives, local vs global, overuse of context, prop drilling, duplicated server state. Recommend (and apply) tanstack-query if Base44 reads are being manually cached.
   - Error boundaries: top-level plus per-route.
   - Performance: components re-rendering excessively (use why-did-you-render in dev). Missing memoisation, unstable refs.
   - Accessibility: full axe sweep. Append to A11Y_REPORT.md.
   - Security: no API keys client-side, no localStorage of auth tokens, CSP headers, source maps off in prod.
   - Test coverage: vitest --coverage. Target >=70% on /src/lib, >=50% overall. Fix lowest-covered critical path.
3. Implement the highest-leverage three improvements identified, separate commits.
4. Open PR with ARCHITECTURE_REVIEW.md plus the three implementations.
5. Auto-merge after CI.
6. Output: PR link, the three improvements, coverage delta.
````

---

## PHASE 7: Pre-ship verification

### Prompt 7.1: End-to-end smoke

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: full E2E smoke covering everything Phases 1 to 5 delivered.

Steps:
1. Branch: chore/p7-e2e.
2. If not installed: npm install -D @playwright/test; npx playwright install.
3. /tests/e2e scripts covering:
   1. Sign up with privacy/terms, land at Library, see onboarding deck.
   2. Create deck, add 5 cards (mix Basic/Cloze/Occlusion), tag them.
   3. Start 10-card session, rate each, confirm FSRS values updated.
   4. Pause and resume mid-session.
   5. Go offline (Playwright route block), add a card, return online, confirm sync.
   6. Import sample.apkg with 100 cards.
   7. Share a deck, open shared link in incognito context.
   8. Generate 5 cards from pasted note via Claude API (mock in CI).
   9. Progress page populates: heatmap, retention, forecast.
   10. Edit Settings, confirm persistence.
   11. Initiate account deletion, confirm second-step prompt, confirm purge within SLA.
4. Add CI step running E2E on PRs labelled "e2e".
5. PRODUCTION_READINESS.md with pass/fail per scenario and screenshots of failures.
6. Commits: Playwright setup, scenarios, CI integration, doc.
7. Push, PR, auto-merge.
8. Output: PR link, PRODUCTION_READINESS.md.
````

### Prompt 7.2: Accessibility audit

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: WCAG 2.1 AA pass.

Steps:
1. Branch: chore/p7-a11y.
2. axe-playwright sweep across every route.
3. Manual keyboard pass: tab through every page. Confirm focus ring visible, no traps, all controls reachable.
4. Contrast: body text 4.5:1, large text and icons 3:1.
5. No colour-only signals. stakes_flag must have a non-colour glyph.
6. A11Y_REPORT.md with violations and applied fixes.
7. Commits per category of fix.
8. Push, PR, auto-merge.
9. Output: PR link.
````

### Prompt 7.3: Security review

````
Full autonomy: files, PowerShell, deps, git, Base44 migrations. Three retries on failure.

Conventions: Windows + PowerShell. Conventional Commits. Branch -> work -> lint -> test -> commit chunks -> push -> PR -> CI -> squash-merge. Base44 app 69eb23a1d22acead8735ff3c. No secrets. PR link + summary.

Task: pre-launch security checklist.

Steps:
1. Branch: chore/p7-security.
2. Verify and document in SECURITY_REPORT.md:
   - RLS enforced on every entity. Cross-user reads in tests blocked.
   - CSP headers set; no unsafe-inline scripts.
   - No API keys in client bundle (grep build output).
   - Auth tokens in httpOnly secure cookies, not localStorage.
   - Account deletion fully cascades.
   - Rate limiting on AI generation, .apkg import, share token creation.
   - No console.log of user data in production builds (grep build output).
   - Source maps disabled in production build config.
   - npm audit clean, or known-and-accepted exceptions documented.
3. Fix findings in this branch unless they require a feature change (file an issue instead).
4. Commit, PR, auto-merge.
5. Output: PR link, SECURITY_REPORT.md, npm audit summary.
````
