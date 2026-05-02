# Privacy Policy

**Nidus Recall** — Version 1.1 · Effective 2 May 2026

---

## Who We Are

Nidus Recall is a spaced-repetition learning tool designed for postgraduate learners in health professions. We are committed to handling your personal information responsibly, transparently, and in accordance with applicable data protection law — including the **Protection of Personal Information Act, 2013 (POPIA)** and, where applicable, the **General Data Protection Regulation (GDPR)**.

This Privacy Policy describes:

- what personal information we collect and why;
- how we store, protect, and share it;
- the security measures we apply;
- your rights as a data subject; and
- how to contact us or lodge a complaint.

---

## Minimum Age

Nidus Recall is intended for users aged 18 and over. We do not knowingly collect personal information from anyone under the age of 18. If you believe a person under 18 has provided us with personal information, please contact us at **privacy@nidusrecall.app** so we can delete it promptly.

---

## What Information We Collect

### Information you provide directly

- **Name** — your first name, which you may optionally provide for personalised greetings. Stored in your browser only (localStorage); not transmitted to our servers.
- **Flashcard content** — the questions, answers, notes, anchors, and tags you create. This content belongs to you.
- **Study sessions** — aggregated session statistics (number of cards reviewed, failed, and added per session). Individual session content is not logged.
- **Scheduling preferences** — study caps, sleep-window settings, and retention targets you configure.

### Information collected automatically

- **Account credentials** — your email address and authentication token, managed by our infrastructure provider Base44.
- **Usage data** — card review ratings (again / hard / good / easy) and scheduling state (stability, difficulty, interval), used solely to drive the spaced-repetition algorithm.
- **Device type** — inferred from your browser user-agent for compatibility purposes only; not stored.

### Information we do not collect

- We do not collect payment information.
- We do not collect patient data, clinical case notes, or any personally identifiable patient information.
- We do not use tracking cookies, advertising pixels, or third-party analytics scripts.
- We do not build profiles for advertising or sell your data to any third party.

---

## Why We Process Your Information

We process your personal information on the following lawful bases:

| Purpose | Lawful basis |
|---------|-------------|
| Provide the spaced-repetition service | Performance of a contract (POPIA: legitimate purpose; GDPR Art. 6(1)(b)) |
| Personalise your review schedule | Legitimate interest / performance of contract |
| Allow you to export and delete your own data | Legal obligation and your request |
| Diagnose technical faults you report | Legitimate interest |
| Comply with applicable law | Legal obligation |

We do **not** process your information for advertising, profiling, or sale to third parties.

---

## Cookies and Local Storage

Nidus Recall does not use tracking cookies. We use the browser's **localStorage** for the following purposes only:

| Key | Contents | Reason |
|-----|----------|--------|
| `nidus.firstName` | Your first name (if provided) | Personalised greeting, stays on your device |
| `nidus-settings` | Study preferences (caps, sleep window, etc.) | Fast local access without a network call |
| `base44_access_token` | Authentication token | Keeps you signed in between sessions |
| `nidus-sleep-banner-dismissed` | Today's date | Prevents the sleep-reminder banner appearing more than once per day |

No localStorage data is shared with third parties. The authentication token is an opaque bearer credential; it does not contain your email or any personally identifiable information in a readable form.

---

## How We Store and Protect Your Information

### Encryption in transit

All communication between your browser and our servers uses **HTTPS with TLS 1.2 or higher**. Authentication tokens are transmitted in the HTTP `Authorization` header, not in URL query strings. Tokens extracted from URL parameters are removed from the browser URL immediately after load, preventing exposure in browser history and referrer headers.

### Encryption at rest

Data is stored on **Amazon Web Services (AWS)** infrastructure managed by Base44. AWS applies **AES-256 encryption at rest** for database storage and object storage by default. AWS holds ISO 27001, SOC 2 Type II, and ISO 27017/27018 (cloud security and privacy) certifications; details are available at aws.amazon.com/compliance.

### Row-Level Security

All user records (flashcards, decks, session logs, scheduling state) are protected by **Row-Level Security (RLS)** enforced server-side by Base44. The policy is:

- **Read, update, delete:** only permitted if the record's `created_by` field matches the authenticated user's email address, or the caller holds the `admin` role.
- **Create:** permitted for any authenticated user; the `created_by` field is set automatically by the server.

RLS is enforced at the database layer, not at the application layer. Even if a client-side request were tampered with, the server will block access to any record that does not belong to the requesting user.

### Authentication

Nidus Recall uses Base44's **OAuth 2.0 / JWT-based authentication flow**:

1. You are redirected to Base44's login service.
2. On successful login, a short-lived access token is returned.
3. The token is stored in localStorage and sent as a `Bearer` token on every authenticated API request.
4. All write operations (saving cards, logging sessions, updating settings) are guarded by a server-side authentication check; they fail immediately if no valid token is present.

### Sensitive credential handling

If you connect a Notion integration, your Notion Internal Integration token is stored **server-side** in the Base44 User entity, protected by Row-Level Security. It is never written to localStorage after the initial migration and is never included in data exports. You can revoke this at any time via **Settings → Import & Export → Disconnect Notion**.

---

## Third-Party Processors

| Processor | Role | Location | Transfer mechanism |
|-----------|------|----------|--------------------|
| **Base44** | Application backend, database, authentication, serverless functions | United States (AWS us-east-1) | Standard Contractual Clauses (POPIA s. 72; GDPR Art. 46(2)(c)) |
| **Anthropic** (optional, opt-in) | AI-assisted card editing — only when you explicitly trigger the feature on a specific card | United States | Standard Contractual Clauses |
| **Amazon Web Services** (sub-processor of Base44) | Cloud infrastructure, storage, networking | United States | AWS Data Processing Addendum |

Base44 processes data under a **Data Processing Agreement** on our behalf. Your data may be stored on servers outside South Africa. We rely on **Standard Contractual Clauses** as the cross-border transfer mechanism in terms of POPIA Section 72 and GDPR Article 46(2)(c).

We do not use any other third-party processors. We do not use third-party analytics, advertising, or tracking services.

---

## AI Features

The optional AI card-editing feature sends **only the selected card's front text and back text** to Anthropic's API via a Base44 serverless function. The following safeguards apply:

- No personally identifiable information is included in the request.
- The feature is **strictly opt-in** and triggered only by an explicit action on a specific card.
- Citation requests are refused before any call is made to the language model; citations must be added manually.
- Cards identified as containing clinical content receive a conservative editing prompt; the model is instructed not to introduce factual changes to clinical material.
- AI-assisted edits are recorded in an immutable audit log (`CardHistory`) alongside the model identifier and a version number.

---

## How Long We Retain Your Data

| Data type | Retention period |
|-----------|-----------------|
| Flashcards, decks, session logs, scheduling state | Until you delete them or request account deletion |
| Notion integration token | Until you disconnect Notion or request account deletion |
| Account record | Up to 30 days after account deletion request |
| Backup copies | Up to 30 days after account deletion request |
| Browser localStorage | Until you clear your browser storage or delete your account |

When you request account deletion, application records are deleted within **48 hours** and backup copies are purged within **30 days**.

---

## Your Rights Under POPIA (Sections 23-25) and GDPR

As a data subject under POPIA and, where applicable, GDPR, you have the right to:

| Right | What it means | How to exercise it |
|-------|--------------|-------------------|
| **Access** (POPIA s. 23; GDPR Art. 15) | Request confirmation of whether we hold information about you, and a copy of that information. | Settings → Privacy → Export my data |
| **Correction** (POPIA s. 24; GDPR Art. 16) | Request correction of inaccurate or incomplete information. | Edit your cards and settings directly in the app, or email us |
| **Deletion** (POPIA s. 24; GDPR Art. 17) | Request deletion of your personal information. | Settings → Privacy → Delete my account |
| **Objection** (POPIA s. 25; GDPR Art. 21) | Object to the processing of your personal information on reasonable grounds. | Email privacy@nidusrecall.app |
| **Portability** (GDPR Art. 20) | Receive your data in a structured, machine-readable format. | Settings → Privacy → Export my data (JSON) |
| **Withdraw consent** | Where processing is based on consent, withdraw at any time without affecting prior processing. | Delete your account or email us |

To exercise any of these rights, use the self-service tools in Settings → Privacy, or contact us at **privacy@nidusrecall.app**. We will respond within **30 days**.

---

## Data Breach Notification

If we become aware of a personal data breach that is likely to result in a risk to your rights and freedoms, we will:

1. Notify the **Information Regulator (South Africa)** within **72 hours** of becoming aware, where required by POPIA.
2. Notify affected users **without undue delay** where the breach is likely to result in a high risk to their rights, in accordance with POPIA Section 22.
3. Record all breaches in an internal breach register regardless of whether notification is required.

---

## How to Complain to the Information Regulator

If you believe we have violated your rights under POPIA, you may lodge a complaint with the **Information Regulator (South Africa)**:

- **Website:** www.inforegulator.org.za
- **Email:** inforeg@justice.gov.za
- **Postal address:** JD House, 27 Stiemens Street, Braamfontein, Johannesburg, 2001

If you are located in the European Economic Area and believe we have violated GDPR, you may also lodge a complaint with your local supervisory authority.

---

## Contact Us

For any privacy-related questions, requests, or concerns:

- **Email:** privacy@nidusrecall.app
- **Response time:** within 30 days

---

## Changes to This Policy

We will notify authenticated users via an in-app notice before material changes take effect. Continued use of Nidus Recall after the effective date constitutes acceptance of the revised policy. Previous versions are available on request.

---

*Last updated: 2 May 2026*
