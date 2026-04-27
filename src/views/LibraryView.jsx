import { useState, useRef, useMemo } from "react"
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
  const newDeckRef = useRef(null)

  const hasDue        = getDue(cards).length > 0
  const showSleepBanner = isInSleepWindow(settings) && hasDue && !bannerDismissed

  const dismissBanner = () => { sleepBannerDismiss(); setBannerDismissed(true) }

  const deckStats = useMemo(() => decks.map(name => {
    const dc = cards.filter(c => c.deck === name)
    return { name, total: dc.filter(isActive).length, due: getDue(dc).length, newCount: getNew(dc).length, archived: deckMeta[name]?.archived || false }
  }), [cards, decks, deckMeta])

  const visible = deckStats
    .filter(d => showArchived || !d.archived)
    .filter(d => !search || d.name.toLowerCase().includes(search.toLowerCase()))

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
            <div className="rapp-pg-title">Library</div>
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
            <button className="rapp-btn rapp-btn-ghost" style={{ padding:"9px 12px" }}
              onClick={() => { setShowCreateDeck(false); setNewDeckName("") }}>✕</button>
          </div>
        </div>
      )}

      {decks.length > 4 && (
        <div className="rapp-mb16">
          <input className="rapp-input" placeholder="Search decks..." value={search} onChange={e=>setSearch(e.target.value)} />
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
        <div className="rapp-col" style={{ gap:12 }}>
          {(() => {
            const tree = buildDeckTree(visible.map(d => d.name), deckParentMap || new Map())
            return visible.map((d, idx) => {
              const treeEntry = tree[idx]
              return (
                <div key={d.name} className="nid-deck-card"
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
            })
          })()}
        </div>
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
