import * as storage from "@/api/storage"

// fitSchedulerParams: retention target adjustment from observed recall accuracy,
// with a background pass that tunes the forgetting-curve exponent (w[17]).
//
// The synchronous return value adjusts settings.retentionTarget up or down by
// 0.02 when observed recall diverges from target by more than 5 percentage points.
//
// The async background pass calls tuneRetentionTarget from fsrs-optimizer.js,
// which fits only w[17] (theta) via gradient descent. All other FSRS-5 parameters
// stay at published defaults. Full 19-parameter optimisation is a planned feature.
let fsrsOptimizerModule = null
const getFsrsOptimizer = async () => {
  if (!fsrsOptimizerModule) fsrsOptimizerModule = await import('./fsrs-optimizer.js')
  return fsrsOptimizerModule
}

export const fitSchedulerParams = (allCards, currentRetentionTarget = 0.9) => {
  const events = []
  for (const card of allCards) {
    for (const entry of (card.ratingHistory || [])) events.push(entry.rating)
  }
  if (events.length < 200) return { retentionTarget: currentRetentionTarget, reviewCount: events.length, changed: false }

  const observedAccuracy = events.filter(r => r !== "again").length / events.length
  let newTarget = currentRetentionTarget
  if (observedAccuracy > currentRetentionTarget + 0.05)
    newTarget = Math.max(0.70, Math.round((currentRetentionTarget - 0.02) * 100) / 100)
  else if (observedAccuracy < currentRetentionTarget - 0.05)
    newTarget = Math.min(0.97, Math.round((currentRetentionTarget + 0.02) * 100) / 100)

  // Tune w[17] in background; does not block return value.
  if (events.length >= 200) {
    getFsrsOptimizer().then(async ({ tuneRetentionTarget, buildReviewLog, DEFAULT_PARAMS }) => {
      try {
        const reviewLog = buildReviewLog(allCards)
        const currentParams = storage.getUserSchedulerParams()?.params || DEFAULT_PARAMS
        const { params, loss, fitted } = tuneRetentionTarget(reviewLog, currentParams)
        if (fitted) {
          await storage.saveUserSchedulerParams(params, events.length)
          console.log('[Nidus Recall] Retention curve tuning complete. Loss:', loss)
        }
      } catch (err) {
        console.warn('[Nidus Recall] Retention curve tuning failed (non-fatal):', err)
      }
    }).catch(() => {})
  }

  return { retentionTarget: newTarget, reviewCount: events.length, changed: newTarget !== currentRetentionTarget, observedAccuracy }
}
