# Migration: Deck Hierarchy (2026-04-26)

## Purpose

Converts flat deck names using the `::` separator convention (e.g. "Cardiology::Heart Failure")
into a proper parent/child hierarchy using the new `parentDeckId` field on the Deck entity.

## Safety Properties

- **Idempotent:** The migration skips any deck that already has a `parentDeckId` set, so it
  is safe to run multiple times. Re-running will produce no changes after the first successful
  execution.
- **Reversible:** `migrateDown` flattens the hierarchy back to `Parent::Child` names and sets
  `parentDeckId` to null on all child decks. Running migrateDown restores the pre-migration state
  exactly, except for any parent decks that were newly created (those will remain as empty decks).
- **Non-destructive:** No cards are modified. Only Deck entity metadata (title and parentDeckId)
  is updated.

## Rollback Procedure

1. Open a browser console in the Nidus Recall app.
2. Run:
   ```javascript
   import { migrateDown } from '/migrations/2026-04-26-deck-hierarchy.js'
   const result = await migrateDown(base44)
   console.log(result)
   ```
3. Verify the result shows the expected number of updated decks.
4. Any parent decks created during `migrateUp` that did not exist before will remain
   as empty decks. These can be manually deleted if desired.

## When to Run

Run `migrateUp` from the browser console after deploying the Deck entity schema change
(which added `parentDeckId`). The UI will display `::` names with indentation before
migration runs (visual fallback). After migration, the hierarchy is stored in `parentDeckId`
and the UI will use that for nested display.

## Deferred

Full hierarchical rendering in the deck list and study select dropdowns requires the parent/child
relationship to be loaded from the Deck entity. The visual fallback (indentation based on `::`
in deck names) is implemented immediately. Wiring the Deck entity parentDeckId into the render
tree is deferred to Session 4.
