import { create } from 'zustand'
import * as storage from '@/api/storage'
import * as offlineStore from '@/lib/offline-store'
import { settingsGet, settingsSet, deckMetaGet, deckMetaSet, lastSyncGet, lastSyncSet } from '@/lib/settings'
import { migrateNotionCredentials } from '@/api/notionSettings'
import { genId } from '@/lib/dates'
import { createClozeCards } from '@/lib/cloze'
import { createOcclusionCards } from '@/lib/occlusion'

// Timer IDs stored as plain object fields — Zustand supports non-serializable values.
// These do not trigger re-renders when mutated via get().

export const useAppStore = create((set, get) => ({
  // ── Data ─────────────────────────────────────────────────────────────────────
  cards: [],
  log: [],
  decks: [],
  deckParentMap: new Map(),
  deckMeta: deckMetaGet(),
  settings: settingsGet(),
  ready: false,
  cardsFullyLoaded: true,

  // ── Sync ─────────────────────────────────────────────────────────────────────
  syncStatus: 'idle',
  lastSynced: lastSyncGet(),

  // ── Session ──────────────────────────────────────────────────────────────────
  incompleteSession: null,
  sessionsCompleted: 0,

  // ── PWA / network ────────────────────────────────────────────────────────────
  isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  installPromptDismissed:
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('nidus-install-prompt-dismissed') === 'true'
      : false,

  // ── Internal timer refs (non-reactive) ───────────────────────────────────────
  _pendingCards: null,
  _saveTimer: null,
  _savedTimer: null,
  _cardStateTimer: null,

  // ── Actions ──────────────────────────────────────────────────────────────────

  markSaved: () => {
    const { _savedTimer } = get()
    if (_savedTimer) clearTimeout(_savedTimer)
    lastSyncSet()
    const iso = new Date().toISOString()
    const newTimer = setTimeout(() => set({ syncStatus: 'idle' }), 2000)
    set({ syncStatus: 'saved', lastSynced: iso, _savedTimer: newTimer })
  },

  updateCards: (updated) => {
    const { _saveTimer, _cardStateTimer, markSaved } = get()
    if (_saveTimer) clearTimeout(_saveTimer)
    if (_cardStateTimer) clearTimeout(_cardStateTimer)
    const newSaveTimer = setTimeout(() => {
      const { _pendingCards } = get()
      if (_pendingCards) storage.syncCards(_pendingCards).then(markSaved).catch(() => set({ syncStatus: 'error' }))
    }, 800)
    const newCardStateTimer = setTimeout(() => {
      const { _pendingCards } = get()
      if (_pendingCards) storage.syncCardStates(_pendingCards).catch(() => {})
    }, 800)
    set({ cards: updated, _pendingCards: updated, syncStatus: 'saving', _saveTimer: newSaveTimer, _cardStateTimer: newCardStateTimer })
    return Promise.resolve()
  },

  flushCards: async () => {
    const { _saveTimer, _cardStateTimer, _pendingCards, markSaved } = get()
    if (_saveTimer) clearTimeout(_saveTimer)
    if (_cardStateTimer) clearTimeout(_cardStateTimer)
    if (_pendingCards) {
      set({ syncStatus: 'saving' })
      try {
        await Promise.all([
          storage.syncCards(_pendingCards),
          storage.syncCardStates(_pendingCards),
        ])
        markSaved()
      } catch {
        set({ syncStatus: 'error' })
      }
    }
  },

  addLog: async (entry) => {
    set(state => ({ log: [entry, ...state.log] }))
    return storage.appendLog(entry)
  },

  updateSettings: (s) => {
    settingsSet(s)
    set({ settings: s })
  },

  addDeck: async (name) => {
    const t = name.trim()
    if (!t) return
    const { decks } = get()
    if (decks.includes(t)) return
    set(state => ({ decks: [...state.decks, t] }))
    await storage.ensureDeck(t)
  },

  archiveDeck: (name) => {
    const { deckMeta } = get()
    const next = { ...deckMeta, [name]: { ...deckMeta[name], archived: !(deckMeta[name]?.archived) } }
    deckMetaSet(next)
    set({ deckMeta: next })
  },

  createSampleDeck: async () => {
    const { cards, decks, updateCards } = get()
    const deckName = 'Common Pharmacology: Essentials'
    if (!decks.includes(deckName)) {
      set(state => ({ decks: [...state.decks, deckName] }))
      await storage.ensureDeck(deckName)
    }
    const mk = (front, back, contentType, tags) => ({
      id: genId(), front, back, deck: deckName, contentType: contentType || 'Factual',
      cardType: 'basic', clozeText: null, clozeIndex: null,
      status: 'Active', interval: 1, reviewCount: 0, lapses: 0, ratingHistory: [],
      connects_to: [], stability: null, difficulty: null, nextReview: null,
      lastReview: null, elaboration: '', anchor: null, source: 'BNF / standard pharmacology reference',
      stakes_flag: false, prerequisite_card_id: null, tags: tags || [],
      imageUrl: null, occlusionRegions: null, occlusionRegionId: null,
      createdAt: new Date().toISOString(),
    })
    const mkCloze = (clozeText, tags) => createClozeCards(clozeText, deckName).map(c => ({
      ...c, source: 'BNF / standard pharmacology reference', tags: tags || [],
    }))
    const basicCards = [
      mk('What is the mechanism of action of beta-blockers?', 'Competitive antagonism of beta-adrenoceptors (beta-1 selective agents primarily block cardiac receptors). Reduces heart rate, contractility, and renin release.', 'Mechanism', ['beta-blockers','cardiology']),
      mk('Name four major indications for beta-blockers.', 'Hypertension, angina, heart failure with reduced ejection fraction (with up-titration), and rate control in atrial fibrillation.', 'Clinical Reasoning', ['beta-blockers','cardiology']),
      mk('What are the key contraindications to non-selective beta-blockers?', 'Severe asthma or COPD (risk of bronchospasm), second/third-degree heart block, and uncontrolled heart failure. Use with caution in peripheral arterial disease.', 'Factual', ['beta-blockers','contraindications']),
      mk('What is the mechanism of ACE inhibitors?', 'Block angiotensin-converting enzyme, preventing conversion of angiotensin I to angiotensin II. Reduces vasoconstriction, aldosterone secretion, and sodium retention.', 'Mechanism', ['ACE-inhibitors','cardiology']),
      mk('Why do ACE inhibitors cause a dry cough?', 'Inhibition of ACE reduces breakdown of bradykinin. Accumulated bradykinin stimulates pulmonary C-fibres, causing a dry persistent cough in approximately 10-15% of patients.', 'Mechanism', ['ACE-inhibitors','side-effects']),
      mk('What is the mechanism of statins?', 'Competitive inhibition of HMG-CoA reductase, the rate-limiting enzyme in hepatic cholesterol synthesis. Reduces LDL-C and has pleiotropic anti-inflammatory effects.', 'Mechanism', ['statins','lipids']),
      mk('What are the main contraindications to statin therapy?', 'Pregnancy (teratogenic), breastfeeding, and active liver disease. Caution in myopathy risk (high-dose, drug interactions including ciclosporin, macrolides, fibrates).', 'Factual', ['statins','contraindications']),
      mk('How does warfarin work and what monitoring is required?', 'Inhibits vitamin K epoxide reductase, reducing synthesis of clotting factors II, VII, IX, and X. Monitoring: INR (target 2-3 for most indications; 2.5-3.5 for mechanical heart valves).', 'Mechanism', ['anticoagulants','warfarin']),
      mk('Name two classes of drugs that significantly increase warfarin effect.', 'Enzyme inhibitors that reduce warfarin metabolism: azole antifungals (fluconazole), metronidazole. Also: amiodarone, ciprofloxacin. Enzyme inducers (rifampicin, carbamazepine) decrease effect.', 'Factual', ['anticoagulants','warfarin','interactions']),
      mk('What is the mechanism of metformin and its primary indication?', 'Activates AMPK, reducing hepatic gluconeogenesis and increasing peripheral insulin sensitivity. First-line pharmacological treatment for type 2 diabetes mellitus.', 'Mechanism', ['diabetes','metformin']),
    ]
    const clozeCards = [
      ...mkCloze("Warfarin works by inhibiting {{c1::vitamin K epoxide reductase}}, reducing synthesis of clotting factors {{c2::II, VII, IX, X}}.", ['warfarin','cloze']),
      ...mkCloze("The commonest side effect of ACE inhibitors is {{c1::dry cough}}, caused by accumulation of {{c2::bradykinin}}.", ['ACE-inhibitors','cloze']),
      ...mkCloze("Metformin reduces hepatic {{c1::gluconeogenesis}} by activating {{c2::AMPK}}.", ['metformin','cloze']),
    ]
    const pharmacologyDiagramUrl = 'data:image/svg+xml,' + encodeURIComponent([
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
      ...c, source: 'BNF / standard pharmacology reference', tags: ['beta-blockers','image-occlusion'],
    }))
    const sampleCards = [...basicCards, ...clozeCards, ...occlusionCards]
    await updateCards([...cards, ...sampleCards])
    storage.adjustDeckCount(deckName, sampleCards.length).catch(() => {})
  },

  markSessionComplete: async () => {
    const { incompleteSession } = get()
    if (!incompleteSession) return
    const updatedEntry = { ...incompleteSession, status: 'complete' }
    set(state => ({
      log: state.log.map(e => e.date === incompleteSession.date ? updatedEntry : e),
      incompleteSession: null,
    }))
    if (incompleteSession.id) {
      storage.updateLog(incompleteSession.id, { status: 'complete' }).catch(() => {})
    }
  },

  setIncompleteSession: (s) => set({ incompleteSession: s }),
  setIsOffline: (v) => set({ isOffline: v }),
  setInstallPromptDismissed: (v) => set({ installPromptDismissed: v }),
  incrementSessionsCompleted: () => set(s => ({ sessionsCompleted: s.sessionsCompleted + 1 })),

  // ── Import helpers (called from Root, need store state + actions) ─────────────

  handleImportCards: async (importedCards, onResult) => {
    const { markSaved } = get()
    try {
      set({ syncStatus: 'saving', cards: importedCards, _pendingCards: importedCards })
      await storage.syncCards(importedCards)
      markSaved()
      onResult({ ok: true, count: importedCards.length })
    } catch (err) {
      set({ syncStatus: 'error' })
      onResult({ ok: false, msg: err.message })
    }
  },

  handleApkgImportCards: async (newCards) => {
    const { cards, markSaved } = get()
    const merged = [...cards, ...newCards]
    set({ syncStatus: 'saving', cards: merged, _pendingCards: merged })
    await storage.syncCards(merged)
    markSaved()
    set({ syncStatus: `Imported ${newCards.length} card${newCards.length !== 1 ? 's' : ''} from Anki` })
  },

  // ── Initialisation ───────────────────────────────────────────────────────────

  init: async () => {
    try {
      const { cards: rc, deckNames, log: rl, deckParentMap: dpm, hasMore } = await storage.loadAll()
      set({
        cards: rc,
        log: rl,
        decks: [...new Set(deckNames)],
        cardsFullyLoaded: !hasMore,
        ...(dpm ? { deckParentMap: dpm } : {}),
      })
      const MIGRATION_CACHE_KEY = 'nidus-last-migration-run'
      try {
        const lastRun = localStorage.getItem(MIGRATION_CACHE_KEY)
        const withinCache = lastRun && (Date.now() - Number(lastRun)) < 24 * 60 * 60 * 1000
        if (!withinCache) {
          const result = await storage.runMigration()
          const anyMigrated = result.splitCardState.created > 0
            || result.deckHierarchy.created > 0
            || result.deckHierarchy.updated > 0
          if (anyMigrated) {
            console.log('[Nidus Recall] Migration complete:', result)
          }
          localStorage.setItem(MIGRATION_CACHE_KEY, String(Date.now()))
        }
      } catch (err) {
        // Migration errors are non-fatal; app continues normally.
        console.warn('[Nidus Recall] Migration check failed (non-fatal):', err.message || err)
      }
      set({ ready: true })
      offlineStore.seedFromNetwork({ cards: rc, decks: deckNames, log: rl }).catch(() => {})
      migrateNotionCredentials().catch(() => {})
      // Background: fetch remaining cards in 500-card chunks after ready.
      if (hasMore) {
        ;(async () => {
          let skip = rc.length
          for (;;) {
            try {
              const { cards: page, hasMore: more } = await storage.loadCardsPage(skip)
              if (page.length === 0) break
              set(state => ({ cards: [...state.cards, ...page] }))
              skip += page.length
              if (!more) break
            } catch {
              break
            }
          }
          set({ cardsFullyLoaded: true })
        })()
      }
    } catch {
      set({ ready: true, cardsFullyLoaded: true })
    }
  },
}))
