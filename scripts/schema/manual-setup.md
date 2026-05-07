# Manual entity registration — Base44 dashboard

**Finding: DASHBOARD_ONLY**

The Base44 SDK (`createEntityHandler`) and REST API expose no entity-creation
endpoint. Entities must be registered through the Base44 dashboard at
<https://app.base44.com>.

After completing the steps below, run `npm run schema:apply-rls` to apply
Row-Level Security rules to the newly registered entities.

---

## Pre-flight

1. Open <https://app.base44.com> and sign in.
2. Select app **`69eb23a1d22acead8735ff3c`** (Nidus Recall).
3. Navigate to **Data → Entities** (or **Schema**).

---

## Entity 1 — CardState

FSRS scheduling state for one card (or one cloze deletion).
One record per (card, clozeIndex) pair.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `cardClientId` | String | **yes** | — | FK → Flashcard.clientId. Mark as indexed. |
| `stability` | Number | no | null | FSRS S parameter. Nullable. |
| `difficulty` | Number | no | null | FSRS D parameter. Nullable. |
| `interval` | Number | no | `1` | Review interval in days. |
| `nextReview` | String | no | null | YYYY-MM-DD. Nullable. |
| `lastReview` | String | no | null | YYYY-MM-DD. Nullable. |
| `reviewCount` | Number | no | `0` | Total completed reviews. |
| `lapses` | Number | no | `0` | Times rated Again. |
| `ratingHistory` | Array | no | `[]` | Array of `{date: string, rating: "again"\|"hard"\|"good"\|"easy"}`. Max 50 items. |
| `suspended` | Boolean | no | `false` | Excluded from all queues when true. |
| `buriedUntil` | String | no | null | YYYY-MM-DD. Nullable. |
| `migrated` | Boolean | no | `false` | Set by migration script. |
| `clozeIndex` | Number | no | null | Cloze deletion index. Null for basic cards. |
| `sourceCardClientId` | String | no | null | Parent note clientId for generated cards. Nullable. |

**Dashboard steps:**

1. Click **+ New Entity**, enter name: `CardState`.
2. Add each field from the table above with the specified type, required flag, and default.
3. On `cardClientId`: enable the **Indexed** toggle so `list()` lookups by `cardClientId` are fast.
4. Save the entity.

---

## Entity 2 — CardHistory

Immutable audit log entry created whenever AI modifies a card.
Allows viewing and reverting to any prior version.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `card_id` | String | **yes** | — | FK → Flashcard.clientId. |
| `version` | Number | **yes** | — | Sequential version number starting at 1. |
| `content_snapshot` | Object | no | null | `{ front, back, elaboration, source, tags }`. |
| `modified_by` | String | no | null | Enum: `"user"` or `"ai"`. |
| `modified_at` | String | no | null | ISO 8601 timestamp. |
| `ai_model_used` | String | no | null | Model identifier for AI edits. Nullable. |

**Dashboard steps:**

1. Click **+ New Entity**, enter name: `CardHistory`.
2. Add each field from the table above with the specified type and required flag.
3. Save the entity.

---

## Entity 3 — UserSchedulerParams

Single-record table (one row per user) storing fitted FSRS parameters.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `params` | Array | no | null | Array of 19 Numbers (FSRS parameter vector). |
| `lastFitDate` | String | no | null | ISO date YYYY-MM-DD. Nullable. |
| `reviewCountAtFit` | Number | no | `0` | Review count at time of last fit. |
| `fitVersion` | String | no | null | Fitting algorithm version string. Nullable. |

**Dashboard steps:**

1. Click **+ New Entity**, enter name: `UserSchedulerParams`.
2. Add each field from the table above.
3. Save the entity.

---

## After registration

Once all three entities appear in the **Entities** list:

```sh
BASE44_TOKEN=<token> BASE44_APP_URL=<https://your-app.base44.app> \
  npm run schema:apply-rls
```

This applies the owner-scoped RLS rules (create: authenticated user; read/update/delete:
owner or admin) to **all six** entities: Deck, Flashcard, SessionLog, CardState,
CardHistory, UserSchedulerParams.

---

## Verification

Run the anonymous-record audit to confirm the entities now respond with 200 (not 404):

```sh
BASE44_TOKEN=<token> BASE44_APP_URL=<https://your-app.base44.app> \
  npm run audit:anonymous
```

Expected: all six entities show `0` in the `created_by="anonymous"` column
(no `NOT_REGISTERED`).

Alternatively, trigger the `Anonymous record audit` workflow from the **Actions**
tab in GitHub.
