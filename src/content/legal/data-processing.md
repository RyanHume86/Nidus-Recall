# Data Processing

**Nidus Recall — Plain Language Data Summary** · Version 1.1 · Effective 2 May 2026

This document explains, in plain language, what data Nidus Recall stores, where it is kept, how it is protected, and what you can do with it. For the full legal statement, see the [Privacy Policy](/privacy).

---

## What data does Nidus Recall store?

| Data | Where stored | Who can see it |
|------|-------------|----------------|
| Your flashcards and decks | Base44 database (US, AWS) | You only |
| Session statistics (reviewed, failed, new) | Base44 database (US, AWS) | You only |
| Scheduling state (stability, difficulty, interval) | Base44 database (US, AWS) | You only |
| AI edit history (when AI feature used) | Base44 database (US, AWS) | You only |
| Notion integration token (if connected) | Base44 database (US, AWS) | You only |
| Your name (optional) | Your browser only (localStorage) | You only |
| Your study preferences | Your browser only (localStorage) | You only |
| Your email address | Base44 authentication service | You and administrators |
| Agreement acceptance date | Base44 database (US, AWS) | You and administrators |

---

## How is data protected?

### Encryption

- **In transit:** All data travelling between your browser and our servers is encrypted using **HTTPS with TLS 1.2 or higher**. Authentication tokens are sent in request headers, not in URLs.
- **At rest:** Data is stored on **Amazon Web Services (AWS)** infrastructure, which applies **AES-256 encryption at rest** to all storage by default. AWS holds ISO 27001, SOC 2 Type II, and ISO 27017/27018 certifications for cloud security and privacy.

### Row-Level Security

Every user record (flashcard, deck, session log, scheduling state) is protected by **Row-Level Security (RLS)** enforced at the database layer by Base44:

- The server tags every record with the creating user's email address.
- All read, update, and delete operations are blocked unless the request comes from the same user (or an administrator).
- This is enforced **server-side**, independently of the application code. A tampered browser request cannot bypass it.

### Authentication

Nidus Recall uses **OAuth 2.0 / JWT token authentication** managed by Base44:

- You log in via Base44's secure login page. Nidus Recall never handles or stores your password.
- A short-lived access token is issued on successful login.
- The token is removed from the browser URL immediately after load, so it does not appear in your browser history or in referrer headers sent to other sites.
- Every server-side write operation (saving cards, logging sessions) requires a valid token; unauthenticated requests are rejected before any data is accessed.

### Sensitive credentials

If you connect a Notion workspace, your **Notion integration token** is stored server-side in your encrypted user profile, protected by Row-Level Security. It is never:

- Stored in your browser after the initial setup.
- Included in your data export.
- Logged or transmitted outside of the direct Notion API call.

You can revoke the token at any time via **Settings → Import & Export → Disconnect Notion**.

---

## How long is data kept?

| Data | Retained until |
|------|---------------|
| Flashcards, decks, session logs | You delete them, or your account is deleted |
| Soft-deleted cards (deleted in-app) | Permanently purged after 30 days |
| Notion integration token | You disconnect Notion, or your account is deleted |
| Your account record | Up to 30 days after account deletion request |
| Backup copies | Up to 30 days after account deletion request |
| Browser localStorage | Until you clear your browser storage or delete your account |

---

## Who has access?

| Who | Access level | Why |
|-----|-------------|-----|
| You | Full read and write via the app | You own your data |
| Nidus Recall administrators | Read-only for support and technical maintenance | To diagnose faults you report |
| Base44 infrastructure | Automated processing for storage, indexing, and delivery | To operate the service |
| AWS | Physical and logical infrastructure only | Base44's hosting provider |
| No third parties | None | Unless you enable optional integrations (Notion, AI) |

Administrators cannot access your flashcard content in normal operation. Administrative access is logged and used only to investigate reported technical faults.

---

## Sub-processors

| Sub-processor | Role | Location | Transfer mechanism |
|--------------|------|----------|--------------------|
| **Base44** | Application backend, database, auth, serverless functions | United States (AWS) | Standard Contractual Clauses |
| **Amazon Web Services** | Cloud infrastructure (Base44's provider) | United States | AWS Data Processing Addendum |
| **Anthropic** (optional) | AI card editing — opt-in only, card text only | United States | Standard Contractual Clauses |

Data stored in the United States is transferred from South Africa under **Standard Contractual Clauses**, as permitted by POPIA Section 72 and GDPR Article 46(2)(c).

---

## Can I get a copy of my data?

Yes. Go to **Settings → Privacy → Export my data**. You will receive a full JSON file containing all your decks, flashcards, and session logs. This is your right under POPIA Section 23 and GDPR Article 15.

The export does not include your Notion integration token (it is a sensitive credential, not your content).

---

## Can I delete my data?

Yes. Go to **Settings → Privacy → Delete my account**. This will:

1. Immediately delete all your flashcards, decks, session logs, and scheduling data from the application.
2. Log you out.
3. Fully remove your account record within **30 days**.

This is your right under POPIA Section 24 and GDPR Article 17 ("right to be forgotten").

---

## What about AI features?

The AI card-editing feature (when you click "Suggest edit" on a specific card) sends **only the card's front text and back text** to Anthropic's API via a Base44 serverless function. The following safeguards apply:

- No personally identifiable information is included.
- The feature is **opt-in** and triggered per card only.
- Citation generation is blocked by the system before any call is made to the language model.
- For cards in clinical decks, the model is instructed to be conservative and avoid factual changes.
- Each AI edit is recorded in an immutable audit log with the model identifier and version number, accessible to you through your data export.

---

## What about Notion and Excel integrations?

- **Notion:** Your integration token is stored server-side. Card content is synced directly between your Notion database and Nidus Recall. Notion Inc. processes your data under their own privacy policy; you can review it at notion.so/privacy.
- **Excel / CSV:** Files are processed entirely in your browser. No file content is transmitted to our servers; you import and export directly from your local machine.
- **Anki:** Package files are parsed in your browser using a WebAssembly module. No file content is transmitted to our servers.

---

## Data breach notification

If a security incident affects your personal data, we will:

- Notify the **Information Regulator (South Africa)** within **72 hours** of becoming aware, where required by POPIA Section 22.
- Notify you **without undue delay** if the breach is likely to result in high risk to your rights.
- Publish a brief notice in the app for all affected users.

---

*Last updated: 2 May 2026*
