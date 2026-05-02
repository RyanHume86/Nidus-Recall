import { useState, useEffect } from "react"
import { C } from "@/lib/theme"
import { Ico } from "@/lib/icons"
import { ImportExportPanel } from "@/components/ImportExportPanel"

// Common IANA timezone list (representative subset + South Africa default)
const TIMEZONES = [
  "Africa/Johannesburg",
  "Africa/Nairobi",
  "Africa/Lagos",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
]

function detectTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Johannesburg" }
  catch { return "Africa/Johannesburg" }
}

export function SettingsView({ settings, onUpdateSettings, cards, decks, onExport, onImport, onImportCards, onImportAnki, onRefitParams, schedulerParams, onDeleteAccount, user }) {
  const {
    newCardCap=15, reviewCap=100, leechThreshold=5, retentionTarget=0.90, catchupDays=7,
    sleepBedtime=null, sleepWindowMinutes=90, sleepBannerEnabled=true, sleepPrefersReviews=true,
    matureModeEnabled=true, matureCardThreshold=30,
    fatigueAlertsEnabled=true, attentionDeclarationEnabled=true,
    intensityThreshold=80, intensityPromptsEnabled=true,
    dailyNewCardLimit=20, dailyReviewLimit=200,
    timezone=detectTimezone(), maximumInterval=36500,
  } = settings||{}

  const [activeTab,         setActiveTab]         = useState("profile")
  const [deleteConfirmStep, setDeleteConfirmStep] = useState(0)
  const [advancedOpen,      setAdvancedOpen]      = useState(false)
  const [firstNameDraft,    setFirstNameDraft]    = useState(() => localStorage.getItem("nidus.firstName") || "")

  useEffect(() => {
    const saved = firstNameDraft.trim().slice(0, 60)
    if (saved) localStorage.setItem("nidus.firstName", saved)
    else localStorage.removeItem("nidus.firstName")
  }, [firstNameDraft])

  const set = (patch) => onUpdateSettings({ ...(settings||{}), ...patch })

  const Toggle = ({ checked, onChange, testId }) => (
    <div role="switch" aria-checked={checked} data-testid={testId}
      onClick={onChange}
      style={{ width:40, height:22, borderRadius:11, cursor:"pointer", flexShrink:0, marginLeft:16,
        background:checked?C.accent:C.elevated, position:"relative", transition:"background 0.2s" }}>
      <div style={{ position:"absolute", top:3, left:checked?21:3, width:16, height:16, borderRadius:8,
        background:"#fff", transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
    </div>
  )

  const SliderField = ({ label, value, min, max, step=1, onChange, description, color }) => (
    <div className="rapp-mb20">
      <div className="rapp-row rapp-sb rapp-mb8">
        <label className="rapp-label" style={{ marginBottom:0 }}>{label}</label>
        <span style={{ fontSize:16, fontWeight:700, color:color||C.text }}>{value}</span>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <input type="range" className="rapp-slider" min={min} max={max} step={step} value={value}
          onChange={e=>onChange(Number(e.target.value))} style={{ flex:1 }} />
        <input type="number" min={min} max={max} step={step} value={value}
          onChange={e=>onChange(Math.min(max, Math.max(min, +e.target.value||min)))}
          style={{ width:64, textAlign:"right" }} className="rapp-input" />
      </div>
      {description && <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>{description}</p>}
    </div>
  )

  const TAB = (id, label) => (
    <button key={id} onClick={()=>setActiveTab(id)}
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
        {["profile","schedule","algorithm","data","privacy"].map(t =>
          TAB(t, t.charAt(0).toUpperCase() + t.slice(1))
        )}
      </div>

      {/* ── Profile ───────────────────────────────────────────────────────── */}
      {activeTab === "profile" && (
        <div className="rapp-fadein">
          <div className="rapp-card rapp-mb16">
            <div className="rapp-sec-title">Profile</div>

            <div className="rapp-mb16">
              <label className="rapp-label">First name</label>
              <input
                data-testid="first-name-input"
                className="rapp-input"
                value={firstNameDraft}
                onChange={e => setFirstNameDraft(e.target.value)}
                placeholder="Used for greetings"
                maxLength={60}
              />
              <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>
                Saved locally. Not shared with anyone.
              </p>
            </div>

            {user?.email && (
              <div className="rapp-mb16">
                <label className="rapp-label">Email</label>
                <input className="rapp-input" value={user.email} readOnly disabled
                  style={{ color:C.textMut, cursor:"default" }} />
              </div>
            )}

            {user?.role && (
              <div>
                <label className="rapp-label">Role</label>
                <input className="rapp-input" value={user.role} readOnly disabled
                  style={{ color:C.textMut, cursor:"default" }} />
              </div>
            )}
          </div>

          <div className="rapp-card rapp-mb16">
            <div className="rapp-sec-title">Time zone</div>
            <select
              data-testid="timezone-select"
              className="rapp-select"
              value={TIMEZONES.includes(timezone) ? timezone : "Africa/Johannesburg"}
              onChange={e => set({ timezone: e.target.value })}
            >
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g," ")}</option>)}
            </select>
            <p style={{ fontSize:12, color:C.textMut, marginTop:6, lineHeight:1.6 }}>
              Detected: {detectTimezone()}. Affects how sleep-window times are calculated.
            </p>
          </div>
        </div>
      )}

      {/* ── Schedule ─────────────────────────────────────────────────────── */}
      {activeTab === "schedule" && (
        <div className="rapp-fadein">

          <div className="rapp-card rapp-mb16">
            <div className="rapp-sec-title">Daily limits</div>
            <SliderField
              label="New cards per day"
              value={dailyNewCardLimit}
              min={0} max={200} step={5}
              onChange={v=>set({ dailyNewCardLimit:v, newCardCap:v })}
              description="Cards you've never seen before. Start conservative and raise once routine is established."
              color={C.accent}
            />
            <SliderField
              label="Reviews per day"
              value={dailyReviewLimit}
              min={10} max={1000} step={10}
              onChange={v=>set({ dailyReviewLimit:v, reviewCap:v })}
              description="Scheduled reviews. 200 is a comfortable upper bound for most learners."
            />
            <SliderField
              label="Catch-up spread (days)"
              value={catchupDays}
              min={1} max={14}
              onChange={v=>set({ catchupDays:v })}
              description="Overdue cards are spread over this many days to avoid overwhelming sessions."
            />
          </div>

          <div className="rapp-card rapp-mb16">
            <div className="rapp-sec-title">Study behaviour</div>

            <div className="rapp-row rapp-sb rapp-mb20">
              <div>
                <label className="rapp-label" style={{ marginBottom:0 }}>Focus mode prompt</label>
                <p style={{ fontSize:12, color:C.textMut, marginTop:4, lineHeight:1.6 }}>
                  Shows a focused-session checkbox on the study start screen.
                </p>
              </div>
              <Toggle checked={attentionDeclarationEnabled} testId="toggle-attention"
                onChange={()=>set({ attentionDeclarationEnabled:!attentionDeclarationEnabled })} />
            </div>

            <div className="rapp-row rapp-sb rapp-mb20">
              <div>
                <label className="rapp-label" style={{ marginBottom:0 }}>Intensity prompts</label>
                <p style={{ fontSize:12, color:C.textMut, marginTop:4, lineHeight:1.6 }}>
                  After high-intensity sessions, prompts you to note friction or take a break.
                </p>
              </div>
              <Toggle checked={intensityPromptsEnabled} testId="toggle-intensity-prompts"
                onChange={()=>set({ intensityPromptsEnabled:!intensityPromptsEnabled })} />
            </div>

            <div>
              <label className="rapp-label" style={{ marginBottom:0 }}>Intensity threshold</label>
              <p style={{ fontSize:12, color:C.textMut, marginTop:4, marginBottom:8, lineHeight:1.6 }}>
                Session size (cards reviewed) that triggers intensity prompts.
              </p>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input type="range" className="rapp-slider" min={20} max={200} step={10} value={intensityThreshold}
                  onChange={e=>set({ intensityThreshold:Number(e.target.value) })} style={{ flex:1 }} />
                <span style={{ fontSize:14, fontWeight:600, minWidth:36, textAlign:"right" }}>{intensityThreshold}</span>
              </div>
            </div>
          </div>

          <div className="rapp-card rapp-mb16">
            <div className="rapp-sec-title">Mature cards</div>
            <div className="rapp-row rapp-sb rapp-mb16">
              <div>
                <label className="rapp-label" style={{ marginBottom:0 }}>Mature card mode</label>
                <p style={{ fontSize:12, color:C.textMut, marginTop:4, lineHeight:1.6 }}>
                  Mature cards show an expanded prompt encouraging connected recall.
                </p>
              </div>
              <Toggle checked={matureModeEnabled} testId="toggle-mature-mode"
                onChange={()=>set({ matureModeEnabled:!matureModeEnabled })} />
            </div>
            <SliderField
              label="Maturity threshold (days)"
              value={matureCardThreshold}
              min={14} max={90}
              onChange={v=>set({ matureCardThreshold:v })}
              description="FSRS stability value at which a card is considered mature."
            />
          </div>

          <div className="rapp-card rapp-mb16">
            <div className="rapp-sec-title">Sleep and memory</div>

            <div className="rapp-mb20">
              <label className="rapp-label">Bedtime (optional)</label>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <input type="time" className="rapp-input" data-testid="bedtime-input"
                  value={sleepBedtime||""} onChange={e=>set({ sleepBedtime:e.target.value||null })}
                  style={{ maxWidth:140 }} />
                {sleepBedtime && (
                  <button className="rapp-btn rapp-btn-ghost" style={{ padding:"8px 12px", fontSize:12 }}
                    onClick={()=>set({ sleepBedtime:null })}>Clear</button>
                )}
              </div>
              {!sleepBedtime && <p style={{ fontSize:12, color:C.textMut, marginTop:6 }}>Not set</p>}
            </div>

            <div className="rapp-mb20">
              <label className="rapp-label">Review window before bedtime</label>
              <select className="rapp-select" style={{ maxWidth:180 }}
                value={sleepWindowMinutes} onChange={e=>set({ sleepWindowMinutes:Number(e.target.value) })}>
                <option value={60}>60 min</option>
                <option value={90}>90 min</option>
                <option value={120}>120 min</option>
              </select>
            </div>

            <div className="rapp-row rapp-sb rapp-mb16">
              <div>
                <label className="rapp-label" style={{ marginBottom:0 }}>Sleep review reminder</label>
                <p style={{ fontSize:12, color:C.textMut, marginTop:4, lineHeight:1.6 }}>Banner on Library during review window.</p>
              </div>
              <Toggle checked={sleepBannerEnabled}
                onChange={()=>set({ sleepBannerEnabled:!sleepBannerEnabled })} />
            </div>

            <div className="rapp-row rapp-sb">
              <div>
                <label className="rapp-label" style={{ marginBottom:0 }}>Bedtime window prefers reviews</label>
                <p style={{ fontSize:12, color:C.textMut, marginTop:4, lineHeight:1.6 }}>
                  Pauses new cards during the pre-bedtime window (Diekelmann and Born, 2010).
                </p>
              </div>
              <Toggle checked={sleepPrefersReviews}
                onChange={()=>set({ sleepPrefersReviews:!sleepPrefersReviews })} />
            </div>
          </div>

          <div className="rapp-card rapp-mb16">
            <div className="rapp-sec-title">Sustainability</div>
            <div className="rapp-row rapp-sb">
              <div>
                <label className="rapp-label" style={{ marginBottom:0 }}>Sustainable pace alerts</label>
                <p style={{ fontSize:12, color:C.textMut, marginTop:4, lineHeight:1.6 }}>
                  Warns when session patterns suggest study fatigue over the last 14 days.
                </p>
              </div>
              <Toggle checked={fatigueAlertsEnabled} testId="toggle-fatigue"
                onChange={()=>set({ fatigueAlertsEnabled:!fatigueAlertsEnabled })} />
            </div>
          </div>
        </div>
      )}

      {/* ── Algorithm ────────────────────────────────────────────────────── */}
      {activeTab === "algorithm" && (
        <div className="rapp-fadein">
          <div className="rapp-card rapp-mb16">
            <div className="rapp-sec-title">FSRS-5 parameters</div>
            <p style={{ fontSize:12, color:C.textMut, marginBottom:12, lineHeight:1.6 }}>
              FSRS-5 uses published default parameters. Nidus adjusts only the retention target based on your observed recall accuracy.
            </p>
            {schedulerParams?.params ? (
              <div style={{ fontSize:12, color:C.textSec, fontFamily:"monospace", background:C.bg, borderRadius:8, padding:"10px 14px", lineHeight:2, wordBreak:"break-all" }}>
                {JSON.stringify(schedulerParams.params, null, 2)}
              </div>
            ) : (
              <p style={{ fontSize:13, color:C.textMut }}>Parameters will appear after your first review session.</p>
            )}
            <div style={{ fontSize:12, color:C.textMut, marginTop:10, lineHeight:1.6 }}>
              {schedulerParams?.lastFitDate
                ? <>Retention target last adjusted on <strong>{schedulerParams.lastFitDate}</strong> from {schedulerParams.reviewCountAtFit||0} reviews</>
                : <>Retention target not yet adjusted (requires 200 reviews)</>
              }
            </div>
          </div>

          <div style={{ marginBottom:12 }}>
            <button data-testid="show-advanced-algo"
              onClick={()=>setAdvancedOpen(o=>!o)}
              style={{ display:"flex", alignItems:"center", gap:6, background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, color:C.textMut, padding:"6px 0" }}>
              {Ico.chevron(12, advancedOpen)}
              <span style={{ fontWeight:500 }}>Show advanced</span>
            </button>
          </div>

          {advancedOpen && (
            <div className="rapp-fadein">
              <div className="rapp-card rapp-mb16">
                <div className="rapp-sec-title">Target retention</div>
                <div className="rapp-row rapp-sb rapp-mb8">
                  <label className="rapp-label" style={{ marginBottom:0 }}>Request retention</label>
                  <span style={{ fontSize:16, fontWeight:700, color:C.accent }}>{Math.round(retentionTarget*100)}%</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                  <input type="range" className="rapp-slider" min={70} max={97} value={Math.round(retentionTarget*100)}
                    onChange={e=>set({ retentionTarget:Number(e.target.value)/100 })} style={{ flex:1 }} />
                  <input type="number" min={70} max={97} step={1} value={Math.round(retentionTarget*100)}
                    onChange={e=>set({ retentionTarget:Math.min(97, Math.max(70, +e.target.value||90))/100 })}
                    style={{ width:56, textAlign:"right" }} className="rapp-input" />
                </div>
                <p style={{ fontSize:12, color:C.textMut, lineHeight:1.6 }}>
                  Higher = shorter intervals (more reviews). Default: 90%.
                </p>
                <div style={{ marginTop:14 }}>
                  <button className="rapp-btn rapp-btn-ghost" style={{ fontSize:13, padding:"8px 16px" }}
                    onClick={onRefitParams}>
                    Retune now
                  </button>
                </div>
              </div>

              <div className="rapp-card rapp-mb16">
                <div className="rapp-sec-title">Maximum interval</div>
                <div className="rapp-row rapp-sb rapp-mb8">
                  <label className="rapp-label" style={{ marginBottom:0 }}>Maximum interval (days)</label>
                  <span style={{ fontSize:16, fontWeight:700, color:C.text }}>{maximumInterval.toLocaleString()}</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                  <input type="range" className="rapp-slider" min={365} max={36500} step={365} value={maximumInterval}
                    onChange={e=>set({ maximumInterval:Number(e.target.value) })} style={{ flex:1 }} />
                  <input type="number" min={365} max={36500} step={1} value={maximumInterval}
                    onChange={e=>set({ maximumInterval:Math.min(36500, Math.max(365, +e.target.value||36500)) })}
                    style={{ width:72, textAlign:"right" }} className="rapp-input" />
                </div>
                <p style={{ fontSize:12, color:C.textMut, lineHeight:1.6 }}>
                  FSRS will not schedule a card further out than this. Default: 36500 days (100 years).
                </p>
              </div>

              <div className="rapp-card rapp-mb16">
                <div className="rapp-sec-title">Leech threshold</div>
                <div className="rapp-row rapp-sb rapp-mb8">
                  <label className="rapp-label" style={{ marginBottom:0 }}>Lapse count to flag leech</label>
                  <span style={{ fontSize:16, fontWeight:700, color:C.again }}>{leechThreshold}</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                  <input type="range" className="rapp-slider" min={3} max={10} value={leechThreshold}
                    onChange={e=>set({ leechThreshold:Number(e.target.value) })} style={{ flex:1 }} />
                  <input type="number" min={3} max={10} step={1} value={leechThreshold}
                    onChange={e=>set({ leechThreshold:Math.min(10, Math.max(3, +e.target.value||5)) })}
                    style={{ width:56, textAlign:"right" }} className="rapp-input" />
                </div>
                <p style={{ fontSize:12, color:C.textMut, lineHeight:1.6 }}>Cards failing this many times are flagged. Consider rewriting or splitting them.</p>
              </div>
            </div>
          )}

          <div className="rapp-card" style={{ background:C.bg }}>
            <p style={{ fontSize:13, color:C.textSec, lineHeight:1.75 }}>
              <strong>Keyboard shortcuts during review:</strong> Ctrl+Enter to reveal · 1 = Again · 2 = Hard · 3 = Good · 4 = Easy
            </p>
          </div>
        </div>
      )}

      {/* ── Data ─────────────────────────────────────────────────────────── */}
      {activeTab === "data" && (
        <ImportExportPanel cards={cards} decks={decks} onExport={onExport} onImportFile={onImport} onImportCards={onImportCards} onImportAnki={onImportAnki} />
      )}

      {/* ── Privacy ──────────────────────────────────────────────────────── */}
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

          <div className="rapp-card rapp-mb16">
            <div className="rapp-sec-title" style={{ color:C.again }}>Delete my account</div>
            <p style={{ fontSize:12, color:C.textMut, marginBottom:12, lineHeight:1.65 }}>
              Permanently deletes all flashcards, decks, and session logs. Account removed within 30 days.
            </p>
            {deleteConfirmStep === 0 && (
              <button onClick={()=>setDeleteConfirmStep(1)} data-testid="delete-account-btn"
                style={{ width:"100%", padding:"10px", borderRadius:10, border:`1px solid ${C.again}40`,
                  background:"transparent", color:C.again, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
                Delete my account
              </button>
            )}
            {deleteConfirmStep === 1 && (
              <div data-testid="delete-confirm-panel">
                <p style={{ fontSize:13, color:C.again, marginBottom:12, fontWeight:500 }}>Are you sure? This cannot be undone.</p>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={async()=>{ setDeleteConfirmStep(2); try { await onDeleteAccount?.() } catch(_){} }}
                    data-testid="delete-confirm-yes-btn"
                    style={{ flex:1, padding:"10px", borderRadius:10, border:"none", background:C.againBg,
                      color:C.again, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
                    Yes, delete everything
                  </button>
                  <button onClick={()=>setDeleteConfirmStep(0)} data-testid="delete-cancel-btn"
                    style={{ flex:1, padding:"10px", borderRadius:10, border:`1px solid ${C.border}`,
                      background:"transparent", color:C.textSec, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {deleteConfirmStep === 2 && <p style={{ fontSize:13, color:C.textMut }}>Deleting your data…</p>}
          </div>
        </div>
      )}

      {/* ── About (always visible footer) ────────────────────────────────── */}
      <div data-testid="about-section" style={{ marginTop:32, paddingTop:16, borderTop:`1px solid ${C.border}`, textAlign:"center" }}>
        <span style={{ fontSize:11, color:C.textMut }}>Nidus Recall v0.6.0</span>
        <div style={{ fontSize:11, color:C.textMut, marginTop:2 }}>
          Supported: Chrome 110+, Edge 110+, Firefox 110+, Safari 16.4+, Samsung Internet 21+
        </div>
        <a href="https://nidusrecall.com/feedback" target="_blank" rel="noopener noreferrer"
          style={{ display:"block", fontSize:11, color:C.accent, marginTop:4, textDecoration:"none" }}>
          Send feedback ↗
        </a>
      </div>
    </div>
  )
}
