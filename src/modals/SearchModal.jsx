import { useState, useEffect, useRef, useMemo } from "react"
import { C } from "@/lib/theme"

const TABS = ["All", "Decks", "Cards"]

function useDebounce(value, ms) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

function highlight(text, query) {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background:"rgba(45,110,82,0.18)", color:"inherit", borderRadius:2 }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export function SearchModal({ cards, decks, onNavigate, onClose }) {
  const [query,  setQuery]  = useState("")
  const [tab,    setTab]    = useState("All")
  const inputRef            = useRef(null)
  const q = useDebounce(query, 200)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [onClose])

  const { matchedDecks, matchedCards } = useMemo(() => {
    if (!q.trim()) return { matchedDecks: [], matchedCards: [] }
    const lq = q.toLowerCase()
    const md = (decks || []).filter(d => d.toLowerCase().includes(lq))
    const mc = (cards || []).filter(c =>
      (c.front || "").toLowerCase().includes(lq) ||
      (c.back  || "").toLowerCase().includes(lq)
    )
    return { matchedDecks: md, matchedCards: mc }
  }, [q, decks, cards])

  const showDecks = tab === "All" || tab === "Decks"
  const showCards = tab === "All" || tab === "Cards"
  const decksSlice = tab === "All" ? matchedDecks.slice(0, 5) : matchedDecks
  const cardsSlice = tab === "All" ? matchedCards.slice(0, 10) : matchedCards

  const isEmpty = !q.trim()
  const hasResults = matchedDecks.length > 0 || matchedCards.length > 0

  return (
    <div
      data-testid="search-modal-backdrop"
      className="nid-search-backdrop"
      onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(28,40,32,0.45)", zIndex:400, display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"80px 24px 24px" }}
    >
      <div
        data-testid="search-modal"
        className="nid-search-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onClick={e => e.stopPropagation()}
        style={{ background:C.surface, borderRadius:18, width:"100%", maxWidth:540, boxShadow:"0 12px 60px rgba(28,40,32,0.28)", overflow:"hidden" }}
      >
        {/* Input row */}
        <div style={{ display:"flex", alignItems:"center", padding:"12px 16px", borderBottom:`1px solid ${C.border}` }}>
          <span style={{ marginRight:10, color:C.textMut, fontSize:16, flexShrink:0 }}>⌕</span>
          <input
            ref={inputRef}
            data-testid="search-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search decks and cards…"
            style={{ flex:1, border:"none", background:"none", outline:"none", fontSize:15, color:C.text, fontFamily:"inherit" }}
          />
          <button
            aria-label="Close search"
            onClick={onClose}
            style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:C.textMut, padding:"0 4px", fontFamily:"inherit" }}
          >✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, padding:"0 16px" }}>
          {TABS.map(t => (
            <button
              key={t}
              data-testid={`search-tab-${t.toLowerCase()}`}
              onClick={() => setTab(t)}
              style={{
                background:"none", border:"none", cursor:"pointer",
                padding:"10px 14px 9px", fontSize:13, fontWeight: tab===t ? 600 : 400,
                color: tab===t ? C.accent : C.textMut,
                borderBottom: tab===t ? `2px solid ${C.accent}` : "2px solid transparent",
                fontFamily:"inherit",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Results */}
        <div style={{ maxHeight:420, overflowY:"auto", padding:"8px 0" }}>
          {isEmpty && (
            <p style={{ padding:"20px 20px", fontSize:13, color:C.textMut, margin:0 }}>
              Type to search across all decks and cards.
            </p>
          )}
          {!isEmpty && !hasResults && (
            <p style={{ padding:"20px 20px", fontSize:13, color:C.textMut, margin:0 }}>
              No results for <strong>"{q}"</strong>
            </p>
          )}

          {showDecks && decksSlice.length > 0 && (
            <section aria-label="Decks" data-testid="search-decks-section">
              <div style={{ padding:"6px 16px 4px", fontSize:11, fontWeight:600, color:C.textMut, textTransform:"uppercase", letterSpacing:"0.05em" }}>Decks</div>
              {decksSlice.map(d => (
                <button
                  key={d}
                  data-testid={`search-deck-result-${d}`}
                  onClick={() => { onNavigate({ type:"deck", deck:d }); onClose() }}
                  style={{ width:"100%", textAlign:"left", background:"none", border:"none", cursor:"pointer", padding:"9px 16px", display:"flex", alignItems:"center", gap:10, fontFamily:"inherit" }}
                >
                  <span style={{ fontSize:14, color:C.textMut, flexShrink:0 }}>📁</span>
                  <span style={{ fontSize:13, color:C.text }}>{highlight(d, q)}</span>
                </button>
              ))}
            </section>
          )}

          {showCards && cardsSlice.length > 0 && (
            <section aria-label="Cards" data-testid="search-cards-section">
              <div style={{ padding:"6px 16px 4px", fontSize:11, fontWeight:600, color:C.textMut, textTransform:"uppercase", letterSpacing:"0.05em" }}>Cards</div>
              {cardsSlice.map(c => (
                <button
                  key={c.id}
                  data-testid={`search-card-result-${c.id}`}
                  onClick={() => { onNavigate({ type:"card", deck:c.deck, cardId:c.id }); onClose() }}
                  style={{ width:"100%", textAlign:"left", background:"none", border:"none", cursor:"pointer", padding:"9px 16px", display:"flex", flexDirection:"column", gap:2, fontFamily:"inherit" }}
                >
                  <span style={{ fontSize:13, color:C.text, lineHeight:1.4 }}>
                    {highlight(c.front?.slice(0, 120) || "", q)}
                  </span>
                  {c.back && (
                    <span style={{ fontSize:11, color:C.textMut, lineHeight:1.4 }}>
                      {highlight(c.back.slice(0, 80), q)}
                    </span>
                  )}
                  {c.deck && <span style={{ fontSize:10, color:C.textMut }}>{c.deck}</span>}
                </button>
              ))}
            </section>
          )}

          {tab === "All" && q.trim() && (
            (matchedDecks.length > 5 || matchedCards.length > 10) && (
              <p style={{ padding:"8px 16px", fontSize:11, color:C.textMut, margin:0 }}>
                Switch to Decks or Cards tab to see all results.
              </p>
            )
          )}
        </div>
      </div>
    </div>
  )
}
