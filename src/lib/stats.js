// Compute recall accuracy (calibration) score for a set of cards.
// Looks at pairs: good/easy entry followed by an "again" on the next review = mismatch.
// Returns { score: number 0-100, total: number } - score is null when total < 10.
export const computeCalibration = (cards, days = 30) => {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString()
  let mismatches = 0, total = 0
  for (const card of cards) {
    const hist = card.ratingHistory
    if (!hist || hist.length < 2) continue
    for (let i = 0; i < hist.length - 1; i++) {
      const entry = hist[i]
      if (entry.date < cutoff) continue
      if (entry.rating === "good" || entry.rating === "easy") {
        total++
        if (hist[i + 1].rating === "again") mismatches++
      }
    }
  }
  return { score: total >= 10 ? Math.round((1 - mismatches / total) * 100) : null, total }
}

// Build 90-day weekly calibration chart data from ratingHistory across cards.
// Returns array of { week: "Apr 14", score: number } sorted oldest-first.
// Weeks with fewer than 4 reviewable pairs are excluded.
export const buildCalibrationChart = (cards) => {
  const now = Date.now()
  const weeks = []
  for (let w = 12; w >= 0; w--) {
    const start = new Date(now - (w + 1) * 7 * 86400000).toISOString()
    const end   = new Date(now - w * 7 * 86400000).toISOString()
    let mismatches = 0, total = 0
    for (const card of cards) {
      const hist = card.ratingHistory
      if (!hist || hist.length < 2) continue
      for (let i = 0; i < hist.length - 1; i++) {
        const entry = hist[i]
        if (entry.date < start || entry.date >= end) continue
        if (entry.rating === "good" || entry.rating === "easy") {
          total++
          if (hist[i + 1].rating === "again") mismatches++
        }
      }
    }
    if (total >= 4) {
      const d = new Date(now - w * 7 * 86400000)
      weeks.push({ week: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), score: Math.round((1 - mismatches / total) * 100) })
    }
  }
  return weeks
}

// Fatigue risk score based on session log from the last 14 days.
// Returns 0 when fewer than 5 sessions exist. Otherwise sums up to 3 flags.
export const computeFatigueScore = (log) => {
  const now = Date.now()
  const cut14 = new Date(now - 14 * 86400000).toISOString()
  const cut7  = new Date(now -  7 * 86400000).toISOString()
  const recent = log.filter(e => e.date >= cut14)
  if (recent.length < 5) return 0
  const last7  = recent.filter(e => e.date >= cut7)
  const prior7 = recent.filter(e => e.date <  cut7)
  let flags = 0
  // Signal 1: session frequency decline > 30%
  if (prior7.length > 0 && last7.length / prior7.length < 0.7) flags++
  // Signal 2: again rate increase > 20pp
  const againRate = arr => {
    const total = arr.reduce((s,e) => s+(e.reviewed||0)+(e.newAdded||0), 0)
    if (!total) return null
    return arr.reduce((s,e) => s+(e.failed||0), 0) / total
  }
  const r7 = againRate(last7), rP = againRate(prior7)
  if (r7 !== null && rP !== null && r7 - rP > 0.20) flags++
  // Signal 3: average session size decline > 25%
  const avgSize = arr => arr.length === 0 ? null : arr.reduce((s,e) => s+(e.reviewed||0)+(e.newAdded||0), 0) / arr.length
  const s7 = avgSize(last7), sP = avgSize(prior7)
  if (s7 !== null && sP !== null && sP > 0 && s7 / sP < 0.75) flags++
  return flags
}

// Returns the user-authored portion of the session note.
// System flags (intensity, fatigue, focused) are now stored in dedicated
// SessionLog fields (fatigueFlag, focusedFlag, intensity_score) and are no
// longer embedded as text markers in frictionNote.
export const assembleFrictionNote = (userText) => userText.trim()

// Compute current review streak (consecutive days with >=1 review, back from today).
export const computeStreak = (log) => {
  const days = new Set(log.map(e => e.date?.split('T')[0]).filter(Boolean))
  let streak = 0
  const today = new Date()
  for (let i = 0; i < 365; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    if (days.has(key)) streak++
    else if (i > 0) break  // gap found; stop (allow missing today if yesterday reviewed)
    else continue           // today not yet reviewed; keep going to check yesterday
  }
  return streak
}

// Compute 7-day retention % = (good+easy) / total from ratingBreakdown fields.
export const computeSevenDayRetention = (log) => {
  const cut7 = new Date(Date.now() - 7 * 86400000).toISOString()
  const last7 = log.filter(e => e.date >= cut7)
  const rb = last7.reduce((acc, e) => {
    const r = e.ratingBreakdown || {}
    acc.again += r.again || 0; acc.hard += r.hard || 0
    acc.good  += r.good  || 0; acc.easy += r.easy || 0
    return acc
  }, { again: 0, hard: 0, good: 0, easy: 0 })
  const total = rb.again + rb.hard + rb.good + rb.easy
  return total > 0 ? Math.round((rb.good + rb.easy) / total * 100) : null
}

// Build 30-day forecast: how many active cards fall due on each of the next 30 days.
// Day 0 = today; includes overdue cards in today's bar.
export const buildForecast = (cards, activeFilter) => {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const activeCards = cards.filter(activeFilter)
  const result = []
  for (let i = 0; i < 30; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    const key = d.toISOString().split('T')[0]
    const due = i === 0
      ? activeCards.filter(c => c.nextReview && c.nextReview <= todayStr).length
      : activeCards.filter(c => c.nextReview?.startsWith(key)).length
    result.push({ date: d.toLocaleDateString("en-GB", { day:"numeric", month:"short" }), due, key })
  }
  return result
}

// Maturity distribution: bucket active cards by stability tier.
export const buildMaturityBuckets = (cards, activeFilter) => {
  return cards.filter(activeFilter).reduce((acc, c) => {
    if (!c.reviewCount || c.reviewCount === 0) acc.new++
    else if (c.stability == null || c.stability < 7) acc.learning++
    else if (c.stability < 30) acc.young++
    else acc.mature++
    return acc
  }, { new: 0, learning: 0, young: 0, mature: 0 })
}

// Content-type breakdown from last N days of sessions.
export const buildContentTypeBreakdown = (log, days = 30) => {
  const cut = new Date(Date.now() - days * 86400000).toISOString()
  return log.filter(e => e.date >= cut).reduce((acc, e) => {
    for (const [k, v] of Object.entries(e.contentTypeBreakdown || {})) {
      if (v > 0) acc[k] = (acc[k] || 0) + v
    }
    return acc
  }, {})
}

// Always-covered: % of stakes_flag=true active cards reviewed in the past 7 days.
export const computeAlwaysCovered = (cards, activeFilter) => {
  const stakeCards = cards.filter(c => activeFilter(c) && c.stakes_flag)
  if (stakeCards.length === 0) return null
  const cut7 = new Date(Date.now() - 7 * 86400000).toISOString()
  const covered = stakeCards.filter(c => c.lastReview && c.lastReview >= cut7).length
  return { covered, total: stakeCards.length, pct: Math.round(covered / stakeCards.length * 100) }
}
