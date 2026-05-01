import { useState, useRef, useEffect } from "react"
import { TAG_MAX_LEN, TAG_MAX_COUNT } from "@/lib/theme"
import { C } from "@/lib/theme"

/** Normalise raw user input to a slug-safe tag. Returns empty string for invalid input. */
export function normalizeTag(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')           // spaces → hyphens
    .replace(/[^a-z0-9\-]/g, '')   // strip non-slug chars
    .replace(/-{2,}/g, '-')        // collapse consecutive hyphens
    .replace(/^-+|-+$/g, '')       // trim leading/trailing hyphens
    .slice(0, TAG_MAX_LEN)
}

/**
 * Tag input with normalization and optional autocomplete suggestions.
 *
 * Props:
 *   tags      – current tag array
 *   onChange  – called with the new tag array
 *   allTags   – (optional) array of all known tags for autocomplete suggestions
 */
export function TagInput({ tags = [], onChange, allTags = [] }) {
  const [input, setInput]       = useState("")
  const [open, setOpen]         = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const inputRef = useRef(null)
  const listRef  = useRef(null)

  const normalized = normalizeTag(input)

  const suggestions = allTags.filter(t =>
    t.startsWith(normalized) && normalized.length > 0 && !tags.includes(t)
  ).slice(0, 6)

  const showDropdown = open && suggestions.length > 0

  const addTag = (raw) => {
    const t = normalizeTag(raw)
    if (!t || tags.includes(t) || tags.length >= TAG_MAX_COUNT) return
    onChange([...tags, t])
    setInput("")
    setOpen(false)
    setHighlighted(-1)
  }

  const handleKeyDown = (e) => {
    if (showDropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlighted(h => Math.min(h + 1, suggestions.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlighted(h => Math.max(h - 1, -1))
        return
      }
      if (e.key === 'Escape') {
        setOpen(false)
        setHighlighted(-1)
        return
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && highlighted >= 0) {
        e.preventDefault()
        addTag(suggestions[highlighted])
        return
      }
    }
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    }
  }

  // Reset highlight when suggestions change
  useEffect(() => { setHighlighted(-1) }, [suggestions.length])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (!inputRef.current?.contains(e.target) && !listRef.current?.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div style={{ position: 'relative' }}>
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {tags.map((t, i) => (
            <span key={i} className="nid-tag">
              {t}
              <span className="nid-tag-rm" onClick={() => onChange(tags.filter((_, j) => j !== i))}>×</span>
            </span>
          ))}
        </div>
      )}
      {tags.length < TAG_MAX_COUNT && (
        <input
          ref={inputRef}
          className="rapp-input"
          data-testid="tag-input"
          style={{ fontSize: 13 }}
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true) }}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          placeholder={`Add tag${tags.length > 0 ? ` · ${TAG_MAX_COUNT - tags.length} left` : ', Enter to confirm'}`}
          maxLength={TAG_MAX_LEN + 10}
          autoComplete="off"
        />
      )}
      {showDropdown && (
        <ul
          ref={listRef}
          data-testid="tag-suggestions"
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
            margin: '2px 0 0', padding: 0, listStyle: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {suggestions.map((s, i) => (
            <li
              key={s}
              data-testid={`tag-suggestion-${s}`}
              onMouseDown={() => addTag(s)}
              style={{
                padding: '7px 12px', fontSize: 13, cursor: 'pointer',
                background: highlighted === i ? C.elevated : 'transparent',
                color: C.text, borderRadius: i === 0 ? '6px 6px 0 0' : i === suggestions.length - 1 ? '0 0 6px 6px' : 0,
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
