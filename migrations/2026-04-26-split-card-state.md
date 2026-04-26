# Migration: Split Card and CardState (2026-04-26)

## Summary
Moves FSRS scheduling fields (stability, difficulty, interval, nextReview,
lastReview, reviewCount, lapses, ratingHistory) from the Flashcard entity
into a new CardState entity keyed on cardClientId.

## Motivation
Card content (front, back, tags, etc.) is shareable and version-controlled.
Scheduling state is per-user and must be writable without touching card content.
Separating them enables future multi-user decks and cleaner FSRS parameter fitting.

## Safety properties
- Idempotent: the migrated flag on CardState prevents duplicate records.
  Running migrateUp twice is a no-op for already-migrated cards.
- Reversible: migrateDown reads CardState and writes fields back to Flashcard.
  Run migrateDown before removing the scheduling fields from Flashcard schema.

## Application behaviour during migration
- The app reads CardState on load and merges it with Flashcard in memory.
- If CardState does not yet exist for a card (pre-migration), the app falls back
  to reading scheduling fields directly from Flashcard (backward compatibility shim).
- After migration completes, the shim is no longer needed but remains harmless.

## Rollback procedure
1. Run migrateDown(base44) from the browser console or a script.
2. Revert the code changes to storage.js and Home.jsx.
3. Delete CardState records if desired (not required for rollback correctness).
