# Home.jsx Inventory

Total lines: 4253. Generated for the decomposition session.

---

## Concern map

### Routing / state (Root component)
| Item | Lines | Kind |
|------|-------|------|
| `Home` (root export) | 3819-4253 | Component |
| State: view, selectedDeck, studyDeckName, cards, log, decks, deckParentMap, deckMeta, settings, ready, syncStatus, lastSynced, sessionCapOverride, sessionFocused, incompleteSession, interleavedCards, sessionsCompleted | 3820-3836 | State |
| Load effect (storage.loadAll, CardState migration, offlineStore seed) | 3839-3869 | Effect |
| updateCards / flushCards / markSaved (debounced sync) | 3871-3908 | Handlers |
| addLog, markSessionComplete, updateSettings, addDeck | 3910-3946 | Handlers |
| createSampleDeck | 3948-4030 | Handler |
| handleExport / handleImport / handleImportCards | ~4031-4090 | Handlers |
| handleApkgImportCards | ~4091-4130 | Handler |
| archiveDeck, startSRS, startFree, startInterleaved, navClick, dismissOnboarding | ~4130-4200 | Handlers |
| NAV array (sidebar / bottom nav items) | ~4200-4215 | Constant |
| JSX render (sidebar, bottom nav, view switch) | ~4215-4253 | JSX |

### FSRS
| Item | Lines | Kind |
|------|-------|------|
| `RATING_MAP` | 158 | Constant |
| `scheduleFSRS` | 167-201 | Function |
| `fitSchedulerParams` | 213-256 | Function |
| `isActive`, `getDue`, `getNew` | 258-264 | Functions |
| `getDueWithCatchup` | 265-278 | Function |
| `buildReverseIndex` | 281-290 | Function |

### Cloze
| Item | Lines | Kind |
|------|-------|------|
| `CLOZE_RE` | 296 | Constant |
| `parseCloze` | 298-317 | Function |
| `renderClozeFront` | 320-329 | Function |
| `createClozeCards` | 332-366 | Function |

### Image occlusion
| Item | Lines | Kind |
|------|-------|------|
| `createOcclusionCards` | 368-404 | Function |
| `OcclusionCardRenderer` | 406-455 | Component |
| `ImageOcclusionEditor` | 457-665 | Component |

### Heatmap
| Item | Lines | Kind |
|------|-------|------|
| `buildHeatmapData` | 668-677 | Function |
| `ReviewHeatmap` | 679-738 | Component |

### Stats helpers
| Item | Lines | Kind |
|------|-------|------|
| `computeCalibration` | 774-790 | Function |
| `buildCalibrationChart` | 795-820 | Function |
| `computeFatigueScore` | 822-848 | Function |
| `assembleFrictionNote` | 855-861 | Function |

### Deck tree
| Item | Lines | Kind |
|------|-------|------|
| `buildDeckTree` | 740-767 | Function |

### Settings / storage helpers
| Item | Lines | Kind |
|------|-------|------|
| `SK` (localStorage key map) | 97 | Constant |
| `lsGet`, `lsSet` | 98-99 | Functions |
| `isInSleepWindow` | 100-114 | Function |
| `SLEEP_DISMISS_KEY`, `RETURN_ONBOARD_KEY` | 116-117 | Constants |
| `sleepBannerIsDismissed`, `sleepBannerDismiss` | 118-119 | Functions |
| `settingsGet`, `settingsSet` | 121-128 | Functions |
| `notionGet`, `notionSet`, `deckMetaGet`, `deckMetaSet` | 129-132 | Functions |
| `lastSyncGet`, `lastSyncSet` | 133-134 | Functions |
| `DEFAULT_SETTINGS` | 80-94 | Constant |

### Date helpers
| Item | Lines | Kind |
|------|-------|------|
| `localDateStr`, `addDays`, `todayStr` | 137-142 | Functions |
| `genId`, `timeAgo` | 143-152 | Functions |

### AI assist
| Item | Lines | Kind |
|------|-------|------|
| `AIDiffModal` | 1797-1860 | Component (modal) |
| `CardHistoryModal` | 1861-1905 | Component (modal) |
| Dynamic import: `getAiAssist` | 29-34 | Loader |

### Modals / views
| Item | Lines | Kind |
|------|-------|------|
| `OnboardingView` | 1383-1406 | View |
| `LibraryView` | 1407-1538 | View |
| `EditCardModal` | 1539-1796 | Modal |
| `DeckView` | 1906-2325 | View |
| `StudySelectView` | 2326-2447 | View |
| `SessionView` | 2448-2884 | View |
| `FreeStudyView` | 2885-3040 | View |
| `StatsView` | 3041-3248 | View |
| `SettingsView` | 3249-3573 | View |
| `ImportExportPanel` | 3574-3787 | Component (inside Settings) |
| `ReturnOnboardingCard` | 3788-3817 | Component |

### Styles
| Item | Lines | Kind |
|------|-------|------|
| `C` (palette object) | 36-69 | Constant |
| `CSS` (template literal, injected via `<style>`) | 863-1231 | CSS string |
| `:root { --sage }`, dark mode overrides, all rapp-* and nid-* classes | 863-1231 | CSS |

### Shared UI primitives (used in multiple views)
| Item | Lines | Kind |
|------|-------|------|
| `Ico` (icon map) | 1234-1243 | Constant |
| `BADGE_COLORS` | 1246-1251 | Constant |
| `Badge` | 1253-1256 | Component |
| `CharCount` | 1258-1261 | Component |
| `TagInput` | 1263-1292 | Component |
| `NoteToggle` | 1294-1314 | Component |
| `AnchorToggle` | 1315-1339 | Component |
| `CardPicker` | 1340-1382 | Component |

### Constants (file-level)
| Item | Lines | Kind |
|------|-------|------|
| `FRONT_MAX`, `BACK_MAX`, `NOTE_MAX`, `ANCHOR_MAX`, `SOURCE_MAX` | 72-76 | Constants |
| `TAG_MAX_LEN`, `TAG_MAX_COUNT` | 77-78 | Constants |

### Dynamic loaders (side effects)
| Item | Lines | Kind |
|------|-------|------|
| `getAnkiModule` (sql.js, on-demand) | 15-18 | Loader |
| `getFsrsOptimizer` (gradient descent, on-demand) | 21-26 | Loader |
| `getAiAssist` (AI safety layer, on-demand) | 29-34 | Loader |

---

## Target structure after decomposition

```
src/
  lib/
    fsrs.js          scheduleFSRS, fitSchedulerParams, RATING_MAP, isActive, getDue, getNew,
                     getDueWithCatchup, buildReverseIndex
    cloze.js         CLOZE_RE, parseCloze, renderClozeFront, createClozeCards
    occlusion.js     createOcclusionCards
    heatmap.js       buildHeatmapData
    deck-tree.js     buildDeckTree
    settings.js      DEFAULT_SETTINGS, SK, lsGet, lsSet, settingsGet, settingsSet,
                     notionGet, notionSet, deckMetaGet, deckMetaSet, lastSyncGet, lastSyncSet,
                     isInSleepWindow, sleepBannerIsDismissed, sleepBannerDismiss,
                     SLEEP_DISMISS_KEY, RETURN_ONBOARD_KEY
    dates.js         localDateStr, addDays, todayStr, genId, timeAgo
    stats.js         computeCalibration, buildCalibrationChart, computeFatigueScore,
                     assembleFrictionNote
  components/
    Badge.jsx
    CharCount.jsx
    TagInput.jsx
    NoteToggle.jsx
    AnchorToggle.jsx
    CardPicker.jsx
    OcclusionCardRenderer.jsx
    ImageOcclusionEditor.jsx
    ReviewHeatmap.jsx
    ImportExportPanel.jsx
    ReturnOnboardingCard.jsx
  views/
    LibraryView.jsx
    OnboardingView.jsx
    DeckView.jsx
    StudySelectView.jsx
    SessionView.jsx
    FreeStudyView.jsx
    StatsView.jsx
    SettingsView.jsx
  modals/
    EditCardModal.jsx
    AIDiffModal.jsx
    CardHistoryModal.jsx
  store/
    index.js         Zustand slices: useCardStore, useDeckStore, useSessionStore,
                     useSettingsStore, useUIStore
  styles/
    tokens.css       :root CSS variables from C palette
    app.css          all rapp-* and nid-* classes (moved from CSS string in Home.jsx)
  pages/
    Home.jsx         router shell only, target <200 lines
```
