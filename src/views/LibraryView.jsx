import { useState, useRef, useMemo } from "react"
import { getGreeting } from "@/lib/greeting"
import { useVirtualizer } from "@tanstack/react-virtual"
import { C } from "@/lib/theme"
import { Ico } from "@/lib/icons"
import { timeAgo } from "@/lib/dates"
import { buildDeckTree } from "@/lib/deck-tree"
import { isInSleepWindow, sleepBannerIsDismissed, sleepBannerDismiss } from "@/lib/settings"
import { getDue, getNew, isActive } from "@/lib/fsrs"
import { OnboardingView } from "@/views/OnboardingView"

export function LibraryView({ cards, decks, deckMeta, onSelectDeck, onCreateDeck, syncStatus, lastSynced, settings, onCreateSampleDeck, deckParentMap }) {
  const [search,         setSearch]         = useState("")
  const [showArchived,   setShowArchived]   = useState(false)
  const [showCreateDeck, setShowCreateDeck] = useState(false)
  const [newDeckName,    setNewDeckName]    = useState("")
  const [bannerDismissed, setBannerDismissed] = useState(sleepBannerIsDismissed)
  const [activeTag,      setActiveTag]      = useState(null)
  const newDeckRef = useRef(null)
  const deckListRef = useRef(null)

  const hasDue        = getDue(cards).length > 0
  const showSleepBanner = isInSleepWindow(settings) && hasDue && !bannerDismissed

  const dismissBanner = () => { sleepBannerDismiss(); setBannerDismissed(true) }

  const deckStats = useMemo(() => decks.map(name => {
    const dc = cards.filter(c => c.deck === name)
    return { name, total: dc.filter(isActive).length, due: getDue(dc).length, newCount: getNew(dc).length, archived: deckMeta[name]?.archived || false }
  }), [cards, decks, deckMeta])

  const recentDecks = useMemo(() => {
    const lastReviewByDeck = new Map()
    for (const card of cards) {
      if (card.lastReview && card.deck) {
        const prev = lastReviewByDeck.get(card.deck)
        if (!prev || card.lastReview > prev) lastReviewByDeck.set(card.deck, card.lastReview)
      }
    }
    return Array.from(lastReviewByDeck.entries())
      .sort((a, b) => b[1].localeCompare(a[1]))
      .slice(0, 3)
      .map(([name]) => deckStats.find(d => d.name === name))
      .filter(Boolean)
  }, [cards, deckStats])

  // All unique tags across every card, sorted alphabetically
  const allTagsInLibrary = useMemo(() => {
    const set = new Set()
    for (const card of cards) for (const t of (card.tags || [])) set.add(t)
    return [...set].sort()
  }, [cards])

  // Map: deckName → Set of tags on its cards (for tag filter)
  const deckTagSets = useMemo(() => {
    const map = new Map()
    for (const card of cards) {
      if (!map.has(card.deck)) map.set(card.deck, new Set())
      for (const t of (card.tags || [])) map.get(card.deck).add(t)
    }
    return map
  }, [cards])

  const visible = deckStats
    .filter(d => showArchived || !d.archived)
    .filter(d => !search || d.name.toLowerCase().includes(search.toLowerCase()))
    .filter(d => !activeTag || deckTagSets.get(d.name)?.has(activeTag))

  const archivedCount = deckStats.filter(d => d.archived).length

  const syncLabel = syncStatus === "saving" ? "Saving..."
    : syncStatus === "error" ? "Sync error"
    : lastSynced ? `Synced ${timeAgo(lastSynced)}`
    : null

  const doCreate = () => {
    if (newDeckName.trim()) { onCreateDeck(newDeckName.trim()); setNewDeckName(""); setShowCreateDeck(false) }
  }

  return (
    <div className="rapp-wrap rapp-fadein">
      <div className="rapp-mb24">
        <div className="rapp-row rapp-sb" style={{ alignItems:"flex-start" }}>
          <div>
            <div className="rapp-pg-title">{decks.length > 0 ? getGreeting(localStorage.getItem("nidus.firstName")) : "Library"}</div>
            {syncLabel && (
              <div style={{ fontSize:11.5, color: syncStatus==="error" ? C.again : C.textMut, marginTop:3 }}>
                {syncStatus==="saving"?"●":syncStatus==="error"?"⚠":"✓"} {syncLabel}
              </div>
            )}
          </div>
          {(cards.length > 0 || decks.length > 0) && (
            <button className="rapp-btn rapp-btn-primary" style={{ padding:"8px 16px", fontSize:13 }}
              onClick={() => { setShowCreateDeck(true); setTimeout(()=>newDeckRef.current?.focus(),50) }}>
              {Ico.plus(13)} New Deck
            </button>
          )}
        </div>
      </div>

      {showSleepBanner && (
        <div className="nid-sleep-banner rapp-fadein">
          <div className="nid-sleep-banner-body">
            Sleep review window open. Studying now supports overnight memory consolidation.
          </div>
          <button className="nid-sleep-banner-dismiss" aria-label="Dismiss" onClick={dismissBanner}>✕</button>
        </div>
      )}

      {showCreateDeck && (
        <div className="rapp-card rapp-mb20 rapp-fadein">
          <label className="rapp-label">Deck name</label>
          <div style={{ display:"flex", gap:8 }}>
            <input ref={newDeckRef} className="rapp-input rapp-flex1" value={newDeckName}
              onChange={e => setNewDeckName(e.target.value)}
              onKeyDown={e => { if (e.key==="Enter") doCreate() }}
              placeholder="e.g. Anatomy, Research Methods..." />
            <button className="rapp-btn rapp-btn-primary" style={{ padding:"9px 14px", fontSize:13 }}
              onClick={doCreate} disabled={!newDeckName.trim()}>Create</button>
            <button aria-label="Close deck creation" className="rapp-btn rapp-btn-ghost" style={{ padding:"9px 12px" }}
              onClick={() => { setShowCreateDeck(false); setNewDeckName("") }}>✕</button>
          </div>
        </div>
      )}

      {decks.length > 4 && (
        <div className="rapp-mb16">
          <input className="rapp-input" placeholder="Search decks..." value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
      )}

      {allTagsInLibrary.length > 0 && (
        <div className="rapp-mb16" data-testid="tag-filter-bar" style={{ display:'flex', flexWrap:'wrap', gap:6, alignItems:'center' }}>
          <span style={{ fontSize:11, fontWeight:600, color:C.textMut, letterSpacing:'0.06em', textTransform:'uppercase', marginRight:2 }}>Tags</span>
          {allTagsInLibrary.map(tag => (
            <button
              key={tag}
              data-testid={`tag-filter-${tag}`}
              onClick={() => setActiveTag(t => t === tag ? null : tag)}
              style={{
                padding: '3px 10px', fontSize: 12, borderRadius: 20, cursor: 'pointer',
                fontFamily: 'inherit', border: `1px solid ${activeTag === tag ? C.accent : C.border}`,
                background: activeTag === tag ? C.accent : 'transparent',
                color: activeTag === tag ? '#fff' : C.textSec,
                transition: 'background 0.12s, color 0.12s, border-color 0.12s',
              }}
            >
              {tag}
            </button>
          ))}
          {activeTag && (
            <button
              data-testid="tag-filter-clear"
              onClick={() => setActiveTag(null)}
              style={{ padding:'3px 8px', fontSize:11, borderRadius:20, cursor:'pointer', fontFamily:'inherit', border:`1px solid ${C.border}`, background:'transparent', color:C.textMut }}
            >
              ✕ clear
            </button>
          )}
        </div>
      )}

      {decks.length === 0 ? (
        <OnboardingView
          onCreateDeck={() => { setShowCreateDeck(true); setTimeout(()=>newDeckRef.current?.focus(),50) }}
          onCreateSampleDeck={onCreateSampleDeck}
        />
      ) : visible.length === 0 && search ? (
        <div className="rapp-empty">No decks match "{search}"</div>
      ) : (
        <>
          {recentDecks.length > 0 && !search && (
            <div className="rapp-mb20" data-testid="recent-decks">
              <div style={{ fontSize:11, fontWeight:600, color:C.textMut, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:10 }}>Recent</div>
              <div className="rapp-col" style={{ gap:10 }}>
                {recentDecks.map(d => (
                  <DeckCard key={d.name} d={d} treeEntry={{ indent:0, displayName:d.name }} onSelectDeck={onSelectDeck} />
                ))}
              </div>
            </div>
          )}
          <DeckList visible={visible} deckParentMap={deckParentMap} onSelectDeck={onSelectDeck} listRef={deckListRef} />
        </>
      )}

      {archivedCount > 0 && (
        <button onClick={() => setShowArchived(v=>!v)}
          style={{ marginTop:20, background:"none", border:"none", cursor:"pointer", fontSize:12, color:C.textMut, fontFamily:"inherit" }}>
          {showArchived?"Hide":"Show"} {archivedCount} archived deck{archivedCount!==1?"s":""}
        </button>
      )}
    </div>
  )
}

const DECK_VIRTUAL_THRESHOLD = 50
const DECK_ROW_ESTIMATE = 84  // px: card height (~72) + gap (12)

function DeckList({ visible, deckParentMap, onSelectDeck, listRef }) {
  const tree = useMemo(
    () => buildDeckTree(visible.map(d => d.name), deckParentMap || new Map()),
    [visible, deckParentMap]
  )

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => DECK_ROW_ESTIMATE,
    overscan: 8,
    enabled: visible.length > DECK_VIRTUAL_THRESHOLD,
  })

  if (visible.length <= DECK_VIRTUAL_THRESHOLD) {
    return (
      <div className="rapp-col" style={{ gap:12 }}>
        {visible.map((d, idx) => <DeckCard key={d.name} d={d} treeEntry={tree[idx]} onSelectDeck={onSelectDeck} />)}
      </div>
    )
  }

  return (
    <div
      ref={listRef}
      style={{ height: "min(calc(100vh - 240px), 720px)", overflowY: "auto" }}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map(vi => (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start}px)`, paddingBottom: 12 }}
          >
            <DeckCard d={visible[vi.index]} treeEntry={tree[vi.index]} onSelectDeck={onSelectDeck} />
          </div>
        ))}
      </div>
    </div>
  )
}

function DeckCard({ d, treeEntry, onSelectDeck }) {
  return (
    <div className="nid-deck-card"
      style={{ marginLeft: treeEntry.indent * 20 }}
      onClick={() => onSelectDeck(d.name)}>
      <div className="rapp-row rapp-sb">
        <div className="nid-deck-name">
          {treeEntry.indent > 0 && <span style={{ color:C.textMut, marginRight:4, fontSize:12 }}>{'> '.repeat(treeEntry.indent)}</span>}
          {treeEntry.displayName}
        </div>
        {d.due > 0 && <span className="nid-deck-due">{d.due} due</span>}
      </div>
      <div className="nid-deck-meta">
        {d.total} card{d.total!==1?"s":""}
        {d.newCount > 0 && <span style={{ color:C.accent }}> · {d.newCount} new</span>}
        {d.archived && <span> · archived</span>}
      </div>
    </div>
  )
}
