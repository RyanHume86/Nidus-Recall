// ts-fsrs: MIT license, open-spaced-repetition/ts-fsrs, reference FSRS-5 implementation.
import { fsrs, generatorParameters, Rating } from 'ts-fsrs'

export const RATING_MAP = {
  again: Rating.Again,
  hard:  Rating.Hard,
  good:  Rating.Good,
  easy:  Rating.Easy,
}

/**
 * scheduleFSRS: wraps ts-fsrs to produce { stability, difficulty, interval }.
 * Accepts an optional `now` Date for deterministic testing.
 * Uses per-user params (array) when provided; else ts-fsrs defaults.
 *
 * FSRS algorithm per Supermemo (Wozniak) and the open-spaced-repetition project.
 */
export const scheduleFSRS = (card, rating, retentionTarget = 0.9, schedulerParams = null, now = new Date()) => {
  const params = generatorParameters({
    request_retention: retentionTarget,
    ...(schedulerParams && Array.isArray(schedulerParams) ? { w: schedulerParams } : {}),
  })
  const f = fsrs(params)

  const isNew = !card.reviewCount
  const tsCard = {
    due:            card.nextReview ? new Date(card.nextReview) : now,
    stability:      card.stability  ?? 0,
    difficulty:     isNew ? 0 : (card.difficulty ?? 0),
    elapsed_days:   card.lastReview
      ? Math.max(0, Math.floor((now - new Date(card.lastReview)) / 86400000))
      : 0,
    scheduled_days: card.interval   ?? 0,
    reps:           card.reviewCount ?? 0,
    lapses:         card.lapses      ?? 0,
    state:          card.reviewCount ? 2 : 0,  // Review=2, New=0
    last_review:    card.lastReview ? new Date(card.lastReview) : now,
  }

  const result    = f.repeat(tsCard, now)
  const scheduled = result[RATING_MAP[rating]]
  const newCard   = scheduled.card
  const interval  = Math.max(1, Math.round(newCard.scheduled_days || 1))

  return { stability: newCard.stability, difficulty: newCard.difficulty, interval }
}

/**
 * fitSchedulerParams: synchronous retention-target adjustment from observed recall.
 * Async gradient descent (via fsrs-optimizer) is NOT included here; that path
 * stays in the component layer where it can call storage.saveUserSchedulerParams.
 */
export const fitSchedulerParams = (allCards, currentRetentionTarget = 0.9) => {
  const events = []
  for (const card of allCards) {
    for (const entry of (card.ratingHistory || [])) events.push(entry.rating)
  }
  if (events.length < 200) return { retentionTarget: currentRetentionTarget, reviewCount: events.length, changed: false }

  const observedAccuracy = events.filter(r => r !== 'again').length / events.length
  let newTarget = currentRetentionTarget
  if (observedAccuracy > currentRetentionTarget + 0.05)
    newTarget = Math.max(0.70, Math.round((currentRetentionTarget - 0.02) * 100) / 100)
  else if (observedAccuracy < currentRetentionTarget - 0.05)
    newTarget = Math.min(0.97, Math.round((currentRetentionTarget + 0.02) * 100) / 100)

  return {
    retentionTarget: newTarget,
    reviewCount: events.length,
    changed: newTarget !== currentRetentionTarget,
    observedAccuracy,
  }
}

export const isActive = c => c.status !== 'Parked' && c.status !== 'Archived' && c.status !== 'Deleted'

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export const getDue = (cs) =>
  cs.filter(c => isActive(c) && c.nextReview && c.nextReview <= todayStr())
    .sort((a, b) => {
      const d = a.nextReview.localeCompare(b.nextReview)
      return d !== 0 ? d : (b.stakes_flag ? 1 : 0) - (a.stakes_flag ? 1 : 0)
    })

export const getNew = (cs) => cs.filter(c => isActive(c) && !c.nextReview)

export const getDueWithCatchup = (cs, cap, days, allCards = null) => {
  const lookup = allCards || cs
  let all = getDue(cs).filter(card => {
    if (!card.prerequisite_card_id) return true
    const prereq = lookup.find(c => c.id === card.prerequisite_card_id)
    if (!prereq) return true
    return prereq.stability != null && prereq.stability >= 7
  })
  if (!all.length) return []
  const effectiveCap = Math.min(cap, Math.ceil(all.length / days))
  if (all.length <= effectiveCap) return all
  // Stakes cards always survive the cap cut; non-stakes fill remaining slots
  const stakes    = all.filter(c => c.stakes_flag)
  const nonStakes = all.filter(c => !c.stakes_flag)
  const stakesCapped = stakes.slice(0, effectiveCap)
  const remaining    = Math.max(0, effectiveCap - stakesCapped.length)
  return [...stakesCapped, ...nonStakes.slice(0, remaining)]
}

export const getStakesDue = (cs, allCards = null) =>
  getDueWithCatchup(cs, Infinity, 1, allCards).filter(c => c.stakes_flag)

export const buildReverseIndex = (cards) => {
  const index = {}
  for (const card of cards) {
    for (const targetId of (card.connects_to || [])) {
      if (!index[targetId]) index[targetId] = []
      if (!index[targetId].includes(card.id)) index[targetId].push(card.id)
    }
  }
  return index
}
