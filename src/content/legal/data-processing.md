# Data Processing

**Nidus Recall — Plain Language Data Summary**

---

## What data does Nidus Recall store?

| Data | Where stored | Who can see it |
|------|-------------|----------------|
| Your flashcards and decks | Base44 database (US) | You only |
| Session statistics (reviewed, failed, new) | Base44 database (US) | You only |
| FSRS scheduling state (stability, interval) | Base44 database (US) | You only |
| Your name (optional) | Your browser only (localStorage) | You only |
| Your email | Base44 auth service | You only |
| Agreement acceptance date | Base44 database (US) | You only |

All records are protected by **Row-Level Security** — the system enforces that each record can only be read or modified by the account that created it. No other user can access your data.

---

## How long is data kept?

Your data is kept until you delete it or request account deletion. After an account deletion request:

- Application records are deleted within **48 hours**.
- Backup copies are purged within **30 days**.

---

## Who has access?

- **You** — full read/write via the app.
- **Nidus Recall administrators** — read access for support and technical maintenance only.
- **Base44 infrastructure** — automated processing for storage, indexing, and delivery.
- **No third parties** unless you explicitly enable optional integrations (Notion, AI features).

---

## Can I get a copy of my data?

Yes. Go to **Settings → Privacy → Export my data**. You will receive a full JSON file containing all your decks, flashcards, and session logs.

---

## Can I delete my data?

Yes. Go to **Settings → Privacy → Delete my account**. This will:

1. Delete all your flashcards, decks, and session logs immediately.
2. Log you out of the application.
3. Your account record will be fully removed within 30 days.

---

## What about AI features?

The AI card-editing feature sends the selected card's front/back text to Anthropic's API for processing. No personally identifiable information is included. This feature is opt-in and only triggered when you click "Suggest edit" on a specific card.

---

*Last updated: 1 May 2026*
