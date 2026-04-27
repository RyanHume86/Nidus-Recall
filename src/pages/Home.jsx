import { useState, useEffect, useMemo, useRef } from "react"
import * as storage from "@/api/storage"
import { getDue, getDueWithCatchup, getNew } from "@/lib/fsrs"
import { localDateStr, genId } from "@/lib/dates"
import { createClozeCards } from "@/lib/cloze"
import { createOcclusionCards } from "@/lib/occlusion"
import { settingsGet, settingsSet, deckMetaGet, deckMetaSet, lastSyncGet, lastSyncSet, RETURN_ONBOARD_KEY } from "@/lib/settings"
import { fitSchedulerParams } from "@/lib/fit-params"
import { C } from "@/lib/theme"
import { Ico } from "@/lib/icons"
import * as offlineStore from "@/lib/offline-store"
import { isInstallable, triggerInstallPrompt } from "@/lib/pwa"
import { OnboardingView } from "@/views/OnboardingView"
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
  const [view,              setView]              = useState("library")
  const [selectedDeck,      setSelectedDeck]      = useState(null)
  const [studyDeckName,     setStudyDeckName]     = useState(null)
  const [cards,             setCards]             = useState([])
  const [log,               setLog]               = useState([])
  const [decks,             setDecks]             = useState([])
  const [deckParentMap,     setDeckParentMap]     = useState(() => new Map())
  const [deckMeta,          setDeckMeta]          = useState(() => deckMetaGet())
  const [settings,          setSettings]          = useState(() => settingsGet())
  const [ready,             setReady]             = useState(false)
  const [syncStatus,        setSyncStatus]        = useState("idle")
  const [lastSynced,        setLastSynced]        = useState(() => lastSyncGet())
  const [sessionCapOverride,setSessionCapOverride]= useState(null)
  const [sessionFocused,    setSessionFocused]    = useState(false)
  const pendingCards      = useRef(null)
  const saveTimer         = useRef(null)
  const savedTimer        = useRef(null)
  const cardStateTimer    = useRef(null)

  // ── Load ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    storage.loadAll()
      .then(async ({ cards:rc, deckNames, log:rl, deckParentMap:dpm }) => {
        setCards(rc); setLog(rl)
        setDecks([...new Set(deckNames)])
        if (dpm) setDeckParentMap(dpm)
        // Auto-run the CardState migration if any cards have scheduling state
        // but no corresponding CardState record yet.
        // This is idempotent: the migration script checks the migrated flag.
        try {
          const states = await storage.listCardStates()
          const migratedIds = new Set(states.filter(s => s.migrated).map(s => s.cardClientId))
          const needsMigration = rc.some(c => {
            const clientId = c.id
            return !migratedIds.has(clientId) && (c.stability != null || (c.reviewCount || 0) > 0)
          })
          if (needsMigration) {
            console.log('[Nidus Recall] Running CardState migration...')
            const result = await storage.runMigration()
            console.log('[Nidus Recall] Migration complete:', result)
          }
        } catch (_) {
          // Migration errors are non-fatal; app continues normally.
        }
        setReady(true)
        // Mirror loaded data to Dexie for offline access.
        offlineStore.seedFromNetwork({ cards: rc, decks: deckNames, log: rl }).catch(() => {})
      })
      .catch(() => setReady(true))
  }, [])

  // ── Card sync (debounced 800ms) ───────────────────────────────────────────────
  const markSaved = () => {
    setSyncStatus("saved")
    const iso = new Date().toISOString()
    setLastSynced(iso); lastSyncSet()
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSyncStatus("idle"), 2000)
  }

  const updateCards = updated => {
    setCards(updated); pendingCards.current = updated; setSyncStatus("saving")
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (pendingCards.current) storage.syncCards(pendingCards.current).then(markSaved).catch(()=>setSyncStatus("error"))
    }, 800)
    // Also debounce CardState sync (scheduling fields route to CardState entity)
    if (cardStateTimer.current) clearTimeout(cardStateTimer.current)
    cardStateTimer.current = setTimeout(() => {
      if (pendingCards.current) storage.syncCardStates(pendingCards.current).catch(() => {})
    }, 800)
    return Promise.resolve()
  }

  const flushCards = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (cardStateTimer.current) clearTimeout(cardStateTimer.current)
    if (pendingCards.current) {
      setSyncStatus("saving")
      try {
        await Promise.all([
          storage.syncCards(pendingCards.current),
          storage.syncCardStates(pendingCards.current),
        ])
        markSaved()
      }
      catch { setSyncStatus("error") }
    }
  }

  const addLog = async entry => {
    setLog(l => [entry, ...l])
    const entity = await storage.appendLog(entry)
    return entity
  }

  const [incompleteSession, setIncompleteSession] = useState(null)

  // Check for in-progress sessions on load (run once after initial data loads)
  useEffect(() => {
    if (log.length > 0 && incompleteSession === null) {
      const incomplete = log.find(e => e.status === "in-progress")
      if (incomplete) setIncompleteSession(incomplete)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  const markSessionComplete = async () => {
    if (!incompleteSession) return
    // Update local state to mark the session complete
    const updatedEntry = { ...incompleteSession, status: "complete" }
    setLog(l => l.map(e => e.date === incompleteSession.date ? updatedEntry : e))
    // If we have an entity id, persist to Base44
    if (incompleteSession.id) {
      storage.updateLog(incompleteSession.id, { status: "complete" }).catch(() => {})
    }
    setIncompleteSession(null)
  }

  const updateSettings = s => { setSettings(s); settingsSet(s) }

  const addDeck = async name => {
    const t = name.trim()
    if (!t || decks.includes(t)) return
    setDecks(d => [...d, t])
    await storage.ensureDeck(t)
  }

  const createSampleDeck = async () => {
    const deckName = "Common Pharmacology: Essentials"
    if (!decks.includes(deckName)) {
      setDecks(d => [...d, deckName])
      await storage.ensureDeck(deckName)
    }
    const mk = (front, back, contentType, tags, cardType, clozeText, clozeIndex) => ({
      id: genId(), front, back, deck: deckName, contentType: contentType || "Factual",
      cardType: cardType || "basic", clozeText: clozeText || null, clozeIndex: clozeIndex || null,
      status: "Active", interval: 1, reviewCount: 0, lapses: 0, ratingHistory: [],
      connects_to: [], stability: null, difficulty: null, nextReview: null,
      lastReview: null, elaboration: "", anchor: null, source: "BNF / standard pharmacology reference",
      stakes_flag: false, prerequisite_card_id: null, tags: tags || [],
      imageUrl: null, occlusionRegions: null, occlusionRegionId: null,
      createdAt: new Date().toISOString(),
    })
    // Build cloze cards using parseCloze so front/back are pre-computed.
    const mkCloze = (clozeText, tags) => createClozeCards(clozeText, deckName).map(c => ({
      ...c, source: "BNF / standard pharmacology reference", tags: tags || [],
    }))
    const basicCards = [
      mk("What is the mechanism of action of beta-blockers?", "Competitive antagonism of beta-adrenoceptors (beta-1 selective agents primarily block cardiac receptors). Reduces heart rate, contractility, and renin release.", "Mechanism", ["beta-blockers","cardiology"]),
      mk("Name four major indications for beta-blockers.", "Hypertension, angina, heart failure with reduced ejection fraction (with up-titration), and rate control in atrial fibrillation.", "Clinical Reasoning", ["beta-blockers","cardiology"]),
      mk("What are the key contraindications to non-selective beta-blockers?", "Severe asthma or COPD (risk of bronchospasm), second/third-degree heart block, and uncontrolled heart failure. Use with caution in peripheral arterial disease.", "Factual", ["beta-blockers","contraindications"]),
      mk("What is the mechanism of ACE inhibitors?", "Block angiotensin-converting enzyme, preventing conversion of angiotensin I to angiotensin II. Reduces vasoconstriction, aldosterone secretion, and sodium retention.", "Mechanism", ["ACE-inhibitors","cardiology"]),
      mk("Why do ACE inhibitors cause a dry cough?", "Inhibition of ACE reduces breakdown of bradykinin. Accumulated bradykinin stimulates pulmonary C-fibres, causing a dry persistent cough in approximately 10-15% of patients.", "Mechanism", ["ACE-inhibitors","side-effects"]),
      mk("What is the mechanism of statins?", "Competitive inhibition of HMG-CoA reductase, the rate-limiting enzyme in hepatic cholesterol synthesis. Reduces LDL-C and has pleiotropic anti-inflammatory effects.", "Mechanism", ["statins","lipids"]),
      mk("What are the main contraindications to statin therapy?", "Pregnancy (teratogenic), breastfeeding, and active liver disease. Caution in myopathy risk (high-dose, drug interactions including ciclosporin, macrolides, fibrates).", "Factual", ["statins","contraindications"]),
      mk("How does warfarin work and what monitoring is required?", "Inhibits vitamin K epoxide reductase, reducing synthesis of clotting factors II, VII, IX, and X. Monitoring: INR (target 2-3 for most indications; 2.5-3.5 for mechanical heart valves).", "Mechanism", ["anticoagulants","warfarin"]),
      mk("Name two classes of drugs that significantly increase warfarin effect.", "Enzyme inhibitors that reduce warfarin metabolism: azole antifungals (fluconazole), metronidazole. Also: amiodarone, ciprofloxacin. Enzyme inducers (rifampicin, carbamazepine) decrease effect.", "Factual", ["anticoagulants","warfarin","interactions"]),
      mk("What is the mechanism of metformin and its primary indication?", "Activates AMPK, reducing hepatic gluconeogenesis and increasing peripheral insulin sensitivity. First-line pharmacological treatment for type 2 diabetes mellitus.", "Mechanism", ["diabetes","metformin"]),
    ]
    const clozeText1 = "Warfarin works by inhibiting {{c1::vitamin K epoxide reductase}}, reducing synthesis of clotting factors {{c2::II, VII, IX, X}}."
    const clozeText2 = "The commonest side effect of ACE inhibitors is {{c1::dry cough}}, caused by accumulation of {{c2::bradykinin}}."
    const clozeText3 = "Metformin reduces hepatic {{c1::gluconeogenesis}} by activating {{c2::AMPK}}."
    const clozeCards = [
      ...mkCloze(clozeText1, ["warfarin","cloze"]),
      ...mkCloze(clozeText2, ["ACE-inhibitors","cloze"]),
      ...mkCloze(clozeText3, ["metformin","cloze"]),
    ]
    // Self-contained SVG data URL: no external dependency needed.
    // Demonstrates image occlusion on the Beta-Blocker Pathway diagram.
    const pharmacologyDiagramUrl = "data:image/svg+xml," + encodeURIComponent([
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">',
      '<rect width="400" height="200" fill="#F5F0EB"/>',
      '<text x="200" y="30" text-anchor="middle" font-family="system-ui" font-size="14" font-weight="600" fill="#2D6E52">Beta-Blocker Pathway</text>',
      '<rect x="30" y="50" width="100" height="40" rx="6" fill="#DFE8E3" stroke="#2D6E52" stroke-width="1.5"/>',
      '<text x="80" y="75" text-anchor="middle" font-family="system-ui" font-size="11" fill="#1a3d2b">Beta-1 Receptor</text>',
      '<rect x="160" y="50" width="100" height="40" rx="6" fill="#DFE8E3" stroke="#2D6E52" stroke-width="1.5"/>',
      '<text x="210" y="75" text-anchor="middle" font-family="system-ui" font-size="11" fill="#1a3d2b">Adenylyl Cyclase</text>',
      '<rect x="290" y="50" width="80" height="40" rx="6" fill="#DFE8E3" stroke="#2D6E52" stroke-width="1.5"/>',
      '<text x="330" y="75" text-anchor="middle" font-family="system-ui" font-size="11" fill="#1a3d2b">cAMP</text>',
      '<line x1="130" y1="70" x2="160" y2="70" stroke="#2D6E52" stroke-width="1.5" marker-end="url(#arr)"/>',
      '<line x1="260" y1="70" x2="290" y2="70" stroke="#2D6E52" stroke-width="1.5" marker-end="url(#arr)"/>',
      '<rect x="130" y="120" width="120" height="40" rx="6" fill="#b3d4bc" stroke="#2D6E52" stroke-width="1.5"/>',
      '<text x="190" y="145" text-anchor="middle" font-family="system-ui" font-size="11" font-weight="600" fill="#1a3d2b">Beta-Blocker BLOCKS</text>',
      '<line x1="190" y1="120" x2="190" y2="90" stroke="#1a3d2b" stroke-width="1.5" stroke-dasharray="4,2"/>',
      '<defs><marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#2D6E52"/></marker></defs>',
      '</svg>',
    ].join(''))
    const occlusionRegions = [
      { id: 'region-adenylyl', label: 'Adenylyl Cyclase', type: 'rect', x: 0.4, y: 0.25, width: 0.25, height: 0.20 },
      { id: 'region-camp',     label: 'cAMP',             type: 'rect', x: 0.725, y: 0.25, width: 0.20, height: 0.20 },
    ]
    const occlusionCards = createOcclusionCards(pharmacologyDiagramUrl, occlusionRegions, deckName).map(c => ({
      ...c, source: "BNF / standard pharmacology reference", tags: ["beta-blockers","image-occlusion"],
    }))
    const sampleCards = [...basicCards, ...clozeCards, ...occlusionCards]
    await updateCards([...cards, ...sampleCards])
    storage.adjustDeckCount(deckName, sampleCards.length).catch(()=>{})
  }

  const archiveDeck = name => {
    const next = { ...deckMeta, [name]: { ...deckMeta[name], archived: !(deckMeta[name]?.archived) } }
    setDeckMeta(next); deckMetaSet(next)
  }

  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ version:3, exportedAt:new Date().toISOString(), cards, log, decks }, null, 2)], { type:"application/json" })
    const url = URL.createObjectURL(blob), a = document.createElement("a")
    a.href=url; a.download=`nidus-backup-${localDateStr()}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (file, onResult) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      try {
        const data = JSON.parse(ev.target.result)
        if (!data.cards||!Array.isArray(data.cards)) throw new Error("Invalid format")
        setSyncStatus("saving")
        setCards(data.cards); pendingCards.current = data.cards
        await storage.syncCards(data.cards)
        if (data.decks) { const m = [...new Set(data.decks)]; setDecks(m); await Promise.all(m.map(storage.ensureDeck)) }
        if (data.log)   { setLog(data.log); await Promise.all(data.log.map(e=>storage.appendLog(e).catch(()=>{}))) }
        markSaved(); onResult({ ok:true, count:data.cards.length })
      } catch(err) { setSyncStatus("error"); onResult({ ok:false, msg:err.message }) }
    }
    reader.readAsText(file)
  }

  const handleImportCards = async (importedCards, onResult) => {
    try {
      setSyncStatus("saving"); setCards(importedCards); pendingCards.current = importedCards
      await storage.syncCards(importedCards); markSaved()
      onResult({ ok:true, count:importedCards.length })
    } catch(err) { setSyncStatus("error"); onResult({ ok:false, msg:err.message }) }
  }

  // handleApkgImportCards: called from ImportExportPanel after Anki import is confirmed.
  // Merges newly imported cards with existing cards and syncs to Base44.
  const handleApkgImportCards = async (newCards) => {
    const merged = [...cards, ...newCards]
    setSyncStatus("saving")
    setCards(merged)
    pendingCards.current = merged
    await storage.syncCards(merged)
    markSaved()
    setSyncStatus(`Imported ${newCards.length} card${newCards.length !== 1 ? 's' : ''} from Anki`)
  }

  // ── Offline / PWA state ───────────────────────────────────────────────────────
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine)
  const [installPromptDismissed, setInstallPromptDismissed] = useState(
    () => localStorage.getItem('nidus-install-prompt-dismissed') === 'true'
  )
  const [sessionsCompleted, setSessionsCompleted] = useState(0)

  useEffect(() => {
    const handleOnline  = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    // Drain any pending offline ratings on reconnect.
    const cleanupReconnect = offlineStore.onReconnect(async () => {
      try {
        const { flushed } = await offlineStore.drainQueue(storage.syncCardState)
        if (flushed > 0) setSyncStatus(`Synced ${flushed} offline rating${flushed !== 1 ? 's' : ''}`)
      } catch (_) {}
    })
    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
      cleanupReconnect()
    }
  }, [])

  const [interleavedCards, setInterleavedCards] = useState(null)
  const startSRS  = (deck, capOverride=null, focused=false) => { setStudyDeckName(deck==="all"?null:deck); setSessionCapOverride(capOverride); setSessionFocused(focused); setInterleavedCards(null); setView("session") }
  const startInterleaved = (deckIds) => {
    // Fisher-Yates shuffle of all due cards from selected decks.
    const selectedCards = deckIds.length === 0 ? cards : cards.filter(c => deckIds.includes(c.deck))
    const { newCardCap=15, reviewCap=100, catchupDays=7 } = settings||{}
    const due = getDueWithCatchup(selectedCards, reviewCap, catchupDays, cards)
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
  const startFree = deck => { setStudyDeckName(deck==="all"?null:deck); setView("free-study") }

  const due = useMemo(() => getDueWithCatchup(cards, settings.reviewCap||100, settings.catchupDays||7, cards), [cards, settings])

  // ── Return-after-gap re-onboarding ──────────────────────────────────────────
  const lastSessionDate = useMemo(() => log.reduce((latest, e) => (!latest || e.date > latest) ? e.date : latest, null), [log])
  const gapDays = lastSessionDate ? Math.floor((Date.now() - new Date(lastSessionDate)) / 86400000) : 0
  const hasGap  = log.length > 0 && gapDays >= 7
  const onboardingShownForGap = hasGap && localStorage.getItem(RETURN_ONBOARD_KEY) === lastSessionDate
  const showReturnCard = hasGap && !onboardingShownForGap

  const dismissOnboarding = () => { if (lastSessionDate) localStorage.setItem(RETURN_ONBOARD_KEY, lastSessionDate) }
  const totalDueAll = useMemo(() => getDue(cards).length, [cards])

  const inSession = view==="session" || view==="free-study"

  const NAV = [
    { id:"library",      label:"Library",  icon:Ico.library, active: view==="library"||view==="deck" },
    { id:"study-select", label:"Study",    icon:Ico.study,   active: view==="study-select" },
    { id:"stats",        label:"Stats",    icon:Ico.stats,   active: view==="stats" },
    { id:"settings",     label:"Settings", icon:Ico.gear,    active: view==="settings" },
  ]
  const navClick = id => {
    if (id==="library") { setView("library"); setSelectedDeck(null) }
    else setView(id)
  }

  if (!ready) return (
    <>
      <div className="rapp">
        <div className="rapp-sidebar">
          <div className="rapp-logo"><div className="rapp-logo-dot"/>Nidus Recall</div>
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
      <div className="rapp">
        {!inSession && (
          <div className="rapp-sidebar">
            <div className="rapp-logo"><div className="rapp-logo-dot"/>Nidus Recall</div>
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
          {/* Offline indicator: shown whenever navigator.onLine is false */}
          {isOffline && !inSession && (
            <div className="nid-offline-banner rapp-fadein" style={{ maxWidth:520 }}>
              <div className="nid-offline-dot" />
              <span>Offline: reviews will sync when reconnected.</span>
            </div>
          )}
          {/* PWA install prompt: shown after first completed session, once per device */}
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
          {view==="library"      && (showReturnCard
            ? <ReturnOnboardingCard
                daysSince={gapDays}
                dueCount={totalDueAll}
                onCatchUp={() => { dismissOnboarding(); startSRS(null) }}
                onReviewTen={() => { dismissOnboarding(); startSRS(null, 10) }}
              />
            : <LibraryView cards={cards} decks={decks} deckMeta={deckMeta} onSelectDeck={d=>{setSelectedDeck(d);setView("deck")}} onCreateDeck={addDeck} syncStatus={syncStatus} lastSynced={lastSynced} settings={settings} onCreateSampleDeck={createSampleDeck} deckParentMap={deckParentMap} />
          )}
          {view==="deck"         && <DeckView deckName={selectedDeck} cards={cards} onUpdateCards={updateCards} onBack={()=>setView("library")} decks={decks} settings={settings} onArchiveDeck={archiveDeck} />}
          {view==="study-select" && <StudySelectView cards={cards} decks={decks} settings={settings} onStartSRS={startSRS} onStartFree={startFree} onStartInterleaved={startInterleaved} />}
          {view==="session"      && <SessionView cards={cards} onUpdateCards={updateCards} onSaveLog={async e=>{await flushCards();await addLog(e)}} onDone={()=>{ setSessionCapOverride(null); setSessionFocused(false); setInterleavedCards(null); setView("study-select") }} settings={settings} studyDeckName={studyDeckName} log={log} capOverride={sessionCapOverride} focused={sessionFocused} isFirstStudy={!settings?.first_study_completed} onFirstStudyComplete={()=>updateSettings({...settings,first_study_completed:true})} onFitParams={newTarget=>updateSettings({...settings, retentionTarget:newTarget})} interleavedCards={interleavedCards} onSessionCompleted={()=>setSessionsCompleted(n=>n+1)} />}
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