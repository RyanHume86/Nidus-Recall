import { useState, useRef } from "react"
import { C } from "@/lib/theme"
import { Ico } from "@/lib/icons"
import { notionGet, notionSet } from "@/lib/settings"
import { genId } from "@/lib/dates"
import * as excel from "@/api/excel"
import * as notion from "@/api/notion"

let ankiModule = null
const getAnkiModule = async () => {
  if (!ankiModule) ankiModule = await import('../api/anki.js')
  return ankiModule
}

function ImportExportPanel({ cards, onImportFile, onImportCards, onExport, onImportAnki }) {
  const [tab,          setTab]         = useState("notion")
  const [notionToken,  setNotionToken] = useState(()=>notionGet().token||"")
  const [notionDb,     setNotionDb]    = useState(()=>notionGet().db||"")
  const [notionStatus, setNotionStatus]= useState("")
  const [notionBusy,   setNotionBusy]  = useState(false)
  const [notionPct,    setNotionPct]   = useState(0)
  const [csvResult,    setCsvResult]   = useState(null)
  const [importResult, setImportResult]= useState(null)
  const [apkgPreview,    setApkgPreview]    = useState(null)
  const [apkgError,      setApkgError]      = useState(null)
  const [apkgImporting,  setApkgImporting]  = useState(false)
  const csvRef    = useRef(null)
  const backupRef = useRef(null)

  const saveNotion = (t,d) => notionSet({ token:t, db:d })
  const statusColor = s => !s?C.textMut:s.startsWith("✓")?C.accent:s.startsWith("✗")?C.again:C.textMut

  const testNotion = async () => {
    if (!notionToken.trim()||!notionDb.trim()) { setNotionStatus("Enter token and database ID first."); return }
    setNotionBusy(true); setNotionStatus("Testing...")
    try { const t = await notion.testConnection(notionToken.trim(), notionDb.trim()); setNotionStatus(`✓ Connected to "${t}"`) }
    catch(e) { setNotionStatus("✗ "+e.message) }
    setNotionBusy(false)
  }
  const exportNotion = async () => {
    const active = cards.filter(c=>c.status!=="Archived")
    setNotionBusy(true); setNotionStatus(`Exporting ${active.length} cards...`); setNotionPct(0)
    try { const n = await notion.exportToNotion(notionToken.trim(),notionDb.trim(),active,setNotionPct); setNotionStatus(`✓ Exported ${n} card${n!==1?"s":""}`) }
    catch(e) { setNotionStatus("✗ "+e.message) }
    setNotionBusy(false); setNotionPct(0)
  }
  const importNotion = async () => {
    setNotionBusy(true); setNotionStatus("Reading database...")
    try {
      const imported = await notion.importFromNotion(notionToken.trim(), notionDb.trim())
      if (!imported.length) { setNotionStatus("No valid cards found.") }
      else { onImportCards(imported, r => setNotionStatus(r.ok?`✓ Imported ${r.count} cards`:"✗ "+r.msg)) }
    } catch(e) { setNotionStatus("✗ "+e.message) }
    setNotionBusy(false)
  }

  const exportCsv = () => {
    try { excel.exportToExcel(cards); setCsvResult("✓ Downloaded") }
    catch(e) { setCsvResult("✗ "+e.message) }
  }
  const importCsv = file => {
    if (!file) return
    excel.importFromExcel(file)
      .then(imported => onImportCards(imported, r => setCsvResult(r.ok?`✓ Imported ${r.count} cards`:"✗ "+r.msg)))
      .catch(e => setCsvResult("✗ "+e.message))
  }

  const handleApkgSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setApkgError(null)
    try {
      const { parseApkg, convertToNidusCards } = await getAnkiModule()
      const parsed = await parseApkg(file)
      const { cards: converted, warnings } = convertToNidusCards(parsed.notes, genId)
      setApkgPreview({ ...parsed, convertedCards: converted, warnings })
    } catch (err) {
      setApkgError(`Parse failed: ${err.message}`)
    }
  }

  const handleApkgImport = async () => {
    if (!apkgPreview) return
    setApkgImporting(true)
    try {
      await onImportAnki(apkgPreview.convertedCards)
      setApkgPreview(null)
      setApkgError(null)
    } catch (err) {
      setApkgError(`Import failed: ${err.message}`)
    } finally {
      setApkgImporting(false)
    }
  }

  const TAB_BTN = (id, label) => (
    <button onClick={()=>setTab(id)}
      style={{ padding:"7px 14px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:500,
        background:tab===id?C.elevated:"transparent", color:tab===id?C.text:C.textMut,
        boxShadow:tab===id?`0 1px 4px rgba(28,40,32,0.08)`:"none", transition:"all 0.14s" }}>
      {label}
    </button>
  )

  return (
    <div>
      <div className="rapp-sec-title">Import &amp; Export</div>
      <div style={{ display:"flex", gap:4, background:C.bg, borderRadius:10, padding:3, marginBottom:20, flexWrap:"wrap" }}>
        {TAB_BTN("notion","Notion")}
        {TAB_BTN("excel", "Excel")}
        {TAB_BTN("backup","JSON backup")}
        {TAB_BTN("anki",  "Anki")}
      </div>

      {tab==="notion" && (
        <div className="rapp-fadein">
          <p style={{ fontSize:13, color:C.textSec, lineHeight:1.7, marginBottom:16 }}>
            Sync with a Notion database. Create an <strong>Internal Integration</strong> at notion.so/profile/integrations, then add it to your database via &#8943; Connections.
          </p>
          <div className="rapp-mb12">
            <label className="rapp-label">Integration token</label>
            <input className="rapp-input" type="password" placeholder="secret_..." value={notionToken}
              onChange={e=>{setNotionToken(e.target.value); saveNotion(e.target.value,notionDb)}} />
          </div>
          <div className="rapp-mb16">
            <label className="rapp-label">Database ID or URL</label>
            <input className="rapp-input" placeholder="Paste URL or 32-char ID" value={notionDb}
              onChange={e=>{setNotionDb(e.target.value); saveNotion(notionToken,e.target.value)}} />
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:14 }}>
            <button className="rapp-btn rapp-btn-ghost" style={{ padding:"9px 14px", fontSize:13 }} onClick={testNotion} disabled={notionBusy}>Test</button>
            <button className="rapp-btn rapp-btn-ghost" style={{ padding:"9px 14px", fontSize:13 }} onClick={importNotion} disabled={notionBusy}>&#8593; Import</button>
            <button className="rapp-btn rapp-btn-primary" style={{ padding:"9px 14px", fontSize:13 }} onClick={exportNotion} disabled={notionBusy||!cards.length}>&#8595; Export</button>
          </div>
          {notionBusy && notionPct>0 && <div className="rapp-progress rapp-mb8"><div className="rapp-progress-fill" style={{ width:`${notionPct}%` }}/></div>}
          {notionStatus && <p style={{ fontSize:13, color:statusColor(notionStatus), lineHeight:1.6 }}>{notionStatus}</p>}
        </div>
      )}

      {tab==="excel" && (
        <div className="rapp-fadein">
          <p style={{ fontSize:13, color:C.textSec, lineHeight:1.7, marginBottom:16 }}>
            Export all cards to <strong>.xlsx</strong>. Edit in Excel or Google Sheets, then re-import. All scheduling fields are preserved.
          </p>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
            <button className="rapp-btn rapp-btn-primary" style={{ padding:"9px 18px", fontSize:13 }} onClick={exportCsv}>&#8595; Download .xlsx</button>
            <button className="rapp-btn rapp-btn-ghost"   style={{ padding:"9px 18px", fontSize:13 }} onClick={()=>csvRef.current?.click()}>&#8593; Import .xlsx</button>
            <input ref={csvRef} type="file" accept=".xlsx,.xls,.ods,.csv" style={{ display:"none" }}
              onChange={e=>{ importCsv(e.target.files[0]); e.target.value="" }} />
          </div>
          {csvResult && <p style={{ fontSize:13, color:statusColor(csvResult) }}>{csvResult}</p>}
        </div>
      )}

      {tab==="backup" && (
        <div className="rapp-fadein">
          <p style={{ fontSize:13, color:C.textSec, lineHeight:1.7, marginBottom:16 }}>
            Full JSON backup including session history. Import <strong>replaces</strong> all current data.
          </p>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
            <button className="rapp-btn rapp-btn-ghost" style={{ padding:"9px 16px", fontSize:13 }} onClick={onExport}>&#8595; Export backup</button>
            <button className="rapp-btn rapp-btn-ghost" style={{ padding:"9px 16px", fontSize:13 }} onClick={()=>backupRef.current?.click()}>&#8593; Import backup</button>
            <input ref={backupRef} type="file" accept=".json" style={{ display:"none" }}
              onChange={e=>{ onImportFile(e.target.files[0], r=>setImportResult(r)); e.target.value="" }} />
          </div>
          {importResult && (
            <div style={{ padding:"10px 14px", borderRadius:10, fontSize:13,
              background:importResult.ok?C.goodBg:C.againBg,
              color:importResult.ok?C.good:C.again,
              border:`1px solid ${importResult.ok?"#90D8B0":"#E8B0A0"}` }}>
              {importResult.ok?`✓ Imported ${importResult.count} cards`:`✗ ${importResult.msg}`}
            </div>
          )}
        </div>
      )}

      {tab==="anki" && (
        <div className="rapp-fadein">
          {!apkgPreview ? (
            <div className="rapp-card">
              <div style={{ fontSize:14, fontWeight:600, marginBottom:8 }}>Import from Anki</div>
              <p style={{ fontSize:13, color:C.textSec, lineHeight:1.65, marginBottom:16 }}>
                Upload an Anki .apkg file to import decks, notes, and card content.
                Anki scheduling state (SM-2 intervals) is intentionally discarded:
                all imported cards start fresh with FSRS initial values, since SM-2 and
                FSRS parameters are not interchangeable. Tags and deck hierarchy are preserved.
              </p>
              <input type="file" accept=".apkg" onChange={handleApkgSelect} style={{ marginBottom:12, fontSize:13, color:C.text, fontFamily:"inherit", cursor:"pointer" }} />
              {apkgError && <p style={{ fontSize:12, color:C.again, marginTop:8 }}>{apkgError}</p>}
            </div>
          ) : (
            <div className="rapp-card">
              <div style={{ fontSize:14, fontWeight:600, marginBottom:12 }}>Import preview</div>
              <div style={{ fontSize:13, lineHeight:1.75, color:C.textSec }}>
                <p>Decks: <strong>{apkgPreview.summary.decks}</strong></p>
                <p>Basic cards: <strong>{apkgPreview.summary.basic}</strong></p>
                <p>Cloze cards: <strong>{apkgPreview.summary.cloze}</strong></p>
                <p>Image occlusion cards: <strong>{apkgPreview.summary.imageOcclusion}</strong> (imported as basic with warning)</p>
                <p>Unknown note types: <strong>{apkgPreview.summary.unknown}</strong></p>
              </div>
              {apkgPreview.warnings?.length > 0 && (
                <div style={{ marginTop:8, padding:"8px 12px", background:C.warningBg, borderRadius:8 }}>
                  <strong style={{ fontSize:12, color:C.warningText }}>Warnings ({apkgPreview.warnings.length}):</strong>
                  {apkgPreview.warnings.slice(0,5).map((w,i)=>(
                    <p key={i} style={{ fontSize:11, color:C.warningText, marginTop:4 }}>{w}</p>
                  ))}
                  {apkgPreview.warnings.length > 5 && (
                    <p style={{ fontSize:11, color:C.warningText, marginTop:4 }}>... and {apkgPreview.warnings.length - 5} more</p>
                  )}
                </div>
              )}
              {apkgError && <p style={{ fontSize:12, color:C.again, marginTop:8 }}>{apkgError}</p>}
              <div style={{ display:"flex", gap:8, marginTop:16 }}>
                <button className="rapp-btn rapp-btn-ghost" onClick={()=>{ setApkgPreview(null); setApkgError(null) }}>Cancel</button>
                <button className="rapp-btn rapp-btn-primary" onClick={handleApkgImport} disabled={apkgImporting}>
                  {apkgImporting ? "Importing..." : `Import ${apkgPreview.summary.totalNotes} notes`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function SettingsView({ settings, onUpdateSettings, cards, decks, onExport, onImport, onImportCards, onImportAnki, onRefitParams, schedulerParams }) {
  const {
    newCardCap=15, reviewCap=100, leechThreshold=5, retentionTarget=0.90, catchupDays=7,
    sleepBedtime=null, sleepWindowMinutes=90, sleepBannerEnabled=true, sleepPrefersReviews=true,
    matureModeEnabled=true, matureCardThreshold=30,
    fatigueAlertsEnabled=true, attentionDeclarationEnabled=true,
  } = settings||{}
  const [activeTab, setActiveTab] = useState("study")
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const TAB = (id, label) => (
    <button onClick={()=>setActiveTab(id)}
      style={{ padding:"7px 14px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:500,
        background:activeTab===id?C.elevated:"transparent", color:activeTab===id?C.text:C.textMut,
        boxShadow:activeTab===id?`0 1px 4px rgba(28,40,32,0.08)`:"none", transition:"all 0.14s" }}>
      {label}
    </button>
  )

  return (
    <div className="rapp-wrap rapp-fadein">
      <div className="rapp-mb24">
        <div className="rapp-pg-title">Settings</div>
      </div>

      <div style={{ display:"flex", gap:4, background:C.bg, borderRadius:10, padding:3, marginBottom:20 }}>
        {TAB("study", "Study")}
        {TAB("sleep", "Sleep")}
        {TAB("data",  "Data")}
      </div>

      {activeTab === "study" && (
        <div className="rapp-fadein">
          <div className="rapp-card rapp-mb16">
            <div className="rapp-sec-title">Daily limits</div>

            <div className="rapp-mb20">
              <div className="rapp-row rapp-sb rapp-mb8">
                <label className="rapp-label" style={{ marginBottom:0 }}>New cards per day</label>
                <span style={{ fontSize:16, fontWeight:700, color:C.text }}>{newCardCap}</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input type="range" className="rapp-slider" min={5} max={100} step={5} value={newCardCap}
                  onChange={e=>onUpdateSettings({...settings, newCardCap:Number(e.target.value)})} style={{ flex:1 }} />
                <input type="number" min={5} max={100} step={5} value={newCardCap}
                  onChange={e=>onUpdateSettings({...settings, newCardCap:Math.min(100, Math.max(5, +e.target.value||5))})}
                  style={{ width:56, textAlign:"right" }} className="rapp-input" />
              </div>
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>Start at 15 and raise once a sustainable routine is established. Reference: Wozniak, supermemo.com graduated introduction guidelines.</p>
            </div>

            <div className="rapp-mb20">
              <div className="rapp-row rapp-sb rapp-mb8">
                <label className="rapp-label" style={{ marginBottom:0 }}>Reviews per day</label>
                <span style={{ fontSize:16, fontWeight:700, color:C.text }}>{reviewCap}</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input type="range" className="rapp-slider" min={20} max={500} step={10} value={reviewCap}
                  onChange={e=>onUpdateSettings({...settings, reviewCap:Number(e.target.value)})} style={{ flex:1 }} />
                <input type="number" min={20} max={500} step={10} value={reviewCap}
                  onChange={e=>onUpdateSettings({...settings, reviewCap:Math.min(500, Math.max(20, +e.target.value||20))})}
                  style={{ width:56, textAlign:"right" }} className="rapp-input" />
              </div>
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>100 reviews per day supports a manageable workload. Reference: Anki community defaults.</p>
            </div>

            <div>
              <div className="rapp-row rapp-sb rapp-mb8">
                <label className="rapp-label" style={{ marginBottom:0 }}>Catch-up spread (days)</label>
                <span style={{ fontSize:16, fontWeight:700, color:C.text }}>{catchupDays}</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input type="range" className="rapp-slider" min={1} max={14} value={catchupDays}
                  onChange={e=>onUpdateSettings({...settings, catchupDays:Number(e.target.value)})} style={{ flex:1 }} />
                <input type="number" min={1} max={14} step={1} value={catchupDays}
                  onChange={e=>onUpdateSettings({...settings, catchupDays:Math.min(14, Math.max(1, +e.target.value||1))})}
                  style={{ width:56, textAlign:"right" }} className="rapp-input" />
              </div>
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>Overdue cards are spread across this many days to avoid overwhelming sessions.</p>
            </div>
          </div>

          <div style={{ marginTop:4, marginBottom:12 }}>
            <button onClick={()=>setAdvancedOpen(o=>!o)}
              style={{ display:"flex", alignItems:"center", gap:6, background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, color:C.textMut, padding:"6px 0" }}>
              {Ico.chevron(12, advancedOpen)}
              <span style={{ fontWeight:500 }}>Advanced: adjust after you have used the app for a few weeks</span>
            </button>
          </div>

          {advancedOpen && (<div className="rapp-fadein">

          <div className="rapp-card rapp-mb16">
            <div className="rapp-sec-title">FSRS scheduling</div>

            <div className="rapp-mb20">
              <div className="rapp-row rapp-sb rapp-mb8">
                <label className="rapp-label" style={{ marginBottom:0 }}>Target retention</label>
                <span style={{ fontSize:16, fontWeight:700, color:C.accent }}>{Math.round(retentionTarget*100)}%</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input type="range" className="rapp-slider" min={70} max={97} value={Math.round(retentionTarget*100)}
                  onChange={e=>onUpdateSettings({...settings, retentionTarget:Number(e.target.value)/100})} style={{ flex:1 }} />
                <input type="number" min={70} max={97} step={1} value={Math.round(retentionTarget*100)}
                  onChange={e=>onUpdateSettings({...settings, retentionTarget:Math.min(97, Math.max(70, +e.target.value||90))/100})}
                  style={{ width:56, textAlign:"right" }} className="rapp-input" />
              </div>
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>
                Higher retention = shorter intervals (more reviews). 90% is the default. Lower values reduce review load at the cost of forgetting more.
              </p>
            </div>

            <div>
              <div className="rapp-row rapp-sb rapp-mb8">
                <label className="rapp-label" style={{ marginBottom:0 }}>Leech threshold (lapses)</label>
                <span style={{ fontSize:16, fontWeight:700, color:C.again }}>{leechThreshold}</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input type="range" className="rapp-slider" min={3} max={10} value={leechThreshold}
                  onChange={e=>onUpdateSettings({...settings, leechThreshold:Number(e.target.value)})} style={{ flex:1 }} />
                <input type="number" min={3} max={10} step={1} value={leechThreshold}
                  onChange={e=>onUpdateSettings({...settings, leechThreshold:Math.min(10, Math.max(3, +e.target.value||5))})}
                  style={{ width:56, textAlign:"right" }} className="rapp-input" />
              </div>
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>Cards failing this many times are flagged as leeches.</p>
            </div>
          </div>

          <div className="rapp-card" style={{ background:C.bg }}>
            <p style={{ fontSize:13, color:C.textSec, lineHeight:1.75 }}>
              <strong>Keyboard shortcuts during review:</strong> Ctrl+Enter to reveal · 1 = Again · 2 = Hard · 3 = Good · 4 = Easy
            </p>
          </div>

          <div className="rapp-card rapp-mb16" style={{ marginTop:16 }}>
            <div className="rapp-sec-title">FSRS Parameters</div>
            <div style={{ fontSize:13, color:C.textSec, lineHeight:1.6, marginBottom:10 }}>
              {schedulerParams?.lastFitDate
                ? <>Current parameter set: fitted on {schedulerParams.lastFitDate} from {schedulerParams.reviewCountAtFit || 0} reviews</>
                : <>Current parameter set: default ts-fsrs (no fit yet)</>
              }
            </div>
            <div style={{ fontSize:13, color:C.textSec, lineHeight:1.6, marginBottom:14 }}>
              Desired retention: <strong>{Math.round(retentionTarget * 100)}%</strong>
            </div>
            <p style={{ fontSize:12, color:C.textMut, marginBottom:12, lineHeight:1.6 }}>
              Nidus Recall adjusts the desired retention target based on your observed recall accuracy.
              Fitting requires at least 200 reviews. Full 19-parameter optimisation is planned for a future update.
            </p>
            <button className="rapp-btn rapp-btn-ghost" style={{ fontSize:13, padding:"8px 16px" }}
              onClick={onRefitParams}>
              Refit now
            </button>
          </div>

          <div className="rapp-card rapp-mb16" style={{ marginTop:16 }}>
            <div className="rapp-sec-title">Sustainability</div>
            <div className="rapp-row rapp-sb rapp-mb20">
              <div>
                <label className="rapp-label" style={{ marginBottom:0 }}>Sustainable pace alerts</label>
                <p style={{ fontSize:12, color:C.textMut, marginTop:4, lineHeight:1.6 }}>
                  Warns when session patterns suggest study fatigue over the last 14 days.
                </p>
              </div>
              <div role="switch" aria-checked={fatigueAlertsEnabled}
                onClick={() => onUpdateSettings({...settings, fatigueAlertsEnabled:!fatigueAlertsEnabled})}
                style={{ width:40, height:22, borderRadius:11, cursor:"pointer", flexShrink:0, marginLeft:16,
                  background:fatigueAlertsEnabled?C.accent:C.elevated, position:"relative", transition:"background 0.2s" }}>
                <div style={{ position:"absolute", top:3,
                  left:fatigueAlertsEnabled?21:3, width:16, height:16, borderRadius:8,
                  background:"#fff", transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
              </div>
            </div>
            <div className="rapp-row rapp-sb">
              <div>
                <label className="rapp-label" style={{ marginBottom:0 }}>Focus mode prompt</label>
                <p style={{ fontSize:12, color:C.textMut, marginTop:4, lineHeight:1.6 }}>
                  Shows a focused-session checkbox on the study start screen.
                </p>
              </div>
              <div role="switch" aria-checked={attentionDeclarationEnabled}
                onClick={() => onUpdateSettings({...settings, attentionDeclarationEnabled:!attentionDeclarationEnabled})}
                style={{ width:40, height:22, borderRadius:11, cursor:"pointer", flexShrink:0, marginLeft:16,
                  background:attentionDeclarationEnabled?C.accent:C.elevated, position:"relative", transition:"background 0.2s" }}>
                <div style={{ position:"absolute", top:3,
                  left:attentionDeclarationEnabled?21:3, width:16, height:16, borderRadius:8,
                  background:"#fff", transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
              </div>
            </div>
          </div>

          <div className="rapp-card rapp-mb16" style={{ marginTop:16 }}>
            <div className="rapp-sec-title">Study depth</div>

            <div className="rapp-mb20">
              <div className="rapp-row rapp-sb">
                <label className="rapp-label" style={{ marginBottom:0 }}>Mature card mode</label>
                <div role="switch" aria-checked={matureModeEnabled}
                  onClick={() => onUpdateSettings({...settings, matureModeEnabled:!matureModeEnabled})}
                  style={{ width:40, height:22, borderRadius:11, cursor:"pointer", flexShrink:0,
                    background:matureModeEnabled?C.accent:C.elevated, position:"relative", transition:"background 0.2s" }}>
                  <div style={{ position:"absolute", top:3,
                    left:matureModeEnabled?21:3, width:16, height:16, borderRadius:8,
                    background:"#fff", transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
                </div>
              </div>
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>
                Cards above the maturity threshold show an expanded prompt encouraging connected recall.
              </p>
            </div>

            <div>
              <div className="rapp-row rapp-sb rapp-mb8">
                <label className="rapp-label" style={{ marginBottom:0 }}>Maturity threshold (days)</label>
                <span style={{ fontSize:16, fontWeight:700, color:C.text }}>{matureCardThreshold}</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input type="range" className="rapp-slider" min={14} max={90} step={1} value={matureCardThreshold}
                  onChange={e=>onUpdateSettings({...settings, matureCardThreshold:Number(e.target.value)})} style={{ flex:1 }} />
                <input type="number" min={14} max={90} step={1} value={matureCardThreshold}
                  onChange={e=>onUpdateSettings({...settings, matureCardThreshold:Math.min(90, Math.max(14, +e.target.value||30))})}
                  style={{ width:56, textAlign:"right" }} className="rapp-input" />
              </div>
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>
                A card is Mature when its FSRS stability reaches this value. Stability represents days to 90% retention.
              </p>
            </div>
          </div>

          </div>)} {/* end advancedOpen */}

        </div>
      )}

      {activeTab === "sleep" && (
        <div className="rapp-fadein">
          <div className="rapp-card rapp-mb16">
            <div className="rapp-sec-title">Sleep and memory</div>

            <div className="rapp-mb20">
              <label className="rapp-label">Bedtime (optional)</label>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <input type="time" className="rapp-input"
                  value={sleepBedtime||""}
                  onChange={e => onUpdateSettings({...settings, sleepBedtime: e.target.value||null})}
                  style={{ maxWidth:140 }} />
                {sleepBedtime && (
                  <button className="rapp-btn rapp-btn-ghost" style={{ padding:"8px 12px", fontSize:12 }}
                    onClick={() => onUpdateSettings({...settings, sleepBedtime:null})}>Clear</button>
                )}
              </div>
              {!sleepBedtime && <p style={{ fontSize:12, color:C.textMut, marginTop:6 }}>Not set</p>}
            </div>

            <div className="rapp-mb20">
              <label className="rapp-label">Review window</label>
              <select className="rapp-select" style={{ maxWidth:180 }}
                value={sleepWindowMinutes}
                onChange={e => onUpdateSettings({...settings, sleepWindowMinutes:Number(e.target.value)})}>
                <option value={60}>60 min</option>
                <option value={90}>90 min</option>
                <option value={120}>120 min</option>
              </select>
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>
                How long before bedtime the sleep review banner appears.
              </p>
            </div>

            <div className="rapp-mb20">
              <div className="rapp-row rapp-sb">
                <label className="rapp-label" style={{ marginBottom:0 }}>Sleep review reminder</label>
                <div role="switch" aria-checked={sleepBannerEnabled}
                  onClick={() => onUpdateSettings({...settings, sleepBannerEnabled:!sleepBannerEnabled})}
                  style={{ width:40, height:22, borderRadius:11, cursor:"pointer", flexShrink:0,
                    background:sleepBannerEnabled?C.accent:C.elevated, position:"relative", transition:"background 0.2s" }}>
                  <div style={{ position:"absolute", top:3,
                    left:sleepBannerEnabled?21:3, width:16, height:16, borderRadius:8,
                    background:"#fff", transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
                </div>
              </div>
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>
                Shows a banner on the Library screen and a hint on the Study screen during the review window.
              </p>
            </div>

            <div>
              <div className="rapp-row rapp-sb">
                <div>
                  <label className="rapp-label" style={{ marginBottom:0 }}>Bedtime window prefers reviews over new cards</label>
                  <p style={{ fontSize:12, color:C.textMut, marginTop:4, lineHeight:1.6 }}>
                    The evidence for sleep-enhanced consolidation is strongest for material already partially learned (Diekelmann and Born, 2010). When on, due reviews are prioritised over new cards in the pre-bedtime window.
                  </p>
                </div>
                <div role="switch" aria-checked={sleepPrefersReviews}
                  onClick={() => onUpdateSettings({...settings, sleepPrefersReviews:!sleepPrefersReviews})}
                  style={{ width:40, height:22, borderRadius:11, cursor:"pointer", flexShrink:0, marginLeft:16,
                    background:sleepPrefersReviews?C.accent:C.elevated, position:"relative", transition:"background 0.2s" }}>
                  <div style={{ position:"absolute", top:3,
                    left:sleepPrefersReviews?21:3, width:16, height:16, borderRadius:8,
                    background:"#fff", transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
                </div>
              </div>

            </div>
          </div>

          <div className="rapp-card" style={{ background:C.bg }}>
            <p style={{ fontSize:13, color:C.textSec, lineHeight:1.75 }}>
              Sleep after study supports memory consolidation (Diekelmann and Born, 2010). Reviewing close to bedtime may help retention, though most direct evidence is for new learning rather than review of familiar material. This is a reminder only. No scheduling changes are made.
            </p>
          </div>
        </div>
      )}

      {activeTab === "data" && (
        <ImportExportPanel cards={cards} decks={decks} onExport={onExport} onImportFile={onImport} onImportCards={onImportCards} onImportAnki={onImportAnki} />
      )}

      <div style={{ marginTop:32, paddingTop:16, borderTop:`1px solid ${C.border}`, textAlign:"center" }}>
        <span style={{ fontSize:11, color:C.textMut }}>Nidus Recall v0.6.0</span>
      </div>
    </div>
  )
}
