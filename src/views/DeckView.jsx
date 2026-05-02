import { useState, useEffect, useRef, useMemo } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import * as storage from "@/api/storage"
import { C, FRONT_MAX, BACK_MAX, SOURCE_MAX } from "@/lib/theme"
import { Ico } from "@/lib/icons"
import { genId } from "@/lib/dates"
import { isActive } from "@/lib/fsrs"
import { parseCloze, renderClozeFront, createClozeCards } from "@/lib/cloze"
import { createOcclusionCards } from "@/lib/occlusion"
import { CharCount } from "@/components/CharCount"
import { TagInput } from "@/components/TagInput"
import { NoteToggle } from "@/components/NoteToggle"
import { AnchorToggle } from "@/components/AnchorToggle"
import { CardPicker } from "@/components/CardPicker"
import { ImageUpload } from "@/components/cards/ImageUpload"
import { EditCardModal } from "@/modals/EditCardModal"
import { ContentTypeChips, readLastContentType } from "@/components/ContentTypeChips"
import { EmptyState } from "@/components/EmptyState"
import { CardSkeleton } from "@/components/CardSkeleton"

const SORT_OPTIONS = [
  { value: "recent",      label: "Recent" },
  { value: "front-az",    label: "Front A–Z" },
  { value: "next-due",    label: "Next due" },
  { value: "most-lapsed", label: "Most lapsed" },
]

export function DeckView({ deckName, cards, onUpdateCards, onBack, decks, settings, onArchiveDeck, cardsLoading = false, deckMeta = {} }) {
  const [form, setForm]           = useState({ front:"", back:"", tags:[], note:"", anchor:"", source:"", contentType:readLastContentType(), stakesFlag:false, connects_to:[], prerequisite_card_id:null })
  const [addMode, setAddMode]     = useState("basic")

  const allTags = useMemo(() => {
    const set = new Set()
    for (const card of cards) for (const t of (card.tags || [])) set.add(t)
    return [...set].sort()
  }, [cards])

  const [clozeText, setClozeText] = useState("")
  const [showOcclusionEditor, setShowOcclusionEditor] = useState(false)
  const [showNote, setShowNote]   = useState(false)
  const [showAnchor, setShowAnchor] = useState(false)
  const [showConnects, setShowConnects] = useState(false)
  const [showPrereq, setShowPrereq]     = useState(false)
  const [search, setSearch]       = useState("")
  const [filterSt, setFilterSt]   = useState("active")
  const [filterTag, setFilterTag] = useState(null)
  const [filterContentType, setFilterContentType] = useState(null)
  const [sortBy, setSortBy]       = useState("recent")
  const [editCard, setEditCard]   = useState(null)
  const [mobileModalCard, setMobileModalCard] = useState(null)
  const [saved, setSaved]         = useState(false)
  const [showDeckMenu, setShowDeckMenu] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [quickAdd, setQuickAdd]   = useState(false)
  const [qaFront, setQaFront]     = useState("")
  const [qaBack, setQaBack]       = useState("")
  const qaFrontRef = useRef(null)
  const frontRef   = useRef(null)
  const cardListRef = useRef(null)

  const leechThreshold = (settings||{}).leechThreshold || 5
  const isLeech = c => (c.lapses||0) >= leechThreshold
  const isArch  = c => c.status==="Archived"||c.status==="Parked"

  const deckCards   = cards.filter(c => c.deck === deckName)
  const activeCount = deckCards.filter(isActive).length

  const deckContentTypes = useMemo(() => {
    const s = new Set()
    for (const c of deckCards) if (c.contentType) s.add(c.contentType)
    return [...s].sort()
  }, [deckCards])

  const deckTagList = useMemo(() => {
    const s = new Set()
    for (const c of deckCards) for (const t of (c.tags||[])) s.add(t)
    return [...s].sort()
  }, [deckCards])

  const filtered = useMemo(() => {
    let list = deckCards
      .filter(c => filterSt==="active" ? isActive(c) : filterSt==="archived" ? isArch(c) : true)
      .filter(c => !search || c.front.toLowerCase().includes(search.toLowerCase()) || (c.back||"").toLowerCase().includes(search.toLowerCase()) || (c.anchor||"").toLowerCase().includes(search.toLowerCase()) || (c.source||"").toLowerCase().includes(search.toLowerCase()))
      .filter(c => !filterTag || (c.tags||[]).includes(filterTag))
      .filter(c => !filterContentType || c.contentType === filterContentType)

    switch (sortBy) {
      case "front-az":
        return [...list].sort((a,b) => a.front.localeCompare(b.front))
      case "next-due":
        return [...list].sort((a,b) => {
          if (!a.nextReview && !b.nextReview) return 0
          if (!a.nextReview) return 1
          if (!b.nextReview) return -1
          return a.nextReview.localeCompare(b.nextReview)
        })
      case "most-lapsed":
        return [...list].sort((a,b) => (b.lapses||0) - (a.lapses||0))
      default:
        return list
    }
  }, [deckCards, filterSt, search, filterTag, filterContentType, sortBy])

  useEffect(() => { frontRef.current?.focus() }, [])

  const handleAdd = async () => {
    if (!form.front.trim() || !form.back.trim()) return
    const card = {
      id:genId(), front:form.front.trim(), back:form.back.trim(),
      elaboration:form.note.trim(), anchor:form.anchor.trim()||null, source:form.source.trim()||null, tags:form.tags, deck:deckName,
      contentType:form.contentType||"Factual", stakes_flag:form.stakesFlag||false, connects_to:form.connects_to, prerequisite_card_id:form.prerequisite_card_id, status:"Active", nextReview:null,
      interval:1, reviewCount:0, lapses:0, createdAt:new Date().toISOString(),
    }
    await onUpdateCards([...cards, card])
    setForm({ front:"", back:"", tags:[], note:"", anchor:"", source:"", contentType:"Factual", stakesFlag:false, connects_to:[], prerequisite_card_id:null })
    setShowNote(false); setShowAnchor(false); setShowConnects(false); setShowPrereq(false)
    setSaved(true); setTimeout(()=>setSaved(false), 1200)
  }

  const createQuickCard = () => ({
    id:genId(), front:qaFront.trim(), back:qaBack.trim(), deck:deckName,
    contentType:"Factual", status:"Active", interval:1, reviewCount:0, lapses:0,
    ratingHistory:[], connects_to:[], stability:null, difficulty:null,
    nextReview:null, lastReview:null, elaboration:"", anchor:null,
    source:null, stakes_flag:false, prerequisite_card_id:null,
    tags:[], createdAt:new Date().toISOString()
  })

  const saveQuickAdd = async () => {
    if (!qaFront.trim() || !qaBack.trim()) return
    const card = createQuickCard()
    await onUpdateCards([...cards, card])
    setQaFront(""); setQaBack(""); setQuickAdd(false)
  }

  const saveAndAddAnother = async () => {
    if (!qaFront.trim() || !qaBack.trim()) return
    const card = createQuickCard()
    await onUpdateCards([...cards, card])
    setQaFront(""); setQaBack("")
    setTimeout(() => qaFrontRef.current?.focus(), 50)
  }

  const handleArchiveCard = async (id, e) => {
    e.stopPropagation()
    await onUpdateCards(cards.map(c => c.id===id ? { ...c, status:isArch(c)?"Active":"Archived" } : c))
  }

  const handleCardRowClick = (card) => {
    if (window.innerWidth < 769) {
      setMobileModalCard(card)
    } else {
      setEditCard(card)
    }
  }

  const canAdd = form.front.trim() && form.back.trim()

  const addFormContent = (
    <>
      <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:14, display:"flex", gap:8 }}>
        {["basic","cloze","occlusion"].map(m => (
          <button key={m} onClick={()=>setAddMode(m)}
            style={{ padding:"4px 10px", borderRadius:6, border:`1px solid ${addMode===m?C.accent:C.border}`, background:addMode===m?C.accent:"transparent", color:addMode===m?"#fff":C.textSec, fontSize:11, fontWeight:500, cursor:"pointer", fontFamily:"inherit", transition:"all 0.12s", textTransform:"capitalize" }}>
            {m}
          </button>
        ))}
      </div>

      {addMode === "basic" && <>
        <div className="rapp-mb10">
          <label className="rapp-label">Front</label>
          <textarea ref={frontRef} className="rapp-textarea" rows={2} value={form.front} maxLength={FRONT_MAX}
            onChange={e=>setForm(f=>({...f,front:e.target.value}))}
            placeholder="Question or prompt that forces retrieval."
            onKeyDown={e=>{ if(e.key==="Tab"){ e.preventDefault(); document.querySelector(".nid-back-input")?.focus() }}} />
          <CharCount current={form.front.length} max={FRONT_MAX} />
        </div>
        <div className="rapp-mb10">
          <label className="rapp-label">Back</label>
          <textarea className="rapp-textarea nid-back-input" rows={2} value={form.back} maxLength={BACK_MAX}
            onChange={e=>setForm(f=>({...f,back:e.target.value}))}
            placeholder="Concise answer: one idea only." />
          <CharCount current={form.back.length} max={BACK_MAX} />
        </div>
        <div className="rapp-mb10">
          <label className="rapp-label">Tags</label>
          <TagInput tags={form.tags} onChange={t=>setForm(f=>({...f,tags:t}))} allTags={allTags} />
        </div>
        <div className="rapp-mb10">
          <label className="rapp-label">Type</label>
          <ContentTypeChips value={form.contentType} onChange={v=>setForm(f=>({...f,contentType:v}))} />
        </div>
        <div className="rapp-mb10">
          <label className="rapp-label">Source (optional)</label>
          <input className="rapp-input" value={form.source} maxLength={SOURCE_MAX}
            onChange={e=>setForm(f=>({...f,source:e.target.value}))}
            placeholder="Article, chapter, guideline, or lecture." />
          {form.source.length >= SOURCE_MAX - 40 && <CharCount current={form.source.length} max={SOURCE_MAX} />}
        </div>
        <div className="rapp-mb12">
          <div className="rapp-row rapp-sb" style={{ alignItems:"flex-start" }}>
            <div>
              <div style={{ fontSize:13, fontWeight:500, color:form.stakesFlag?C.accent:C.text }}>Clinically critical</div>
              <div style={{ fontSize:11, color:C.textMut, marginTop:2, lineHeight:1.5 }}>High-stakes card: prioritised when study time is short.</div>
            </div>
            <div role="switch" aria-checked={form.stakesFlag}
              onClick={()=>setForm(f=>({...f,stakesFlag:!f.stakesFlag}))}
              style={{ width:40, height:22, borderRadius:11, cursor:"pointer", flexShrink:0, marginTop:2,
                background:form.stakesFlag?C.accent:C.elevated, position:"relative", transition:"background 0.2s" }}>
              <div style={{ position:"absolute", top:3, left:form.stakesFlag?21:3, width:16, height:16, borderRadius:8,
                background:"#fff", transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
            </div>
          </div>
        </div>
        <div className="rapp-mb12">
          <NoteToggle value={form.note} onChange={v=>setForm(f=>({...f,note:v}))} open={showNote} onToggle={()=>setShowNote(o=>!o)} />
        </div>
        <div className="rapp-mb12">
          <AnchorToggle value={form.anchor} onChange={v=>setForm(f=>({...f,anchor:v}))} open={showAnchor} onToggle={()=>setShowAnchor(o=>!o)} />
        </div>
        {deckCards.length > 0 && (<>
          <div className="rapp-mb12">
            <div className="nid-note-toggle" onClick={()=>setShowConnects(o=>!o)}>
              {Ico.chevron(13, showConnects)}
              <span>Connects to</span>
              <span style={{ fontSize:11, color:C.textMut, marginLeft:4 }}>(optional)</span>
              {form.connects_to.length > 0 && !showConnects && <span style={{ fontSize:11, color:C.accent, marginLeft:6 }}>● {form.connects_to.length}</span>}
            </div>
            {showConnects && (
              <div className="rapp-fadein" style={{ marginTop:8 }}>
                <CardPicker allCards={deckCards} value={form.connects_to} onChange={v=>setForm(f=>({...f,connects_to:v}))} mode="multi" placeholder="Search cards to link..." />
              </div>
            )}
          </div>
          <div className="rapp-mb16">
            <div className="nid-note-toggle" onClick={()=>setShowPrereq(o=>!o)}>
              {Ico.chevron(13, showPrereq)}
              <span>Requires (prerequisite)</span>
              <span style={{ fontSize:11, color:C.textMut, marginLeft:4 }}>(optional)</span>
              {form.prerequisite_card_id && !showPrereq && <span style={{ fontSize:11, color:C.accent, marginLeft:6 }}>●</span>}
            </div>
            {showPrereq && (
              <div className="rapp-fadein" style={{ marginTop:8 }}>
                <p style={{ fontSize:12, color:C.textMut, marginBottom:8, lineHeight:1.6 }}>This card should only be reviewed after:</p>
                <CardPicker allCards={deckCards} value={form.prerequisite_card_id} onChange={v=>setForm(f=>({...f,prerequisite_card_id:v}))} mode="single" placeholder="Search for prerequisite card..." />
              </div>
            )}
          </div>
        </>)}
        <div style={{ position:"sticky", bottom:0, paddingTop:8, background:"inherit" }}>
          <button className="rapp-btn rapp-btn-primary" style={{ width:"100%" }} onClick={handleAdd} disabled={!canAdd}>
            {saved ? "✓ Saved" : "Add card"}
          </button>
        </div>
      </>}

      {addMode === "cloze" && (
        <div className="rapp-fadein">
          <div className="rapp-mb10">
            <label className="rapp-label">Cloze text
              <span style={{ marginLeft:6, fontSize:11, fontWeight:400, color:C.textMut, cursor:"default" }}
                title="Cloze cards force retrieval of the hidden span.">ⓘ</span>
            </label>
            <textarea className="rapp-textarea" rows={3} value={clozeText}
              onChange={e=>setClozeText(e.target.value)}
              placeholder="Type {{c1::answer}} to mark a deletion." />
          </div>
          {clozeText.trim() && (() => {
            const { cards: cv } = parseCloze(clozeText)
            return (
              <div style={{ background:C.elevated, borderRadius:10, padding:"10px 14px", marginBottom:12 }}>
                <div style={{ fontSize:12, color:C.textMut, marginBottom:6 }}>This note produces {cv.length} card{cv.length!==1?"s":""}. Preview of card 1:</div>
                {cv.length > 0 && <div style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{renderClozeFront(cv[0].front)}</div>}
              </div>
            )
          })()}
          <button className="rapp-btn rapp-btn-primary" style={{ width:"100%" }}
            disabled={!clozeText.trim() || parseCloze(clozeText).indices.length === 0}
            onClick={async () => {
              const newCards = createClozeCards(clozeText, deckName)
              if (!newCards.length) return
              await onUpdateCards([...cards, ...newCards])
              setClozeText("")
              setSaved(true); setTimeout(()=>setSaved(false), 1200)
            }}>
            {saved ? "✓ Saved" : `Create ${parseCloze(clozeText).indices.length} cloze card${parseCloze(clozeText).indices.length!==1?"s":""}`}
          </button>
        </div>
      )}

      {addMode === "occlusion" && (
        <div className="rapp-fadein">
          <ImageUpload onSave={async (imageId, imgUrl, regions) => {
            const newCards = createOcclusionCards(imgUrl, regions, deckName, imageId)
            await onUpdateCards([...cards, ...newCards])
            storage.updateImageLinkedCards(imageId, newCards.map(c => c.id)).catch(() => {})
            setAddMode("basic")
            setSaved(true); setTimeout(()=>setSaved(false), 1200)
          }} />
        </div>
      )}
    </>
  )

  return (
    <div className="rapp-fadein" data-testid="deck-view" style={{ width:"100%" }}>
      {/* Mobile modal for edit */}
      {mobileModalCard && <EditCardModal card={mobileModalCard} cards={cards} onUpdateCards={onUpdateCards} decks={decks} onClose={()=>setMobileModalCard(null)} onSaveHistory={storage.saveCardHistory} />}

      {/* Header */}
      <div className="rapp-row rapp-sb rapp-mb24">
        <div className="rapp-row rapp-gap8">
          <button aria-label="Back to Library" onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:C.textMut, padding:"4px 8px 4px 0", display:"flex", alignItems:"center" }}>
            {Ico.back(18)}
          </button>
          <div>
            <div className="rapp-row rapp-gap8" style={{ alignItems:"center" }}>
              <div className="rapp-pg-title">{deckName}</div>
              {deckMeta[deckName]?.archived && (
                <span data-testid="archived-badge" style={{ fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:20, background:C.surface, border:`1px solid ${C.border}`, color:C.textMut, letterSpacing:"0.04em" }}>Archived</span>
              )}
            </div>
            <div className="rapp-pg-sub">{activeCount} card{activeCount!==1?"s":""}</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, position:"relative" }}>
          <button aria-label="Quick add a card with minimal fields" className="rapp-btn rapp-btn-ghost" style={{ padding:"7px 12px", fontSize:13 }}
            onClick={()=>{ setQuickAdd(q=>!q); setTimeout(()=>qaFrontRef.current?.focus(),50) }}>
            ⚡ Quick add
          </button>
          <button aria-label="Deck actions" className="rapp-btn rapp-btn-ghost" style={{ padding:"7px 12px", fontSize:13 }}
            onClick={()=>setShowDeckMenu(o=>!o)}>⋯</button>
          {showDeckMenu && (
            <div style={{ position:"absolute", right:0, top:"calc(100% + 6px)", background:C.elevated, border:`1px solid ${C.border}`, borderRadius:12, padding:6, minWidth:160, zIndex:10, boxShadow:"0 4px 16px rgba(28,40,32,0.12)" }}>
              {deckMeta[deckName]?.archived ? (
                <div
                  data-testid="deck-menu-unarchive"
                  onClick={()=>{ onArchiveDeck(deckName); setShowDeckMenu(false) }}
                  style={{ padding:"9px 14px", fontSize:13, cursor:"pointer", borderRadius:8, color:C.textSec, transition:"background 0.1s" }}
                  onMouseEnter={e=>e.currentTarget.style.background=C.surface}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  Unarchive deck
                </div>
              ) : (
                <div
                  data-testid="deck-menu-archive"
                  onClick={()=>{ setShowDeckMenu(false); setConfirmArchive(true) }}
                  style={{ padding:"9px 14px", fontSize:13, cursor:"pointer", borderRadius:8, color:C.textSec, transition:"background 0.1s" }}
                  onMouseEnter={e=>e.currentTarget.style.background=C.surface}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  Archive deck
                </div>
              )}
            </div>
          )}
          {confirmArchive && (
            <div data-testid="archive-confirm" style={{ position:"absolute", right:0, top:"calc(100% + 6px)", background:C.elevated, border:`1px solid ${C.border}`, borderRadius:12, padding:16, minWidth:220, zIndex:10, boxShadow:"0 4px 16px rgba(28,40,32,0.12)" }}>
              <div style={{ fontSize:13, color:C.text, marginBottom:12, lineHeight:1.5 }}>Archive <strong>{deckName}</strong>? It will be hidden from the library but can be restored.</div>
              <div style={{ display:"flex", gap:8 }}>
                <button className="rapp-btn rapp-btn-ghost" style={{ flex:1, fontSize:12 }} onClick={()=>setConfirmArchive(false)}>Cancel</button>
                <button data-testid="archive-confirm-ok" className="rapp-btn rapp-btn-primary" style={{ flex:1, fontSize:12 }}
                  onClick={()=>{ onArchiveDeck(deckName); setConfirmArchive(false) }}>Archive</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {quickAdd && (
        <div className="rapp-card rapp-mb16 rapp-fadein">
          <div style={{ fontSize:14, fontWeight:600, marginBottom:12 }}>Quick add</div>
          <input ref={qaFrontRef} className="rapp-input" placeholder="Front (question)" value={qaFront}
            onChange={e=>setQaFront(e.target.value)} style={{ marginBottom:8 }} />
          <textarea className="rapp-textarea" rows={2} placeholder="Back (answer)" value={qaBack}
            onChange={e=>setQaBack(e.target.value)} style={{ marginBottom:12 }} />
          <div style={{ display:"flex", gap:8 }}>
            <button className="rapp-btn rapp-btn-ghost" style={{ flex:1 }} onClick={saveAndAddAnother}
              disabled={!qaFront.trim()||!qaBack.trim()}>Save and add another</button>
            <button className="rapp-btn rapp-btn-primary" style={{ flex:1 }} onClick={saveQuickAdd}
              disabled={!qaFront.trim()||!qaBack.trim()}>Save</button>
          </div>
        </div>
      )}

      <div className="nid-deck-layout">
        {/* ── Left column: card list ─────────────────────────────── */}
        <div className="nid-deck-left">
          {/* Search + filter bar */}
          <div className="rapp-mb10">
            <input className="rapp-input" placeholder="Search cards..." value={search} onChange={e=>setSearch(e.target.value)} data-testid="deck-search" />
          </div>
          <div className="rapp-row rapp-gap8 rapp-mb10" style={{ flexWrap:"wrap", alignItems:"center" }}>
            {["active","archived","all"].map(f => (
              <button key={f} onClick={()=>setFilterSt(f)}
                style={{ padding:"5px 11px", borderRadius:8, border:`1px solid ${filterSt===f?C.accent:C.border}`, background:filterSt===f?C.accent:"transparent", color:filterSt===f?"#fff":C.textSec, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:"inherit", transition:"all 0.14s", textTransform:"capitalize" }}>
                {f}
              </button>
            ))}
            {deckContentTypes.length > 1 && (
              <select className="rapp-select" style={{ padding:"5px 10px", fontSize:12, height:"auto" }}
                value={filterContentType||""} onChange={e=>setFilterContentType(e.target.value||null)}>
                <option value="">All types</option>
                {deckContentTypes.map(t => <option key={t}>{t}</option>)}
              </select>
            )}
            {deckTagList.length > 0 && (
              <select className="rapp-select" style={{ padding:"5px 10px", fontSize:12, height:"auto" }}
                value={filterTag||""} onChange={e=>setFilterTag(e.target.value||null)}>
                <option value="">All tags</option>
                {deckTagList.map(t => <option key={t}>{t}</option>)}
              </select>
            )}
            <select className="rapp-select" style={{ padding:"5px 10px", fontSize:12, height:"auto", marginLeft:"auto" }}
              value={sortBy} onChange={e=>setSortBy(e.target.value)} data-testid="sort-select">
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Card list */}
          {cardsLoading && deckCards.length === 0 ? (
            <CardSkeleton count={5} />
          ) : filtered.length === 0 ? (
            search ? (
              <EmptyState icon="🔍" title="No cards match" body={`No cards contain "${search}".`} />
            ) : deckCards.length === 0 ? (
              <EmptyState icon="🃏" title="No cards yet" body="Use the panel on the right to add your first card to this deck." />
            ) : (
              <EmptyState icon="🔍" title="No cards match this filter" body="Try a different filter or search term." />
            )
          ) : (
            <CardList
              filtered={filtered}
              editCard={editCard}
              onCardClick={handleCardRowClick}
              onArchiveCard={handleArchiveCard}
              isArch={isArch}
              isLeech={isLeech}
              listRef={cardListRef}
            />
          )}
        </div>

        {/* ── Right column: Add card / Edit card ─────────────────── */}
        <div className="nid-deck-right" data-testid="deck-right-panel">
          {editCard ? (
            <div className="nid-deck-right-panel">
              <div className="rapp-row rapp-sb rapp-mb16" style={{ alignItems:"center" }}>
                <div style={{ fontSize:14, fontWeight:600, color:C.text }}>Edit card</div>
                <button aria-label="Close editor" onClick={()=>setEditCard(null)} style={{ background:"none", border:"none", cursor:"pointer", color:C.textMut, fontSize:18, lineHeight:1, padding:4 }}>✕</button>
              </div>
              <EditCardModal
                card={editCard}
                cards={cards}
                onUpdateCards={async (updated) => { await onUpdateCards(updated); setEditCard(null) }}
                decks={decks}
                onClose={()=>setEditCard(null)}
                onSaveHistory={storage.saveCardHistory}
                inline
              />
            </div>
          ) : (
            <div className="nid-deck-right-panel">
              <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:14 }}>Add card</div>
              {addFormContent}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const CARD_VIRTUAL_THRESHOLD = 100

function CardList({ filtered, editCard, onCardClick, onArchiveCard, isArch, isLeech, listRef }) {
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 68,
    overscan: 8,
    enabled: filtered.length > CARD_VIRTUAL_THRESHOLD,
  })

  const renderRow = (c) => {
    const front80 = c.front.length > 80 ? c.front.slice(0, 80) + "…" : c.front
    const isSelected = editCard?.id === c.id
    return (
      <div
        className={`nid-card-row${isSelected ? " selected" : ""}`}
        data-testid={`card-row-${c.id}`}
        onClick={() => onCardClick(c)}
      >
        <div style={{ flex:1, minWidth:0 }}>
          <div className="nid-card-row-front">{front80}</div>
          <div className="nid-card-row-meta">
            {c.contentType && <span className="nid-ct-chip" style={{ marginBottom:0, fontSize:10, padding:"1px 7px" }}>{c.contentType}</span>}
            {c.stakes_flag && <span title="High-stakes" style={{ color:C.accent, fontSize:13 }}>★</span>}
            {c.lastReview && <span className="nid-card-row-date">Last: {c.lastReview}</span>}
            {c.nextReview && <span className="nid-card-row-date">Due: {c.nextReview}</span>}
            {!c.nextReview && isActive(c) && <span style={{ fontSize:11, color:C.accent, fontWeight:500 }}>New</span>}
            {isArch(c) && <span style={{ fontSize:11, color:C.textMut }}>Archived</span>}
            {isActive(c) && isLeech(c) && <span className="rapp-leech">leech</span>}
          </div>
        </div>
        <div onClick={e=>e.stopPropagation()} style={{ display:"flex", flexShrink:0, alignItems:"center" }}>
          <button onClick={e=>onArchiveCard(c.id,e)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:11, color:C.textMut, padding:"6px 6px", fontFamily:"inherit" }}>
            {isArch(c)?"Unarchive":"Archive"}
          </button>
        </div>
      </div>
    )
  }

  if (filtered.length <= CARD_VIRTUAL_THRESHOLD) {
    return (
      <div className="rapp-col" style={{ gap:8 }} data-testid="card-list">
        {filtered.map(c => <div key={c.id}>{renderRow(c)}</div>)}
      </div>
    )
  }

  return (
    <div ref={listRef} style={{ height: "calc(100vh - 320px)", minHeight:240, overflowY:"auto" }} data-testid="card-list">
      <div style={{ height: virtualizer.getTotalSize(), position:"relative" }}>
        {virtualizer.getVirtualItems().map(vi => (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            style={{ position:"absolute", top:0, left:0, width:"100%", transform:`translateY(${vi.start}px)`, paddingBottom:8 }}
          >
            {renderRow(filtered[vi.index])}
          </div>
        ))}
      </div>
    </div>
  )
}
