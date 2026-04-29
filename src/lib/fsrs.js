// ts-fsrs: MIT license, open-spaced-repetition/ts-fsrs, reference FSRS-5 implementation.
import { fsrs, generatorParameters, Rating, CLAMP_PARAMETERS } from 'ts-fsrs'
import { localDateStr } from './dates.js'
import { settingsGet } from './settings.js'

export const RATING_MAP = {
  again: Rating.Again,
  hard:  Rating.Hard,
  good:  Rating.Good,
  easy:  Rating.Easy,
}

/**
 * Canonical FSRS-5 parameter clamp ranges sourced from ts-fsrs (CLAMP_PARAMETERS).
 * Indices 0 to 16 are FSRS-4 weights; 17 and 18 are FSRS-5 additions.
 * If a future ts-fsrs version updates these ranges the validator follows automatically.
 */
const FSRS_PARAM_RANGES = CLAMP_PARAMETERS

export class FsrsParamValidationError extends Error {
  constructor(message, { index, value, reason }) {
    super(message)
    this.name = 'FsrsParamValidationError'
    this.index = index
    this.value = value
    this.reason = reason
  }
}

/**
 * validateFsrsParams: rejects malformed or out-of-range FSRS weight arrays.
 * Accepts arrays of length 17 (FSRS-4), 18 (FSRS-4.5 transitional), or 19 (FSRS-5).
 * Throws FsrsParamValidationError on the first failing element with { index, value, reason }.
 * Returns true on success.
 */
export const validateFsrsParams = (params) => {
  if (!Array.isArray(params)) {
    throw new FsrsParamValidationError('FSRS params must be an array', { index: -1, value: params, reason: 'not-an-array' })
  }
  if (params.length < 17 || params.length > 19) {
    throw new FsrsParamValidationError(
      `FSRS params length ${params.length} outside accepted range [17, 19]`,
      { index: -1, value: params.length, reason: 'bad-length' },
    )
  }
  for (let i = 0; i < params.length; i++) {
    const v = params[i]
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new FsrsParamValidationError(
        `FSRS w[${i}] is not a finite number: ${v}`,
        { index: i, value: v, reason: 'not-finite' },
      )
    }
    const [min, max] = FSRS_PARAM_RANGES[i]
    if (v < min || v > max) {
      throw new FsrsParamValidationError(
        `FSRS w[${i}] = ${v} outside published range [${min}, ${max}]`,
        { index: i, value: v, reason: 'out-of-range' },
      )
    }
  }
  return true
}

let fsrsParamWarningShown = false

/**
 * scheduleFSRS: wraps ts-fsrs to produce { stability, difficulty, interval }.
 * Accepts an optional `now` Date for deterministic testing.
 * Uses per-user params (array) when provided AND valid; else falls back to ts-fsrs defaults.
 *
 * FSRS algorithm per Supermemo (Wozniak) and the open-spaced-repetition project.
 */
export const scheduleFSRS = (card, rating, retentionTarget = 0.9, schedulerParams = null, now = new Date()) => {
  let safeParams = null
  if (schedulerParams) {
    try {
      validateFsrsParams(schedulerParams)
      safeParams = schedulerParams
    } catch (err) {
      if (!fsrsParamWarningShown) {
        // Once per session: surface invalid persisted params then fall back to library defaults.
        console.warn('[Nidus Recall] Invalid FSRS params, falling back to defaults:', err.message)
        fsrsParamWarningShown = true
      }
    }
  }
  const params = generatorParameters({
    request_retention: retentionTarget,
    ...(safeParams ? { w: safeParams } : {}),
  })
  const f = fsrs(params)

  const tsCard = {
    due:            card.nextReview ? new Date(card.nextReview) : now,
    stability:      card.stability  ?? 0,
    difficulty:     card.difficulty ?? 0,
    elapsed_days:   card.lastReview
      ? Math.max(0, Math.floor((now - new Date(card.lastReview)) / 86400000))
      : 0,
    scheduled_days: card.interval   ?? 0,
    reps:           card.reviewCount ?? 0,
    lapses:         card.lapses      ?? 0,
    // Derive FSRS state from stored fields: New (0), Review (2), or Relearning (3).
    // Learning (1) is not tracked separately; early-reviewed cards are treated as Review.
    // Relearning: card has lapsed at least once AND is on a short relearning step (interval <=1).
    state: card.reviewCount === 0
      ? 0
      : card.lapses > 0 && (card.interval ?? 1) <= 1 ? 3 : 2,
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

export const isActive = c => c.status !== 'Parked' && c.status !== 'Archived'

const todayStr = () => localDateStr(new Date(), settingsGet().timezone)

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
  if (all.length <= cap) return all
  return all.slice(0, Math.min(cap, Math.ceil(all.length / days)))
}

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
