import { useState } from "react"
import * as storage from "@/api/storage"
import { C, FRONT_MAX, BACK_MAX, SOURCE_MAX } from "@/lib/theme"
import { Ico } from "@/lib/icons"
import { CharCount } from "@/components/CharCount"
import { TagInput } from "@/components/TagInput"
import { NoteToggle } from "@/components/NoteToggle"
import { AnchorToggle } from "@/components/AnchorToggle"
import { CardPicker } from "@/components/CardPicker"
import { AIDiffModal } from "@/modals/AIDiffModal"
import { CardHistoryModal } from "@/modals/CardHistoryModal"

export function EditCardModal({ card, cards, onUpdateCards, onClose, decks, onSaveHistory }) {
  const [form, setForm]           = useState({ front:card.front||"", back:card.back||"", tags:card.tags||[], note:card.elaboration||"", anchor:card.anchor||"", source:card.source||"", contentType:card.contentType||"Factual", stakesFlag:card.stakes_flag||false, connects_to:card.connects_to||[], prerequisite_card_id:card.prerequisite_card_id||null })
  const [showNote, setShowNote]   = useState(!!(card.elaboration))
  const [showAnchor, setShowAnchor] = useState(!!(card.anchor))
  const [showConnects, setShowConnects] = useState(!!(card.connects_to?.length))
  const [showPrereq, setShowPrereq]     = useState(!!(card.prerequisite_card_id))
  const [confirmDel, setConfirmDel] = useState(false)
  const [aiPrompt, setAiPrompt]     = useState("")
  const [aiOpen, setAiOpen]         = useState(false)
  const [aiLoading, setAiLoading]   = useState(false)
  const [aiProposal, setAiProposal] = useState(null)
  const [aiError, setAiError]       = useState(null)
  const [showHistory, setShowHistory] = useState(false)

  const handleAiRequest = async () => {
    if (!aiPrompt.trim()) return
    setAiLoading(true); setAiError(null); setAiProposal(null)
    try {
      const { requestAIEdit } = await import('@/api/aiAssist.js')
      const result = await requestAIEdit({ ...card, ...form }, aiPrompt)
      setAiProposal(result)
    } catch (err) {
      if (err.message.startsWith("CITATION_REFUSED:")) {
        setAiError("Citations must be added manually. Paste a PMID, DOI, or URL and the system will fetch the metadata.")
      } else {
        setAiError(err.message || "AI request failed. Try again.")
      }
    }
    setAiLoading(false)
  }

  const handleApplyAiProposal = async () => {
    if (!aiProposal) return
    const snapshot = { front: card.front, back: card.back, elaboration: card.elaboration, source: card.source, tags: card.tags }
    if (onSaveHistory) {
      try { await onSaveHistory(card.id, snapshot, "ai", aiProposal.model) } catch (_) {}
    }
    setForm(f => ({ ...f, front: aiProposal.proposed.front, back: aiProposal.proposed.back, ai_edited: true }))
    setAiProposal(null); setAiOpen(false); setAiPrompt("")
  }

  const handleSave = async () => {
    if (!form.front.trim() || !form.back.trim()) return
    const prereq = form.prerequisite_card_id === card.id ? null : form.prerequisite_card_id
    await onUpdateCards(cards.map(c => c.id===card.id ? { ...c, front:form.front, back:form.back, tags:form.tags, elaboration:form.note, anchor:form.anchor.trim()||null, source:form.source.trim()||null, contentType:form.contentType, stakes_flag:form.stakesFlag, connects_to:form.connects_to, prerequisite_card_id:prereq } : c))
    onClose()
  }
  const handleDelete = async () => {
    const deletedId = card.id
    const updated = cards
      .filter(c => c.id !== deletedId)
      .map(c => ({
        ...c,
        connects_to: (c.connects_to || []).filter(id => id !== deletedId),
        prerequisite_card_id: c.prerequisite_card_id === deletedId ? null : c.prerequisite_card_id,
      }))
    if (card.status === "Active") storage.adjustDeckCount(card.deck, -1).catch(()=>{})
    await onUpdateCards(updated); onClose()
  }
  const handleArchive = async () => {
    const next = card.status==="Archived" ? "Active" : "Archived"
    if (next === "Archived") storage.adjustDeckCount(card.deck, -1).catch(()=>{})
    else storage.adjustDeckCount(card.deck, 1).catch(()=>{})
    await onUpdateCards(cards.map(c => c.id===card.id ? { ...c, status:next } : c)); onClose()
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(28,40,32,0.45)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}
      className="rapp-modal-backdrop" onClick={e=>{ if(e.target===e.currentTarget) onClose() }}>
      <div style={{ background:C.surface, borderRadius:22, width:"100%", maxWidth:480, maxHeight:"90vh", overflowY:"auto", padding:"28px 24px 36px", boxShadow:"0 8px 40px rgba(28,40,32,0.18)" }}
        className="rapp-modal-inner">
        <div className="rapp-row rapp-sb rapp-mb20">
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <span style={{ fontSize:15, fontWeight:600, color:C.text }}>Edit card</span>
            {card.contentType && <span className="nid-ct-chip" style={{ marginBottom:0 }}>{card.contentType}</span>}
            {card.ai_edited && (
              <span className="nid-ai-badge" title="AI-edited. Click to view history." onClick={()=>setShowHistory(true)}>AI edited</span>
            )}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {card.ai_edited && (
              <button onClick={()=>setShowHistory(true)} style={{ background:"none", border:`1px solid ${C.border}`, cursor:"pointer", fontSize:11, color:C.textSec, borderRadius:6, padding:"3px 8px", fontFamily:"inherit" }}>History</button>
            )}
            <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:C.textMut }}>×</button>
          </div>
        </div>

        {decks.length > 1 && (
          <div className="rapp-mb14">
            <label className="rapp-label">Deck</label>
            <select className="rapp-select" value={form.deck||card.deck||decks[0]} onChange={e=>setForm(f=>({...f,deck:e.target.value}))}>
              {decks.map(d=><option key={d}>{d}</option>)}
            </select>
          </div>
        )}

        <div className="rapp-mb12">
          <label className="rapp-label">Front</label>
          <textarea className="rapp-textarea" rows={3} value={form.front} maxLength={FRONT_MAX}
            onChange={e=>setForm(f=>({...f,front:e.target.value}))} />
          <CharCount current={form.front.length} max={FRONT_MAX} />
        </div>
        <div className="rapp-mb12">
          <label className="rapp-label">Back</label>
          <textarea className="rapp-textarea" rows={4} value={form.back} maxLength={BACK_MAX}
            onChange={e=>setForm(f=>({...f,back:e.target.value}))} />
          <CharCount current={form.back.length} max={BACK_MAX} />
        </div>
        <div className="rapp-mb12">
          <label className="rapp-label">Tags</label>
          <TagInput tags={form.tags} onChange={t=>setForm(f=>({...f,tags:t}))} />
        </div>

        <div className="rapp-mb12">
          <label className="rapp-label">Type</label>
          <select className="rapp-select" value={form.contentType} onChange={e=>setForm(f=>({...f,contentType:e.target.value}))}>
            {["Factual","Mechanism","Clinical Reasoning","Anatomy","Pathology"].map(t=><option key={t}>{t}</option>)}
          </select>
        </div>

        <div className="rapp-mb12">
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
        <div className="rapp-mb12">
          <div className="nid-note-toggle" onClick={()=>setShowConnects(o=>!o)}>
            {Ico.chevron(13, showConnects)}
            <span>Connects to</span>
            <span style={{ fontSize:11, color:C.textMut, marginLeft:4 }}>(optional)</span>
            {form.connects_to.length > 0 && !showConnects && <span style={{ fontSize:11, color:C.accent, marginLeft:6 }}>● {form.connects_to.length}</span>}
          </div>
          {showConnects && (
            <div className="rapp-fadein" style={{ marginTop:8 }}>
              <CardPicker allCards={cards.filter(c=>c.id!==card.id)} value={form.connects_to} onChange={v=>setForm(f=>({...f,connects_to:v}))} mode="multi" excludeId={card.id} placeholder="Search cards to link…" />
            </div>
          )}
        </div>
        {cards.filter(c=>c.id!==card.id).length > 0 && (
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
                <CardPicker allCards={cards.filter(c=>c.id!==card.id)} value={form.prerequisite_card_id} onChange={v=>setForm(f=>({...f,prerequisite_card_id:v}))} mode="single" excludeId={card.id} placeholder="Search for prerequisite card…" />
              </div>
            )}
          </div>
        )}

        {/* AI assist */}
        <div style={{ marginBottom:14 }}>
          {!aiOpen ? (
            <button onClick={()=>setAiOpen(true)}
              style={{ width:"100%", padding:"9px 0", borderRadius:10, border:`1px solid ${C.border}`, background:"transparent",
                color:C.textSec, fontSize:12, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center" }}>
              AI assist
            </button>
          ) : (
            <div style={{ background:C.elevated, borderRadius:12, padding:"14px 14px 10px" }}>
              <div style={{ fontSize:12, fontWeight:600, color:C.text, marginBottom:8 }}>AI assist</div>
              <p style={{ fontSize:11, color:C.textMut, marginBottom:8, lineHeight:1.6 }}>
                Describe how to improve this card. Citations must be added manually (LLMs hallucinate medical references at rates above 30%: Alkaissi and McFarlane, Am J Case Rep 2023; Thirunavukarasu et al., Lancet Digit Health 2023).
              </p>
              {aiError && (
                <div style={{ background:"#FDF0DC", border:"1px solid #E8C880", borderRadius:8, padding:"8px 12px", fontSize:12, color:"#5C3A00", marginBottom:8 }}>{aiError}</div>
              )}
              <textarea className="rapp-textarea" rows={2} value={aiPrompt}
                onChange={e=>setAiPrompt(e.target.value)}
                placeholder="e.g. Make the question more concise and improve the recall cue." />
              <div style={{ display:"flex", gap:8, marginTop:8 }}>
                <button onClick={handleAiRequest} disabled={!aiPrompt.trim()||aiLoading}
                  style={{ flex:1, padding:"8px", borderRadius:8, border:"none", background:C.accent, color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit", opacity:aiLoading?0.6:1 }}>
                  {aiLoading ? "Thinking..." : "Suggest edit"}
                </button>
                <button onClick={()=>{ setAiOpen(false); setAiError(null); setAiProposal(null); setAiPrompt("") }}
                  style={{ padding:"8px 12px", borderRadius:8, border:`1px solid ${C.border}`, background:"transparent", color:C.textSec, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        {aiProposal && (
          <AIDiffModal
            original={{ front: form.front, back: form.back }}
            proposed={aiProposal.proposed}
            isClinical={aiProposal.isClinical}
            onApprove={handleApplyAiProposal}
            onEdit={(f) => { setForm(prev => ({ ...prev, ...f, ai_edited: true })); setAiProposal(null); setAiOpen(false); setAiPrompt("") }}
            onReject={() => setAiProposal(null)}
          />
        )}
        {showHistory && (
          <CardHistoryModal
            cardId={card.id}
            card={{ front: form.front, back: form.back }}
            onClose={() => setShowHistory(false)}
            onRevert={(snap) => {
              setForm(prev => ({ ...prev, front: snap.front || prev.front, back: snap.back || prev.back }))
              setShowHistory(false)
            }}
          />
        )}
        <button className="rapp-btn rapp-btn-primary rapp-mb12" style={{ width:"100%" }}
          onClick={handleSave} disabled={!form.front.trim()||!form.back.trim()}>
          Save changes
        </button>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={handleArchive}
            style={{ flex:1, padding:"10px", borderRadius:10, border:`1px solid ${C.border}`, background:"transparent", color:C.textSec, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
            {card.status==="Archived"?"Unarchive":"Archive"}
          </button>
          {!confirmDel ? (
            <button onClick={()=>setConfirmDel(true)}
              style={{ flex:1, padding:"10px", borderRadius:10, border:`1px solid #E8B0A0`, background:"transparent", color:C.again, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
              Delete
            </button>
          ) : (
            <button onClick={handleDelete}
              style={{ flex:1, padding:"10px", borderRadius:10, border:"none", background:C.againBg, color:C.again, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
              Confirm delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
