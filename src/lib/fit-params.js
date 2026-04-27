import * as storage from "@/api/storage"

// fitSchedulerParams: retention target adjustment + background FSRS-5 gradient
// descent. Synchronous part mirrors src/lib/fsrs.fitSchedulerParams; the async
// gradient-descent path stays here because it writes to storage and requires the
// dynamic fsrs-optimizer import.
//
// Reference: open-spaced-repetition/fsrs-optimizer (gradient descent algorithm).
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

  // Run gradient descent in background. Does not block return value.
  if (events.length >= 200) {
    getFsrsOptimizer().then(async ({ fitParams, buildReviewLog, DEFAULT_PARAMS }) => {
      try {
        const reviewLog = buildReviewLog(allCards)
        const currentParams = storage.getUserSchedulerParams()?.params || DEFAULT_PARAMS
        const { params, loss, fitted } = fitParams(reviewLog, currentParams)
        if (fitted) {
          await storage.saveUserSchedulerParams(params, events.length)
          console.log('[Nidus Recall] FSRS-5 gradient descent complete. Loss:', loss)
        }
      } catch (err) {
        console.warn('[Nidus Recall] FSRS gradient descent failed (non-fatal):', err)
      }
    }).catch(() => {})
  }

  return { retentionTarget: newTarget, reviewCount: events.length, changed: newTarget !== currentRetentionTarget, observedAccuracy }
}
