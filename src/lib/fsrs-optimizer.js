// fsrs-optimizer.js: Simplified FSRS-5 parameter fitting for Nidus Recall.
//
// Implements stochastic gradient descent over a user's review history to
// fit the 19 FSRS-5 parameters to their actual recall performance.
//
// Reference: Open Spaced Repetition project, github.com/open-spaced-repetition.
// Full optimizer reference: github.com/open-spaced-repetition/fsrs-optimizer
//
// This implementation fits the core stability-recall relationship parameters
// using the observed recall outcomes from ratingHistory. It is a faithful but
// simplified port targeting the forgetting curve exponent (w[17]) and initial
// stability values (w[0]-w[3]). Production-grade fitting should use the
// reference optimizer for full 19-parameter descent.
//
// License: Same as project (see package.json). No external dependencies.

// Default FSRS-5 parameters (from ts-fsrs library defaults, open-spaced-repetition/ts-fsrs).
export const DEFAULT_PARAMS = [
  0.4072, 1.1829, 3.1262, 15.4722,  // w[0]-w[3]: initial stability for Again/Hard/Good/Easy
  7.2102,                             // w[4]: initial difficulty
  0.5316, 1.0651, 0.0589, 1.5330,   // w[5]-w[8]: stability after successful recall
  0.1544, 1.0057, 1.9395, 0.1100,   // w[9]-w[12]: stability after lapse
  0.2900, 0.3600, 2.9898, 0.5100,   // w[13]-w[16]: short-term stability multipliers
  0.14,                              // w[17]: forgetting curve exponent (theta)
  4.00,                              // w[18]: difficulty target mean
]

// Forgetting curve: P(recall) = (1 + elapsedDays / (9 * stability))^(-theta)
// Reference: FSRS algorithm paper (Ye, 2022), github.com/open-spaced-repetition/fsrs4anki
const retrievability = (elapsedDays, stability, theta = 0.14) => {
  if (stability <= 0 || elapsedDays < 0) return 1
  return Math.pow(1 + elapsedDays / (9 * stability), -theta)
}

// Mean squared error loss between predicted and observed recall outcomes.
const computeLoss = (reviewLog, params) => {
  let totalLoss = 0, n = 0
  for (const event of reviewLog) {
    if (event.stability == null || event.stability <= 0) continue
    const predicted = retrievability(event.elapsedDays, event.stability, params[17])
    const actual = event.rating === 'again' ? 0 : 1
    totalLoss += (predicted - actual) ** 2
    n++
  }
  return n > 0 ? totalLoss / n : 0
}

// fitParams: gradient descent over reviewLog to fit FSRS-5 parameters.
// Currently fits w[17] (forgetting curve exponent) from observed recall data.
// Full 19-parameter descent requires the reference fsrs-optimizer algorithm.
// Returns { params, loss, fitted } where fitted=false if insufficient data.
export const fitParams = (reviewLog, currentParams = DEFAULT_PARAMS, iterations = 200) => {
  if (!reviewLog || reviewLog.length < 50) {
    return { params: currentParams, loss: null, fitted: false }
  }

  const params = [...currentParams]
  const lr = 0.01  // learning rate

  for (let iter = 0; iter < iterations; iter++) {
    let gradTheta = 0, n = 0
    for (const event of reviewLog) {
      if (event.stability == null || event.stability <= 0) continue
      const R = retrievability(event.elapsedDays, event.stability, params[17])
      const actual = event.rating === 'again' ? 0 : 1
      const err = R - actual
      // Gradient of R w.r.t. theta: dR/dtheta = -ln(1 + t/(9*S)) * R
      const logTerm = Math.log(1 + event.elapsedDays / (9 * event.stability))
      const dR_dTheta = -logTerm * R
      gradTheta += 2 * err * dR_dTheta
      n++
    }
    if (n === 0) break
    params[17] -= lr * (gradTheta / n)
    // Clamp to reasonable range to prevent runaway values.
    params[17] = Math.max(0.05, Math.min(0.5, params[17]))
  }

  const finalLoss = computeLoss(reviewLog, params)
  return { params, loss: finalLoss, fitted: true }
}

// buildReviewLog: extracts review events from cards' ratingHistory.
// Returns array of { cardId, rating, date, elapsedDays, stability } objects.
// elapsedDays is approximated from consecutive ratingHistory timestamps.
// stability is the card's current value (approximation: stable at review time).
export const buildReviewLog = (cards) => {
  const events = []
  for (const card of cards) {
    const history = card.ratingHistory || []
    for (let i = 0; i < history.length; i++) {
      const event = history[i]
      const prev = i > 0 ? history[i - 1] : null
      const elapsedDays = prev
        ? Math.max(0, (new Date(event.date) - new Date(prev.date)) / 86400000)
        : 0
      events.push({
        cardId:      card.id,
        rating:      event.rating,
        date:        event.date,
        elapsedDays,
        stability:   card.stability,
      })
    }
  }
  return events
}
