import { useState, useEffect } from "react"
import { C } from "@/lib/theme"
import { Ico } from "@/lib/icons"
import { ImportExportPanel } from "@/components/ImportExportPanel"

export function SettingsView({ settings, onUpdateSettings, cards, decks, onExport, onImport, onImportCards, onImportAnki, onRefitParams, schedulerParams, onDeleteAccount }) {
  const {
    newCardCap=15, reviewCap=100, leechThreshold=5, retentionTarget=0.90, catchupDays=7,
    sleepBedtime=null, sleepWindowMinutes=90, sleepBannerEnabled=true, sleepPrefersReviews=true,
    matureModeEnabled=true, matureCardThreshold=30,
    fatigueAlertsEnabled=true, attentionDeclarationEnabled=true,
  } = settings||{}
  const [activeTab,        setActiveTab]        = useState("study")
  const [deleteConfirmStep, setDeleteConfirmStep] = useState(0) // 0=hidden,1=confirm,2=deleting
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [firstName, setFirstName] = useState(() => localStorage.getItem("nidus.firstName") || "")
  const [firstNameDraft, setFirstNameDraft] = useState(() => localStorage.getItem("nidus.firstName") || "")

  useEffect(() => {
    const saved = firstNameDraft.trim().slice(0, 60)
    if (saved) localStorage.setItem("nidus.firstName", saved)
    else localStorage.removeItem("nidus.firstName")
    setFirstName(saved)
  }, [firstNameDraft])

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

      <div style={{ display:"flex", gap:4, background:C.bg, borderRadius:10, padding:3, marginBottom:20, flexWrap:"wrap" }}>
        {TAB("study",   "Study")}
        {TAB("sleep",   "Sleep")}
        {TAB("data",    "Data")}
        {TAB("privacy", "Privacy")}
      </div>

      {activeTab === "study" && (
        <div className="rapp-fadein">
          <div className="rapp-card rapp-mb16">
            <div className="rapp-sec-title">About you</div>
            <div className="rapp-mb4">
              <label className="rapp-label">First name</label>
              <input
                className="rapp-input"
                value={firstNameDraft}
                onChange={e => setFirstNameDraft(e.target.value)}
                placeholder="Used for greetings"
                maxLength={60}
                style={{ width: "100%" }}
              />
              <p style={{ fontSize: 12, color: C.textMut, marginTop: 6, lineHeight: 1.6 }}>
                Just your first name. Saved locally, never shared.
              </p>
            </div>
          </div>

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
            <div className="rapp-sec-title">Retention target tuning</div>
            <div style={{ fontSize:13, color:C.textSec, lineHeight:1.6, marginBottom:10 }}>
              {schedulerParams?.lastFitDate
                ? <>Retention target last adjusted on {schedulerParams.lastFitDate} from {schedulerParams.reviewCountAtFit || 0} reviews</>
                : <>Retention target: not yet adjusted (requires 200 reviews)</>
              }
            </div>
            <div style={{ fontSize:13, color:C.textSec, lineHeight:1.6, marginBottom:14 }}>
              Current target: <strong>{Math.round(retentionTarget * 100)}%</strong>
            </div>
            <p style={{ fontSize:12, color:C.textMut, marginBottom:12, lineHeight:1.6 }}>
              The desired retention target is adjusted based on observed recall accuracy, while leaving FSRS-5 parameters at their published defaults. True per-user parameter optimisation is a planned future feature.
            </p>
            <button className="rapp-btn rapp-btn-ghost" style={{ fontSize:13, padding:"8px 16px" }}
              onClick={onRefitParams}>
              Retune now
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

      {activeTab === "privacy" && (
        <div className="rapp-fadein">
          <div className="rapp-card rapp-mb16">
            <div className="rapp-sec-title">Legal documents</div>
            <p style={{ fontSize:12, color:C.textMut, marginBottom:12, lineHeight:1.65 }}>
              Nidus Recall is committed to your privacy under the Protection of Personal Information Act (POPIA).
            </p>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {[
                { href:"/privacy",         label:"Privacy Policy" },
                { href:"/terms",           label:"Terms of Use" },
                { href:"/data-processing", label:"How we process your data" },
              ].map(({ href, label }) => (
                <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize:13, color:C.accent, textDecoration:"none", display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:11 }}>↗</span> {label}
                </a>
              ))}
            </div>
          </div>

          <div className="rapp-card rapp-mb16">
            <div className="rapp-sec-title">Export my data</div>
            <p style={{ fontSize:12, color:C.textMut, marginBottom:12, lineHeight:1.65 }}>
              Download a full copy of your decks, flashcards, and session logs as a JSON file.
            </p>
            <button className="rapp-btn rapp-btn-ghost" style={{ width:"100%" }} onClick={onExport}
              data-testid="export-data-btn">
              Export my data
            </button>
          </div>

          <div className="rapp-card">
            <div className="rapp-sec-title" style={{ color:C.again }}>Delete my account</div>
            <p style={{ fontSize:12, color:C.textMut, marginBottom:12, lineHeight:1.65 }}>
              This will permanently delete all your flashcards, decks, and session logs. Your account record will be removed within 30 days.
            </p>
            {deleteConfirmStep === 0 && (
              <button
                onClick={() => setDeleteConfirmStep(1)}
                data-testid="delete-account-btn"
                style={{ width:"100%", padding:"10px", borderRadius:10, border:`1px solid ${C.again}40`,
                  background:"transparent", color:C.again, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
                Delete my account
              </button>
            )}
            {deleteConfirmStep === 1 && (
              <div data-testid="delete-confirm-panel">
                <p style={{ fontSize:13, color:C.again, marginBottom:12, fontWeight:500 }}>
                  Are you sure? This cannot be undone.
                </p>
                <div style={{ display:"flex", gap:8 }}>
                  <button
                    onClick={async () => {
                      setDeleteConfirmStep(2)
                      try { await onDeleteAccount?.() } catch (_) {}
                    }}
                    data-testid="delete-confirm-yes-btn"
                    style={{ flex:1, padding:"10px", borderRadius:10, border:"none", background:C.againBg,
                      color:C.again, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
                    Yes, delete everything
                  </button>
                  <button
                    onClick={() => setDeleteConfirmStep(0)}
                    data-testid="delete-cancel-btn"
                    style={{ flex:1, padding:"10px", borderRadius:10, border:`1px solid ${C.border}`,
                      background:"transparent", color:C.textSec, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {deleteConfirmStep === 2 && (
              <p style={{ fontSize:13, color:C.textMut }}>Deleting your data…</p>
            )}
          </div>
        </div>
      )}

      <div style={{ marginTop:32, paddingTop:16, borderTop:`1px solid ${C.border}`, textAlign:"center" }}>
        <span style={{ fontSize:11, color:C.textMut }}>Nidus Recall v0.6.0</span>
      </div>
    </div>
  )
}
