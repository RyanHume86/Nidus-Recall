# Nidus Recall — Migration Log

This file records every data migration run against the live Base44 app (`69eb23a1d22acead8735ff3c`).
Entries are in reverse-chronological order.

---

## 2026-05-01 — Assign anonymous records to admin owner

**Purpose:** Before RLS rules hard-enforce user isolation, reassign all records
owned by the internal `"anonymous"` marker to the admin account so they remain
accessible.

**Command run:**
```
npm run migrate:assign-anonymous
# (or via Base44 MCP tools directly — see note below)
```

**Records found before migration:**

| Entity     | Anonymous count |
|------------|-----------------|
| Deck       | 1               |
| Flashcard  | 3               |
| SessionLog | 3               |
| **Total**  | **7**           |

All 7 records are test data created during development:
- Deck `69ef69e98a58dc6595135503` ("Happy" test deck)
- 3 Flashcards belonging to the "Happy" deck
- 3 SessionLogs from early test sessions

**Result / Known limitation:**

The `$set: { created_by: "..." }` update was accepted by the Base44 API (records'
`updated_date` changed), but the `created_by` field is a **system-immutable field**
that Base44 does not allow to be reassigned via the REST/MCP API. The field
remains `"anonymous"` on all 7 records.

**Practical impact: minimal.** The RLS rules applied in Prompt 1.3 include an
admin override on all read/update/delete operations:

```json
{ "$or": [{ "created_by": "{{user.email}}" }, { "user_condition": { "role": "admin" } }] }
```

The admin account (`ryanhumepersonal@gmail.com`, role `admin`) can therefore read,
update, and delete all 7 legacy anonymous records. Regular users cannot, but since
all 7 are test/development records (not real user content), this is the correct
outcome — they will be cleaned up as part of the ongoing `seed:onboarding` /
database hygiene process.

**Action for future new records:** All writes are now gated by `requireAuth()` in
`src/api/storage.js` (Prompt 1.3), so no new `created_by="anonymous"` records can
be created from the app.
