export const MAX_INTERVAL_CAP = 365

export const DEFAULT_SETTINGS = {
  newCardCap:          15,
  reviewCap:           100,
  leechThreshold:      5,
  retentionTarget:     0.90,
  catchupDays:         7,
  sleepBedtime:        null,
  sleepWindowMinutes:  90,
  sleepBannerEnabled:  true,
  matureModeEnabled:   true,
  matureCardThreshold: 30,
  fatigueAlertsEnabled:        true,
  attentionDeclarationEnabled: true,
  sleepPrefersReviews:         true,
  maximumInterval:     MAX_INTERVAL_CAP,
}

// ─── Local storage helpers ────────────────────────────────────────────────────
export const SK = { settings: "nidus-settings", notion: "nidus-notion", deckMeta: "nidus-deck-meta", lastSync: "nidus-last-sync" }
export const lsGet = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def } catch { return def } }
export const lsSet = (k, v)   => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

// Returns true when local time is within sleepWindowMinutes before sleepBedtime.
// Handles windows that cross midnight (e.g. bedtime 00:30, window 90 min → active from 23:00).
export const isInSleepWindow = (settings) => {
  const { sleepBedtime, sleepWindowMinutes=90, sleepBannerEnabled=true } = settings||{}
  if (!sleepBedtime || !sleepBannerEnabled) return false
  const now   = new Date()
  const [h,m] = sleepBedtime.split(":").map(Number)
  const nowMins = now.getHours()*60 + now.getMinutes()
  const bedMins = h*60 + m
  const start   = bedMins - sleepWindowMinutes
  if (start >= 0) return nowMins >= start && nowMins < bedMins
  // Window crosses midnight: active from (start+1440) to end of day OR before bedtime
  return nowMins >= (start + 1440) || nowMins < bedMins
}

export const SLEEP_DISMISS_KEY   = "nidus-sleep-banner-dismissed"
export const RETURN_ONBOARD_KEY  = "nidus-return-onboarding"
export const sleepBannerIsDismissed = () => localStorage.getItem(SLEEP_DISMISS_KEY) === new Date().toISOString().slice(0,10)
export const sleepBannerDismiss     = () => localStorage.setItem(SLEEP_DISMISS_KEY, new Date().toISOString().slice(0,10))

export const settingsGet  = ()  => {
  const stored = lsGet(SK.settings, {})
  let dirty = false
  // Remove legacy alias keys — newCardCap / reviewCap are the canonical runtime keys.
  if ('dailyNewCardLimit' in stored) { delete stored.dailyNewCardLimit; dirty = true }
  if ('dailyReviewLimit'  in stored) { delete stored.dailyReviewLimit;  dirty = true }
  if (stored.newCardCap === 50) { stored.newCardCap = 15; dirty = true }
  if (stored.reviewCap === 200) { stored.reviewCap = 100; dirty = true }
  if (dirty) lsSet(SK.settings, stored)
  const merged = { ...DEFAULT_SETTINGS, ...stored }
  // Cap maximumInterval at MAX_INTERVAL_CAP for any user who had a higher value.
  if (merged.maximumInterval > MAX_INTERVAL_CAP) {
    if (import.meta.env?.DEV) console.log(`[settings] maximumInterval capped: ${merged.maximumInterval} -> ${MAX_INTERVAL_CAP}`)
    merged.maximumInterval = MAX_INTERVAL_CAP
  }
  return merged
}
export const settingsSet  = (v) => lsSet(SK.settings, v)
export const notionGet    = ()  => lsGet(SK.notion, {})
export const notionSet    = (v) => lsSet(SK.notion, v)
export const deckMetaGet  = ()  => lsGet(SK.deckMeta, {})
export const deckMetaSet  = (v) => lsSet(SK.deckMeta, v)
export const lastSyncGet  = ()  => { try { return localStorage.getItem(SK.lastSync) || null } catch { return null } }
export const lastSyncSet  = ()  => { try { localStorage.setItem(SK.lastSync, new Date().toISOString()) } catch {} }
