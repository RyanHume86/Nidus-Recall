import { useState, useEffect, useRef } from "react"
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
import { ImageOcclusionEditor } from "@/components/ImageOcclusionEditor"
import { EditCardModal } from "@/modals/EditCardModal"

export function DeckView({ deckName, cards, onUpdateCards, onBack, decks, settings, onArchiveDeck }) {
  const [form, setForm]           = useState({ front:"", back:"", tags:[], note:"", anchor:"", source:"", contentType:"Factual", stakesFlag:false, connects_to:[], prerequisite_card_id:null })
  const [addMode, setAddMode]     = useState("basic") // "basic" | "cloze" | "occlusion"
  const [clozeText, setClozeText] = useState("")
  const [showOcclusionEditor, setShowOcclusionEditor] = useState(false)
  const [showNote, setShowNote]   = useState(false)
  const [showAnchor, setShowAnchor] = useState(false)
  const [showConnects, setShowConnects] = useState(false)
  const [showPrereq, setShowPrereq]     = useState(false)
  const [search, setSearch]       = useState("")
  const [filterSt, setFilterSt] = useState("active")
  const [groupBySource, setGroupBySource] = useState(false)
  const [editCard, setEditCard] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [saved, setSaved]       = useState(false)
  const [showDeckMenu, setShowDeckMenu] = useState(false)
  const [quickAdd, setQuickAdd] = useState(false)
  const [qaFront, setQaFront] = useState("")
  const [qaBack, setQaBack] = useState("")
  const qaFrontRef = useRef(null)
  const frontRef = useRef(null)
  const cardListRef = useRef(null)

  const leechThreshold = (settings||{}).leechThreshold || 5
  const isLeech = c => (c.lapses||0) >= leechThreshold
  const isArch  = c => c.status==="Archived"||c.status==="Parked"

  const deckCards = cards.filter(c => c.deck === deckName)
  const activeCount = deckCards.filter(isActive).length

  const filtered = deckCards
    .filter(c => filterSt==="active" ? isActive(c) : filterSt==="archived" ? isArch(c) : true)
    .filter(c => !search || c.front.toLowerCase().includes(search.toLowerCase()) || (c.back||"").toLowerCase().includes(search.toLowerCase()) || (c.anchor||"").toLowerCase().includes(search.toLowerCase()) || (c.source||"").toLowerCase().includes(search.toLowerCase()))

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
    storage.adjustDeckCount(deckName, 1).catch(()=>{})
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
    storage.adjustDeckCount(deckName, 1).catch(()=>{})
    setQaFront(""); setQaBack(""); setQuickAdd(false)
  }

  const saveAndAddAnother = async () => {
    if (!qaFront.trim() || !qaBack.trim()) return
    const card = createQuickCard()
    await onUpdateCards([...cards, card])
    storage.adjustDeckCount(deckName, 1).catch(()=>{})
    setQaFront(""); setQaBack("")
    setTimeout(() => qaFrontRef.current?.focus(), 50)
  }

  const handleArchiveCard = async (id, e) => {
    e.stopPropagation()
    await onUpdateCards(cards.map(c => c.id===id ? { ...c, status:isArch(c)?"Active":"Archived" } : c))
  }

  const canAdd = form.front.trim() && form.back.trim()

  return (
    <div className="rapp-wrap rapp-fadein">
      {editCard && <EditCardModal card={editCard} cards={cards} onUpdateCards={onUpdateCards} decks={decks} onClose={()=>setEditCard(null)} onSaveHistory={storage.saveCardHistory} />}

      {/* Header */}
      <div className="rapp-row rapp-sb rapp-mb24">
        <div className="rapp-row rapp-gap8">
          <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:C.textMut, padding:"4px 8px 4px 0", display:"flex", alignItems:"center" }}>
            {Ico.back(18)}
          </button>
          <div>
            <div className="rapp-pg-title">{deckName}</div>
            <div className="rapp-pg-sub">{activeCount} card{activeCount!==1?"s":""}</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, position:"relative" }}>
          <button className="rapp-btn rapp-btn-ghost" style={{ padding:"7px 12px", fontSize:13 }}
            onClick={()=>{ setQuickAdd(q=>!q); setTimeout(()=>qaFrontRef.current?.focus(),50) }}>
            ⚡ Quick add
          </button>
          <button className="rapp-btn rapp-btn-ghost" style={{ padding:"7px 12px", fontSize:13 }}
            onClick={()=>setShowDeckMenu(o=>!o)}>⋯</button>
          {showDeckMenu && (
            <div style={{ position:"absolute", right:0, top:"calc(100% + 6px)", background:C.elevated, border:`1px solid ${C.border}`, borderRadius:12, padding:6, minWidth:160, zIndex:10, boxShadow:"0 4px 16px rgba(28,40,32,0.12)" }}>
              {[
                { label:"Archive deck", action:()=>{ onArchiveDeck(deckName); setShowDeckMenu(false) } },
                { label:"Sync card count", action:()=>{ storage.recalculateDeckCount(deckName, cards).catch(()=>{}); setShowDeckMenu(false) } },
              ].map((item,i) => (
                <div key={i} onClick={item.action}
                  style={{ padding:"9px 14px", fontSize:13, cursor:"pointer", borderRadius:8, color:C.textSec, transition:"background 0.1s" }}
                  onMouseEnter={e=>e.currentTarget.style.background=C.surface}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  {item.label}
                </div>
              ))}
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

      {/* Add card form */}
      <div className="rapp-card rapp-mb24">
        <div className="rapp-row rapp-sb" style={{ marginBottom:12, alignItems:"center" }}>
          <div className="rapp-sec-title" style={{ marginBottom:0 }}>Add card</div>
          <div style={{ display:"flex", gap:4 }}>
            {["basic","cloze","occlusion"].map(m => (
              <button key={m} onClick={()=>setAddMode(m)}
                style={{ padding:"4px 10px", borderRadius:6, border:`1px solid ${addMode===m?C.accent:C.border}`, background:addMode===m?C.accent:"transparent", color:addMode===m?"#fff":C.textSec, fontSize:11, fontWeight:500, cursor:"pointer", fontFamily:"inherit", transition:"all 0.12s", textTransform:"capitalize" }}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {addMode === "basic" && <>
        <div className="rapp-mb10" style={{ marginBottom:10 }}>
          <label className="rapp-label">Front</label>
          <textarea ref={frontRef} className="rapp-textarea" rows={2} value={form.front} maxLength={FRONT_MAX}
            onChange={e=>setForm(f=>({...f,front:e.target.value}))}
            placeholder="Question or prompt that forces retrieval."
            onKeyDown={e=>{ if(e.key==="Tab"){ e.preventDefault(); /** @type {HTMLElement|null} */ (document.querySelector(".nid-back-input"))?.focus() }}} />
          <CharCount current={form.front.length} max={FRONT_MAX} />
        </div>

        <div className="rapp-mb10" style={{ marginBottom:10 }}>
          <label className="rapp-label">Back</label>
          <textarea className="rapp-textarea nid-back-input" rows={2} value={form.back} maxLength={BACK_MAX}
            onChange={e=>setForm(f=>({...f,back:e.target.value}))}
            placeholder="Concise answer: one idea only." />
          <CharCount current={form.back.length} max={BACK_MAX} />
        </div>

        <div className="rapp-mb10" style={{ marginBottom:10 }}>
          <label className="rapp-label">Tags</label>
          <TagInput tags={form.tags} onChange={t=>setForm(f=>({...f,tags:t}))} />
        </div>

        <div className="rapp-mb10" style={{ marginBottom:10 }}>
          <label className="rapp-label">Type</label>
          <select className="rapp-select" value={form.contentType} onChange={e=>setForm(f=>({...f,contentType:e.target.value}))}>
            {["Factual","Mechanism","Clinical Reasoning","Anatomy","Pathology"].map(t=><option key={t}>{t}</option>)}
          </select>
        </div>

        <div className="rapp-mb10" style={{ marginBottom:10 }}>
          <label className="rapp-label">Source (optional)</label>
          <input className="rapp-input" value={form.source} maxLength={SOURCE_MAX}
            onChange={e=>setForm(f=>({...f,source:e.target.value}))}
            placeholder="Article, chapter, guideline, or lecture this card came from." />
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
        {deckCards.length > 0 && (
          <>
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
          </>
        )}

        </>
        }
        {addMode === "basic" && (
          <div className="rapp-row rapp-gap8">
            <button className="rapp-btn rapp-btn-primary rapp-flex1" onClick={handleAdd} disabled={!canAdd}>
              {saved ? "✓ Saved" : "Add card"}
            </button>
          </div>
        )}
        {addMode === "cloze" && (
          <div className="rapp-fadein">
            <div className="rapp-mb10">
              <label className="rapp-label">Cloze text
                <span style={{ marginLeft:6, fontSize:11, fontWeight:400, color:C.textMut, cursor:"default" }}
                  title="Cloze cards force retrieval of the hidden span, which improves long-term retention more than recognition-style review (Roediger and Karpicke, Psychol Sci 2006).">ⓘ</span>
              </label>
              <textarea className="rapp-textarea" rows={3} value={clozeText}
                onChange={e=>setClozeText(e.target.value)}
                placeholder="Type {{c1::answer}} to mark a deletion. Example: The heart rate is controlled by the {{c1::sinoatrial node}}." />
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
                storage.adjustDeckCount(deckName, newCards.length).catch(()=>{})
                setClozeText("")
                setSaved(true); setTimeout(()=>setSaved(false), 1200)
              }}>
              {saved ? "✓ Saved" : `Create ${parseCloze(clozeText).indices.length} cloze card${parseCloze(clozeText).indices.length!==1?"s":""}`}
            </button>
          </div>
        )}
        {addMode === "occlusion" && (
          <div className="rapp-fadein">
            <ImageOcclusionEditor onSave={async (imgUrl, regions) => {
              const newCards = createOcclusionCards(imgUrl, regions, deckName)
              await onUpdateCards([...cards, ...newCards])
              storage.adjustDeckCount(deckName, newCards.length).catch(()=>{})
              setAddMode("basic")
              setSaved(true); setTimeout(()=>setSaved(false), 1200)
            }} />
          </div>
        )}
      </div>

      {/* Search + filter */}
      <div className="rapp-mb12">
        <input className="rapp-input" placeholder="Search cards..." value={search} onChange={e=>setSearch(e.target.value)} />
      </div>
      <div className="rapp-row rapp-gap8 rapp-mb16" style={{ flexWrap:"wrap" }}>
        {["active","archived","all"].map(f => (
          <button key={f} onClick={()=>setFilterSt(f)}
            style={{ padding:"6px 13px", borderRadius:8, border:`1px solid ${filterSt===f?C.accent:C.border}`, background:filterSt===f?C.accent:"transparent", color:filterSt===f?"#fff":C.textSec, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:"inherit", transition:"all 0.14s", textTransform:"capitalize" }}>
            {f}
          </button>
        ))}
        <button onClick={()=>setGroupBySource(o=>!o)}
          style={{ padding:"6px 13px", borderRadius:8, border:`1px solid ${groupBySource?C.accent:C.border}`, background:groupBySource?C.accent:"transparent", color:groupBySource?"#fff":C.textSec, fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:"inherit", transition:"all 0.14s", marginLeft:"auto" }}>
          Group by source
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rapp-empty">{search?"No cards match that search.":deckCards.length===0?"No cards yet. Add your first card above.":"No cards match this filter."}</div>
      ) : groupBySource ? (() => {
        const groups = {}
        for (const c of filtered) {
          const key = c.source?.trim() || ""
          ;(groups[key] || (groups[key] = [])).push(c)
        }
        const sorted = [...Object.keys(groups)].sort((a,b) => {
          if (!a) return 1; if (!b) return -1; return a.localeCompare(b)
        })
        return (
          <div className="rapp-col" style={{ gap:20 }}>
            {sorted.map(src => (
              <div key={src||"__none"}>
                <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.8px", color:C.textMut, marginBottom:8, paddingLeft:2 }}>
                  {src || "No source"}
                  <span style={{ marginLeft:6, fontWeight:400, textTransform:"none", letterSpacing:0 }}>({groups[src].length})</span>
                </div>
                <div className="rapp-col" style={{ gap:10 }}>
                  {groups[src].map(c => (
            <div key={c.id} className="rapp-card-item" onClick={()=>setExpanded(expanded===c.id?null:c.id)}>
              <div className="rapp-row rapp-sb" style={{ gap:10 }}>
                <p className="rapp-card-item-q" style={{ flex:1 }}>{c.front}</p>
                <div className="rapp-row rapp-gap8" style={{ flexShrink:0 }} onClick={e=>e.stopPropagation()}>
                  <button onClick={()=>setEditCard(c)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:C.textMut, padding:"8px 6px", fontFamily:"inherit" }}>Edit</button>
                  <button onClick={e=>handleArchiveCard(c.id,e)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:C.textMut, padding:"8px 6px", fontFamily:"inherit" }}>
                    {isArch(c)?"Unarchive":"Archive"}
                  </button>
                  {Ico.chevron(14, expanded===c.id)}
                </div>
              </div>
              <div className="rapp-row rapp-mt8" style={{ gap:6, flexWrap:"wrap" }}>
                {(c.tags||[]).map((t,i) => <span key={i} className="nid-tag">{t}</span>)}
                {c.nextReview && <span className="rapp-ts">· Due {c.nextReview}</span>}
                {!c.nextReview && isActive(c) && <span style={{ fontSize:12, color:C.accent, fontWeight:500 }}>· New</span>}
                {isArch(c) && <span style={{ fontSize:12, color:C.textMut }}>· Archived</span>}
                {isActive(c) && isLeech(c) && <span className="rapp-leech">leech</span>}
              </div>
              {expanded===c.id && (
                <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${C.border}` }} className="rapp-fadein">
                  <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.8px", color:C.textMut, marginBottom:6 }}>Answer</p>
                  <p style={{ fontSize:14, color:C.textSec, lineHeight:1.75, whiteSpace:"pre-wrap", marginBottom:12 }}>{c.back}</p>
                  {c.elaboration && (
                    <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
                      <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.8px", color:C.textMut, marginBottom:6 }}>Note</p>
                      <p style={{ fontSize:13, color:C.textSec, fontStyle:"italic", lineHeight:1.65 }}>{c.elaboration}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      ))}
    </div>
  )
})() : (
  <CardFlatList
    filtered={filtered}
    expanded={expanded}
    setExpanded={setExpanded}
    setEditCard={setEditCard}
    handleArchiveCard={handleArchiveCard}
    isArch={isArch}
    isLeech={isLeech}
    listRef={cardListRef}
  />
)}
    </div>
  )
}

const CARD_VIRTUAL_THRESHOLD = 100

function CardFlatList({ filtered, expanded, setExpanded, setEditCard, handleArchiveCard, isArch, isLeech, listRef }) {
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 82,
    overscan: 8,
    enabled: filtered.length > CARD_VIRTUAL_THRESHOLD,
  })

  const renderCard = (c) => (
    <div className="rapp-card-item" onClick={()=>setExpanded(expanded===c.id?null:c.id)}>
      <div className="rapp-row rapp-sb" style={{ gap:10 }}>
        <p className="rapp-card-item-q" style={{ flex:1 }}>{c.front}</p>
        <div className="rapp-row rapp-gap8" style={{ flexShrink:0 }} onClick={e=>e.stopPropagation()}>
          <button onClick={()=>setEditCard(c)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:C.textMut, padding:"8px 6px", fontFamily:"inherit" }}>Edit</button>
          <button onClick={e=>handleArchiveCard(c.id,e)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:C.textMut, padding:"8px 6px", fontFamily:"inherit" }}>
            {isArch(c)?"Unarchive":"Archive"}
          </button>
          {Ico.chevron(14, expanded===c.id)}
        </div>
      </div>
      <div className="rapp-row rapp-mt8" style={{ gap:6, flexWrap:"wrap", alignItems:"center" }}>
        {c.contentType && <span className="nid-ct-chip" style={{ marginBottom:0 }}>{c.contentType}</span>}
        {(c.tags||[]).map((t,i) => <span key={i} className="nid-tag">{t}</span>)}
        {c.nextReview && <span className="rapp-ts">· Due {c.nextReview}</span>}
        {!c.nextReview && isActive(c) && <span style={{ fontSize:12, color:C.accent, fontWeight:500 }}>· New</span>}
        {isArch(c) && <span style={{ fontSize:12, color:C.textMut }}>· Archived</span>}
        {isActive(c) && isLeech(c) && <span className="rapp-leech">leech</span>}
      </div>
      {expanded===c.id && (
        <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${C.border}` }} className="rapp-fadein">
          <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.8px", color:C.textMut, marginBottom:6 }}>Answer</p>
          <p style={{ fontSize:14, color:C.textSec, lineHeight:1.75, whiteSpace:"pre-wrap", marginBottom:12 }}>{c.back}</p>
          {c.elaboration && (
            <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
              <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.8px", color:C.textMut, marginBottom:6 }}>Note</p>
              <p style={{ fontSize:13, color:C.textSec, fontStyle:"italic", lineHeight:1.65 }}>{c.elaboration}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )

  if (filtered.length <= CARD_VIRTUAL_THRESHOLD) {
    return (
      <div className="rapp-col" style={{ gap:10 }}>
        {filtered.map(c => <div key={c.id}>{renderCard(c)}</div>)}
      </div>
    )
  }

  return (
    <div
      ref={listRef}
      style={{ height: "calc(100vh - 540px)", minHeight: 240, overflowY: "auto" }}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map(vi => (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start}px)`, paddingBottom: 10 }}
          >
            {renderCard(filtered[vi.index])}
          </div>
        ))}
      </div>
    </div>
  )
}
