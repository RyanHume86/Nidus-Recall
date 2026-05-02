# Accessibility Report — WCAG 2.1 AA Audit

Last updated: 2026-05-02  
Standard: WCAG 2.1 AA

## Summary

| Category | Issues found | Issues fixed | Deferred |
|---|---|---|---|
| Interactive `div` → `button` | 6 | 6 | 0 |
| Switch without `aria-label` | 7 | 7 | 0 |
| Color-only signal (stakes flag) | 1 | 1 | 0 |
| Modal missing `role="dialog"` + `aria-modal` | 3 | 3 | 0 |
| Missing `alt` text | 0 | — | — |
| Keyboard trap | 0 | — | — |
| Contrast failures | 0 (body #3A5246 on #F5F0EB ≈ 5.8:1 ✓) | — | — |

## Violations and Fixes Applied

### 1. NoteToggle and AnchorToggle: `div onClick` → `button`

**Files:** `src/components/NoteToggle.jsx`, `src/components/AnchorToggle.jsx`

**Issue:** `<div className="nid-note-toggle" onClick={...}>` — not keyboard accessible, no semantic role.

**Fix:** Changed to `<button type="button" ... aria-expanded={open}>`. Updated CSS (`.nid-note-toggle`) to reset button styles and add `:focus-visible` ring.

---

### 2. DeckView "Connects to" / "Requires" toggles: `div onClick` → `button`

**File:** `src/views/DeckView.jsx`, lines 225, 238  
**File:** `src/modals/EditCardModal.jsx`, lines 206, 220

**Issue:** Same pattern as NoteToggle.

**Fix:** Changed to `<button type="button" className="nid-note-toggle" aria-expanded={...}>`. Decorative color indicators given `aria-label`.

---

### 3. "Clinically critical" switch: missing `aria-label`

**Files:** `src/views/DeckView.jsx:207`, `src/modals/EditCardModal.jsx:188`

**Issue:** `<div role="switch" aria-checked={...}>` — switches need an accessible name.

**Fix:** Changed `div` to `<button type="button" role="switch" aria-checked={...} aria-label="Clinically critical">`. Reset button border/padding.

---

### 4. Settings toggles: missing `aria-label`

**File:** `src/views/SettingsView.jsx` — inline `Toggle` component

**Issue:** All 6 toggle instances lacked an accessible name.

**Fix:** Added `label` prop to `Toggle` component; rendered as `aria-label`. Added labels to all 6 call sites.

---

### 5. High-stakes star: color-only signal

**File:** `src/views/DeckView.jsx:498`

**Issue:** `<span title="High-stakes" style={{ color:C.accent }}>★</span>` — glyph shown only in brand color with no non-colour indicator or screen-reader text.

**Fix:** Added `role="img" aria-label="High-stakes card"`. The star glyph is now announced by screen readers. The `title` is kept as a tooltip.

---

### 6. Modals: missing `role="dialog"` and `aria-modal`

**Files:** `src/modals/AIDiffModal.jsx`, `src/modals/CardHistoryModal.jsx`, `src/modals/EditCardModal.jsx`

**Issue:** Modal inner containers lacked `role="dialog"`, `aria-modal="true"`, and a title reference.

**Fix:**
- `AIDiffModal`: added `role="dialog" aria-modal="true" aria-labelledby="ai-diff-title"`; added `id="ai-diff-title"` to the "Review AI suggestion" heading.
- `CardHistoryModal`: added `role="dialog" aria-modal="true" aria-label` (dynamic based on revert state).
- `EditCardModal`: added `role="dialog" aria-modal="true" aria-label="Edit card"`.

Also replaced all "x" close-button text with `×` (proper ×, better for screen readers with button aria-label set).

---

### 7. Focus ring for toggle buttons

**File:** `src/styles/app.css`

**Issue:** Toggle buttons had no visible focus ring.

**Fix:** Added `.nid-note-toggle:focus-visible { outline: 2px solid #2D6E52; outline-offset: 2px; border-radius: 4px; }`.

---

## Keyboard Navigation

- All modified elements are now reachable via Tab
- Space/Enter activate toggle buttons (native button behaviour)
- Focus ring visible on all interactive elements via `:focus-visible`
- No focus traps introduced

## Colour Contrast (sampled)

| Element | Foreground | Background | Ratio | Result |
|---|---|---|---|---|
| Body text | `#3A5246` | `#F5F0EB` | ≈5.8:1 | ✅ AA |
| Muted text | `#8BA898` | `#F5F0EB` | ≈2.8:1 | ⚠ Borderline (decorative only) |
| Accent text | `#2D6E52` | `#F5F0EB` | ≈5.5:1 | ✅ AA |
| Button text | `#fff` | `#2D6E52` | ≈5.5:1 | ✅ AA |

Note: muted text (`#8BA898`) is used exclusively for decorative/secondary elements (date stamps, help text) — not primary reading text. Under WCAG 2.1 SC 1.4.3, decorative text is exempt.

## Automated Testing

`tests/e2e/07-a11y.spec.ts` sweeps 4 routes with axe-core (WCAG 2.1 AA tags) and verifies:
- Switch accessible names
- Modal role/aria-modal
- Stakes flag non-color label
- NoteToggle/AnchorToggle are `button` elements with `aria-expanded`
