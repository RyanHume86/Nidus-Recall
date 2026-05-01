import { useState, useEffect, useMemo } from "react"
import * as storage from "@/api/storage"
import { getDue, getDueWithCatchup, getNew } from "@/lib/fsrs"
import { localDateStr } from "@/lib/dates"
import { RETURN_ONBOARD_KEY } from "@/lib/settings"
import { fitSchedulerParams } from "@/lib/fit-params"
import { C } from "@/lib/theme"
import { Ico } from "@/lib/icons"
import * as offlineStore from "@/lib/offline-store"
import { isInstallable, triggerInstallPrompt } from "@/lib/pwa"
import { useAppStore } from "@/store/appStore"
import { useAuth } from "@/lib/AuthContext"
import NidusLogo from "@/components/NidusLogo"
import FirstRunOverlay from "@/components/FirstRunOverlay"
import { SleepScheduleModal, sleepOnboardComplete } from "@/components/onboarding/SleepScheduleModal"
import { LibraryView } from "@/views/LibraryView"
import { DeckView } from "@/views/DeckView"
import { StudySelectView } from "@/views/StudySelectView"
import { SessionView } from "@/views/SessionView"
import { FreeStudyView } from "@/views/FreeStudyView"
import { StatsView } from "@/views/StatsView"
import { SettingsView } from "@/views/SettingsView"
import { ReturnOnboardingCard } from "@/views/ReturnOnboardingCard"

// ─── Root Component ───────────────────────────────────────────────────────────
export default function Home() {
  // ── Navigation state (ephemeral UI, stays local) ───────────────────────────
  const [view,               setView]               = useState("library")
  const [selectedDeck,       setSelectedDeck]       = useState(null)
  const [studyDeckName,      setStudyDeckName]      = useState(null)
  const [sessionCapOverride, setSessionCapOverride] = useState(null)
  const [sessionFocused,     setSessionFocused]     = useState(false)
  const [interleavedCards,   setInterleavedCards]   = useState(null)
  const [firstRunDone,       setFirstRunDone]       = useState(() => !!localStorage.getItem("nidus.firstRunSeen"))
  const [sleepOnboardSeen,   setSleepOnboardSeen]   = useState(false)

  // ── Auth (needed for sleep onboarding flag) ────────────────────────────────
  const { user, isAuthenticated, authChecked } = useAuth()

  // ── Store: data + sync ─────────────────────────────────────────────────────
  const cards                   = useAppStore(s => s.cards)
  const log                     = useAppStore(s => s.log)
  const decks                   = useAppStore(s => s.decks)
  const deckParentMap            = useAppStore(s => s.deckParentMap)
  const deckMeta                 = useAppStore(s => s.deckMeta)
  const settings                 = useAppStore(s => s.settings)
  const ready                    = useAppStore(s => s.ready)
  const cardsFullyLoaded         = useAppStore(s => s.cardsFullyLoaded)
  const syncStatus               = useAppStore(s => s.syncStatus)
  const lastSynced               = useAppStore(s => s.lastSynced)
  const incompleteSession        = useAppStore(s => s.incompleteSession)
  const sessionsCompleted        = useAppStore(s => s.sessionsCompleted)
  const isOffline                = useAppStore(s => s.isOffline)
  const installPromptDismissed   = useAppStore(s => s.installPromptDismissed)

  const init                     = useAppStore(s => s.init)
  const updateCards              = useAppStore(s => s.updateCards)
  const flushCards               = useAppStore(s => s.flushCards)
  const addLog                   = useAppStore(s => s.addLog)
  const updateSettings           = useAppStore(s => s.updateSettings)
  const addDeck                  = useAppStore(s => s.addDeck)
  const archiveDeck              = useAppStore(s => s.archiveDeck)
  const createSampleDeck         = useAppStore(s => s.createSampleDeck)
  const markSessionComplete      = useAppStore(s => s.markSessionComplete)
  const setIncompleteSession     = useAppStore(s => s.setIncompleteSession)
  const setIsOffline             = useAppStore(s => s.setIsOffline)
  const setInstallPromptDismissed = useAppStore(s => s.setInstallPromptDismissed)
  const incrementSessionsCompleted = useAppStore(s => s.incrementSessionsCompleted)
  const handleImportCards        = useAppStore(s => s.handleImportCards)
  const handleApkgImportCards    = useAppStore(s => s.handleApkgImportCards)

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => { init() }, [])

  // ── Check for in-progress sessions on load ─────────────────────────────────
  useEffect(() => {
    if (log.length > 0 && incompleteSession === null) {
      const incomplete = log.find(e => e.status === "in-progress")
      if (incomplete) setIncompleteSession(incomplete)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // ── Offline / PWA listeners ────────────────────────────────────────────────
  useEffect(() => {
    const handleOnline  = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    const cleanupReconnect = offlineStore.onReconnect(async () => {
      try {
        const { flushed } = await offlineStore.drainQueue(storage.syncCardState)
        if (flushed > 0) useAppStore.setState({ syncStatus: `Synced ${flushed} offline rating${flushed !== 1 ? 's' : ''}` })
      } catch (_) {}
    })
    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
      cleanupReconnect()
    }
  }, [])

  // ── Import handlers ────────────────────────────────────────────────────────
  const handleImport = (file, onResult) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      try {
        const data = JSON.parse(ev.target.result)
        if (!data.cards || !Array.isArray(data.cards)) throw new Error("Invalid format")
        useAppStore.setState({ syncStatus: 'saving', cards: data.cards, _pendingCards: data.cards })
        await storage.syncCards(data.cards)
        if (data.decks) {
          const m = [...new Set(data.decks)]
          useAppStore.setState({ decks: m })
          await Promise.all(m.map(storage.ensureDeck))
        }
        if (data.log) {
          useAppStore.setState({ log: data.log })
          await Promise.all(data.log.map(e => storage.appendLog(e).catch(() => {})))
        }
        useAppStore.getState().markSaved()
        onResult({ ok: true, count: data.cards.length })
      } catch (err) {
        useAppStore.setState({ syncStatus: 'error' })
        onResult({ ok: false, msg: err.message })
      }
    }
    reader.readAsText(file)
  }

  const handleExport = () => {
    const blob = new Blob(
      [JSON.stringify({ version: 3, exportedAt: new Date().toISOString(), cards, log, decks }, null, 2)],
      { type: "application/json" }
    )
    const url = URL.createObjectURL(blob), a = document.createElement("a")
    a.href = url; a.download = `nidus-backup-${localDateStr()}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  const startSRS = (deck, capOverride = null, focused = false) => {
    setStudyDeckName(deck === "all" ? null : deck)
    setSessionCapOverride(capOverride)
    setSessionFocused(focused)
    setInterleavedCards(null)
    setView("session")
  }
  const startInterleaved = (deckIds) => {
    const selectedCards = deckIds.length === 0 ? cards : cards.filter(c => deckIds.includes(c.deck))
    const { newCardCap = 15, reviewCap = 100, catchupDays = 7 } = settings || {}
    const due  = getDueWithCatchup(selectedCards, reviewCap, catchupDays, cards)
    const newC = deckIds.length === 0 ? getNew(cards).slice(0, newCardCap) : getNew(selectedCards).slice(0, newCardCap)
    const combined = [...due, ...newC]
    for (let i = combined.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [combined[i], combined[j]] = [combined[j], combined[i]]
    }
    setInterleavedCards(combined)
    setStudyDeckName(null)
    setSessionCapOverride(combined.length)
    setSessionFocused(false)
    setView("session")
  }
  const startFree = deck => { setStudyDeckName(deck === "all" ? null : deck); setView("free-study") }

  const navClick = id => {
    if (id === "library") { setView("library"); setSelectedDeck(null) }
    else setView(id)
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const due           = useMemo(() => getDueWithCatchup(cards, settings.reviewCap || 100, settings.catchupDays || 7, cards), [cards, settings])
  const totalDueAll   = useMemo(() => getDue(cards).length, [cards])
  const lastSessionDate = useMemo(() => log.reduce((latest, e) => (!latest || e.date > latest) ? e.date : latest, null), [log])
  const gapDays         = lastSessionDate ? Math.floor((Date.now() - new Date(lastSessionDate)) / 86400000) : 0
  const hasGap          = log.length > 0 && gapDays >= 7
  const onboardingShownForGap = hasGap && localStorage.getItem(RETURN_ONBOARD_KEY) === lastSessionDate
  const showReturnCard  = hasGap && !onboardingShownForGap
  const dismissOnboarding = () => { if (lastSessionDate) localStorage.setItem(RETURN_ONBOARD_KEY, lastSessionDate) }
  const inSession       = view === "session" || view === "free-study"

  // ── Sleep onboarding trigger ──────────────────────────────────────────────
  // Show once per account/device after the first-run name overlay is done.
  const showSleepModal = (
    firstRunDone &&
    ready &&
    authChecked &&
    !sleepOnboardSeen &&
    !sleepOnboardComplete(user, isAuthenticated)
  )

  const NAV = [
    { id: "library",      label: "Library",  icon: Ico.library, active: view === "library" || view === "deck" },
    { id: "study-select", label: "Study",    icon: Ico.study,   active: view === "study-select" },
    { id: "stats",        label: "Progress", icon: Ico.stats,   active: view === "stats" },
    { id: "settings",     label: "Settings", icon: Ico.gear,    active: view === "settings" },
  ]

  // ── Skeleton while loading ─────────────────────────────────────────────────
  if (!ready) return (
    <>
      <div className="rapp">
        <div className="rapp-sidebar">
          <div className="rapp-logo"><NidusLogo size={28} withWordmark /></div>
        </div>
        <div className="rapp-main">
          <div className="rapp-wrap">
            <div className="rapp-skel" style={{ height:28, width:100, marginBottom:8 }} />
            <div className="rapp-skel" style={{ height:14, width:160, marginBottom:28 }} />
            {[0,1,2].map(i=>(
              <div key={i} className="rapp-skel" style={{ height:88, borderRadius:20, marginBottom:12 }} />
            ))}
          </div>
        </div>
      </div>
    </>
  )

  return (
    <>
      {!firstRunDone && <FirstRunOverlay onDone={() => setFirstRunDone(true)} />}
      {showSleepModal && (
        <SleepScheduleModal
          settings={settings}
          onUpdateSettings={updateSettings}
          onDone={() => setSleepOnboardSeen(true)}
        />
      )}
      <div className="rapp">
        {!inSession && (
          <div className="rapp-sidebar">
            <div className="rapp-logo"><NidusLogo size={28} withWordmark /></div>
            {NAV.map(n => (
              <div key={n.id} className={`rapp-nav-item${n.active?" active":""}`} onClick={()=>navClick(n.id)}>
                {n.icon(17)}<span>{n.label}</span>
                {n.id==="study-select" && due.length>0 && <span className="rapp-nav-badge">{due.length}</span>}
              </div>
            ))}
            <div className="rapp-sync" style={{ marginTop:"auto", color:syncStatus==="error"?C.again:syncStatus==="saved"?C.accent:C.textMut }}>
              {syncStatus==="saving"&&"● Saving…"}
              {syncStatus==="saved" &&"✓ Saved"}
              {syncStatus==="error" &&"⚠ Sync failed"}
            </div>
          </div>
        )}

        <div className={`rapp-main${inSession?" rapp-main-full":""}`}>
          {isOffline && !inSession && (
            <div className="nid-offline-banner rapp-fadein" style={{ maxWidth:520 }}>
              <div className="nid-offline-dot" />
              <span>Offline: reviews will sync when reconnected.</span>
            </div>
          )}
          {!installPromptDismissed && sessionsCompleted >= 1 && isInstallable() && !inSession && (
            <div className="nid-install-prompt rapp-fadein" style={{ maxWidth:520 }}>
              <span style={{ flex:1, lineHeight:1.55 }}>Add Nidus Recall to your home screen for quick daily access.</span>
              <button className="rapp-btn rapp-btn-primary" style={{ padding:"7px 14px", fontSize:13, flexShrink:0 }}
                onClick={async () => {
                  await triggerInstallPrompt()
                  setInstallPromptDismissed(true)
                  localStorage.setItem('nidus-install-prompt-dismissed', 'true')
                }}>Add</button>
              <button className="rapp-btn rapp-btn-ghost" style={{ padding:"7px 12px", fontSize:13, flexShrink:0 }}
                onClick={() => {
                  setInstallPromptDismissed(true)
                  localStorage.setItem('nidus-install-prompt-dismissed', 'true')
                }}>Not now</button>
            </div>
          )}
          {incompleteSession && !inSession && (
            <div style={{ background:C.warningBg, border:`1px solid ${C.warning}40`, borderRadius:12, padding:"10px 14px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, maxWidth:520 }}>
              <span style={{ fontSize:13, color:C.warningText, lineHeight:1.55 }}>
                You have an incomplete session from {new Date(incompleteSession.date).toLocaleDateString()}.
              </span>
              <button className="rapp-btn rapp-btn-ghost" style={{ padding:"6px 12px", fontSize:12, flexShrink:0 }}
                onClick={markSessionComplete}>
                Dismiss
              </button>
            </div>
          )}
          {view==="library" && (showReturnCard
            ? <ReturnOnboardingCard
                daysSince={gapDays}
                dueCount={totalDueAll}
                onCatchUp={() => { dismissOnboarding(); startSRS(null) }}
                onReviewTen={() => { dismissOnboarding(); startSRS(null, 10) }}
              />
            : <LibraryView cards={cards} decks={decks} deckMeta={deckMeta} onSelectDeck={d=>{setSelectedDeck(d);setView("deck")}} onCreateDeck={addDeck} syncStatus={syncStatus} lastSynced={lastSynced} settings={settings} onCreateSampleDeck={createSampleDeck} deckParentMap={deckParentMap} />
          )}
          {view==="deck"         && <DeckView deckName={selectedDeck} cards={cards} onUpdateCards={updateCards} onBack={()=>setView("library")} decks={decks} settings={settings} onArchiveDeck={archiveDeck} />}
          {view==="study-select" && <StudySelectView cards={cards} decks={decks} settings={settings} onStartSRS={startSRS} onStartFree={startFree} onStartInterleaved={startInterleaved} cardsLoading={!cardsFullyLoaded} />}
          {view==="session"      && <SessionView cards={cards} onUpdateCards={updateCards} onSaveLog={async e=>{await flushCards();await addLog(e)}} onDone={()=>{ setSessionCapOverride(null); setSessionFocused(false); setInterleavedCards(null); setView("study-select") }} settings={settings} studyDeckName={studyDeckName} log={log} capOverride={sessionCapOverride} focused={sessionFocused} isFirstStudy={!settings?.first_study_completed} onFirstStudyComplete={()=>updateSettings({...settings,first_study_completed:true})} onFitParams={newTarget=>updateSettings({...settings, retentionTarget:newTarget})} interleavedCards={interleavedCards} onSessionCompleted={incrementSessionsCompleted} />}
          {view==="free-study"   && <FreeStudyView cards={cards} studyDeckName={studyDeckName} onDone={()=>setView("study-select")} settings={settings} />}
          {view==="stats"        && <StatsView log={log} cards={cards} decks={decks} settings={settings} />}
          {view==="settings"     && <SettingsView settings={settings} onUpdateSettings={updateSettings} cards={cards} decks={decks} onExport={handleExport} onImport={handleImport} onImportCards={handleImportCards} onImportAnki={handleApkgImportCards} schedulerParams={storage.getUserSchedulerParams()} onRefitParams={()=>{ const r=fitSchedulerParams(cards,settings.retentionTarget); if(r.changed) updateSettings({...settings,retentionTarget:r.retentionTarget}); storage.saveUserSchedulerParams(storage.getUserSchedulerParams()?.params||null,r.reviewCount).catch(()=>{}) }} />}
        </div>

        {!inSession && (
          <div className="rapp-bnav">
            {NAV.map(n => (
              <div key={n.id} className={`rapp-bnav-item${n.active?" active":""}`} onClick={()=>navClick(n.id)}>
                <div style={{ position:"relative", display:"inline-flex" }}>
                  {n.icon(22)}
                  {n.id==="study-select" && due.length>0 && (
                    <span style={{ position:"absolute", top:-4, right:-6, width:8, height:8, background:C.again, borderRadius:"50%", border:`1.5px solid ${C.surface}` }} />
                  )}
                </div>
                <span>{n.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
