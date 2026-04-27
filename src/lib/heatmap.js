// buildHeatmapData: map of ISO date string -> review count from session log.
// Ref: streak visibility supports habit maintenance (Lally et al., Eur J Soc Psychol 2010).
export const buildHeatmapData = (log) => {
  const map = {}
  for (const entry of log) {
    const d = entry.date ? entry.date.split('T')[0] : null
    if (d) map[d] = (map[d] || 0) + (entry.reviewed || 0)
  }
  return map
}
