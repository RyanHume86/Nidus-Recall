import { useState, useEffect, useRef } from "react"
import { C } from "@/lib/theme"
import { notionGet } from "@/lib/settings"
import { getNotionCredentials, setNotionCredentials, clearNotionCredentials } from "@/api/notionSettings"
import { genId } from "@/lib/dates"
import * as excel from "@/api/excel"
import * as notion from "@/api/notion"

let ankiModule = null
const getAnkiModule = async () => {
  if (!ankiModule) ankiModule = await import('../api/anki.js')
  return ankiModule
}

export function ImportExportPanel({ cards, decks, onImportFile, onImportCards, onExport, onImportAnki }) {
  const [tab,          setTab]         = useState("notion")
  const [notionToken,  setNotionToken] = useState(()=>notionGet().token||"")
  const [notionDb,     setNotionDb]    = useState(()=>notionGet().db||"")
  const [notionStatus, setNotionStatus]= useState("")
  const [notionBusy,   setNotionBusy]  = useState(false)
  const [notionPct,    setNotionPct]   = useState(0)

  useEffect(() => {
    getNotionCredentials().then(c => {
      setNotionToken(c.token)
      setNotionDb(c.db)
    }).catch(() => {})
  }, [])
  const [csvResult,    setCsvResult]   = useState(null)
  const [importResult, setImportResult]= useState(null)
  const [apkgPreview,    setApkgPreview]    = useState(null)
  const [apkgError,      setApkgError]      = useState(null)
  const [apkgImporting,  setApkgImporting]  = useState(false)
  const [apkgExporting,  setApkgExporting]  = useState(false)
  const [apkgExportDeck, setApkgExportDeck] = useState("all")
  const [apkgExportErr,  setApkgExportErr]  = useState(null)
  const csvRef    = useRef(null)
  const backupRef = useRef(null)

  const saveNotion = (t, d) => { setNotionCredentials(t, d).catch(() => {}) }
  const disconnectNotion = async () => {
    setNotionBusy(true)
    try { await clearNotionCredentials() } catch {}
    setNotionToken(""); setNotionDb(""); setNotionStatus("Disconnected.")
    setNotionBusy(false)
  }
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
      if (err?.name === 'ApkgTooLargeError') {
        setApkgError('This .apkg is larger than 50 MB. Split your Anki collection into smaller decks before importing.')
      } else {
        setApkgError(`Parse failed: ${err.message}`)
      }
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

  const handleApkgExport = async () => {
    setApkgExporting(true)
    setApkgExportErr(null)
    try {
      const { buildApkg } = await getAnkiModule()
      const exportCards = apkgExportDeck === "all"
        ? cards
        : cards.filter(c => c.deck === apkgExportDeck)
      const bytes = await buildApkg(exportCards)
      const blob = new Blob([bytes], { type: "application/zip" })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      const name = apkgExportDeck === "all" ? "Nidus Recall export" : apkgExportDeck.replace(/[^a-z0-9_\- ]/gi, "_")
      a.href = url; a.download = `${name}.apkg`; a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setApkgExportErr(`Export failed: ${err.message}`)
    } finally {
      setApkgExporting(false)
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
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
            <button className="rapp-btn rapp-btn-ghost" style={{ padding:"9px 14px", fontSize:13 }} onClick={testNotion} disabled={notionBusy}>Test</button>
            <button className="rapp-btn rapp-btn-ghost" style={{ padding:"9px 14px", fontSize:13 }} onClick={importNotion} disabled={notionBusy}>&#8593; Import</button>
            <button className="rapp-btn rapp-btn-primary" style={{ padding:"9px 14px", fontSize:13 }} onClick={exportNotion} disabled={notionBusy||!cards.length}>&#8595; Export</button>
          </div>
          {(notionToken||notionDb) && (
            <div style={{ marginBottom:14 }}>
              <button className="rapp-btn rapp-btn-ghost" style={{ padding:"7px 12px", fontSize:12, color:C.again }} onClick={disconnectNotion} disabled={notionBusy}>Disconnect Notion</button>
            </div>
          )}
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
          {/* Export section */}
          <div className="rapp-card rapp-mb16">
            <div style={{ fontSize:14, fontWeight:600, marginBottom:8 }}>Export to Anki</div>
            <p style={{ fontSize:13, color:C.textSec, lineHeight:1.65, marginBottom:14 }}>
              Download your cards as a <strong>.apkg</strong> file for Anki desktop or AnkiDroid.
              Basic, cloze, and image occlusion card types are preserved. Scheduling state
              is not exported; all cards start fresh in Anki (mirroring the import behaviour).
            </p>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:10 }}>
              <select className="rapp-select" style={{ flex:1, minWidth:160 }} value={apkgExportDeck} onChange={e=>setApkgExportDeck(e.target.value)}>
                <option value="all">All decks ({cards.length} cards)</option>
                {decks.map(d => {
                  const n = cards.filter(c => c.deck === d).length
                  return <option key={d} value={d}>{d} ({n})</option>
                })}
              </select>
              <button className="rapp-btn rapp-btn-primary" style={{ padding:"9px 16px", fontSize:13 }}
                onClick={handleApkgExport} disabled={apkgExporting || !cards.length}>
                {apkgExporting ? "Building..." : "↓ Export .apkg"}
              </button>
            </div>
            {apkgExportErr && <p style={{ fontSize:12, color:C.again }}>{apkgExportErr}</p>}
          </div>

          {/* Import section */}
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
                <p>Image occlusion cards: <strong>{apkgPreview.summary.imageOcclusion}</strong></p>
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
