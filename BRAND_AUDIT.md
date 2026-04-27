# Brand Audit — Nidus Recall

_Generated: 2026-04-27. Reference for the brand/onboarding/voice implementation sprint._

---

## 1. Logo Assets (current state)

| Asset | Path | Current content | Action |
|-------|------|-----------------|--------|
| SVG icon 192 | `public/icons/icon-192.svg` | Rounded rect + "N" letterform + 3 dots | Replace with neuron mark (icon theme) |
| SVG icon 512 | `public/icons/icon-512.svg` | Same "N" letterform treatment | Replace with neuron mark (icon theme) |
| PNG icon 192 | `public/icons/icon-192.png` | Rasterised from above | Regenerate via `generate-icons.js` |
| PNG icon 512 | `public/icons/icon-512.png` | Rasterised from above | Regenerate via `generate-icons.js` |
| Apple touch icon | `public/apple-touch-icon.png` | "N" letterform | Regenerate |
| Landing page | `public/landing.html` | Text-only logo treatment | Add inline neuron SVG + wordmark |

Neuron mark source: `C:\Users\ryanr\Downloads\nidus_neuron_v10.html`

Key SVG geometry (dark/hero theme):
- viewBox: `4 6 158 104`
- Soma: `cx=60 cy=68 r=14`, stroke `#8AAD91`
- Dendrites: D1 upper (`M 54,60 C 46,50 38,38 32,28` + two branches), D2 mid (`M 49,68 C 40,64 30,62 20,58`), D3 lower (`M 54,77 C 46,84 38,90 30,96`)
- Axon: `M 72,68 C 86,64 102,56 118,48 C 126,44 136,42 146,38`
- Myelin sheaths: 7 ellipses at cx = 77, 87, 98, 108, 119, 130, 141; fill `#101F12`
- Collateral: `M 93,60 C 97,67 99,75 97,83`
- Terminal fork at (146, 38)
- Vesicle dots: 5 circles, opacities 0.85 / 0.75 / 0.65 / 0.45 / 0.40

Three themes: **dark** (stroke `#8AAD91`, bg `#101F12`), **light** (stroke `#6E9275`, bg `#FFFFFF`), **icon** (dark + `border-radius:22%`).

---

## 2. Sidebar Wordmark (current state)

Both occurrences are in `src/pages/Home.jsx`:

- Line 187 (skeleton render): `<div className="rapp-logo"><div className="rapp-logo-dot"/>Nidus Recall</div>`
- Line 207 (main render): `<div className="rapp-logo"><div className="rapp-logo-dot"/>Nidus Recall</div>`

Action: Replace both with `<NidusLogo size={28} withWordmark />` (component to be created at `src/components/NidusLogo.jsx`).

---

## 3. User Entity — Name Fields

File: `base44/entities/User.jsonc`

Current named fields: `role`, sleep settings, study thresholds, Notion integration. **No `full_name` or `first_name` field exists.**

Decision: Add `first_name` (string, max 60, nullable) to the User entity. Mirror to `localStorage["nidus.firstName"]` for pre-auth greeting display. Used only for greetings — no downstream data dependency.

---

## 4. OnboardingView Routing

File: `src/views/OnboardingView.jsx` (25 lines)

Rendered via `src/views/LibraryView.jsx` lines 97–101 when `decks.length === 0`. It was removed from `Home.jsx` imports during the cleanup session but remains active through LibraryView's direct import. No routing reinstatement needed.

Action: Add name-capture step to OnboardingView itself (autofocus input → Continue/Skip → "Nice to meet you" acknowledgement screen → existing CTA content).

---

## 5. Colour Tokens

File: `src/styles/app.css`

Current single token: `--sage: #5C7A6A`. No separate `tokens.css`. Tokens live inline in `app.css`.

Tokens to add:
```css
--nidus-sage: #8AAD91;       /* primary brand green — AA verified */
--nidus-sage-light: #6E9275; /* light-mode variant */
--nidus-warm: #C89968;       /* warm accent — needs AA check against #F4F7F5 */
```

Contrast check: run `node scripts/check-contrast.js` after adding pairs. If `--nidus-warm` on cream (`#F4F7F5`) fails 4.5:1, darken to `#B68856`.

---

## 6. User-Facing Strings — Files to Rewrite

| File | Location | Current string | Rewrite target |
|------|-----------|---------------|----------------|
| `src/pages/Home.jsx` | line 178 | `label: "Stats"` | `"Progress"` |
| `src/views/StatsView.jsx` | line 29 | `rapp-pg-title` "Stats" | "Progress" |
| `src/views/LibraryView.jsx` | line 50 | `rapp-pg-title` "Library" | Greeting (when decks > 0) |
| `src/views/StudySelectView.jsx` | line 26 | `rapp-pg-title` "Study" | Greeting |
| `src/views/StudySelectView.jsx` | line 27 | `rapp-pg-sub` "Choose mode and deck" | "Ready when you are." |
| `src/views/StudySelectView.jsx` | line 125 | "Nothing to study. Come back tomorrow or add cards." | Warmer empty-state copy |
| `src/views/StatsView.jsx` | lines 44–54 | Teaching empty-state cards | VesicleDots + rewrite |
| `src/views/StatsView.jsx` | line 126 | "Critical cards: X of Y total" | Conditional (hide when 0) |
| `src/views/StatsView.jsx` | line 159 | "Tracking started: score shown after 10 qualifying reviews." | Rewrite |
| `src/views/SessionView.jsx` | line 206 | "Session complete" / "Session paused" | Keep; add reflection line above stats |
| `src/views/OnboardingView.jsx` | line 8 | "Welcome to Nidus Recall" | Keep as fallback; name step added before |

---

## 7. New Files to Create

| File | Purpose |
|------|---------|
| `src/components/NidusLogo.jsx` | Neuron SVG mark, props: size/theme/withWordmark/withStrapline |
| `src/components/VesicleDots.jsx` | Static low-opacity SVG dot constellation |
| `src/lib/greeting.js` | `getGreeting(firstName, now)` and `getTimeOfDay(now)` |
| `src/lib/__tests__/greeting.test.js` | ≥10 boundary tests |

---

## 8. Test Surface

Current test count: 194 passing (pre-sprint). All new files need tests. Snapshot tests for LibraryView and StatsView headers will require `--update` after title/greeting changes.
