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

// Assembles the final frictionNote for a session. User-written text is
// preserved at the front; system markers are appended, never prepended or
// overwritten. This is the single authoritative write point - intensity,
// fatigue, and attention declaration must feed here rather than writing
// frictionNote independently.
export const assembleFrictionNote = (userText, { intensityPts, intensityCount, fatigueScore, fatigueAlertsEnabled, focused }) => {
  const markers = []
  if (intensityCount > 0) markers.push(`[Intensity: ${(intensityPts / intensityCount).toFixed(1)}]`)
  if (fatigueAlertsEnabled && fatigueScore >= 2) markers.push("[Fatigue risk: elevated]")
  if (focused) markers.push("[Focused: yes]")
  return [userText.trim(), ...markers].filter(Boolean).join(" ")
}
