import { C } from "@/lib/theme"
import { buildHeatmapData } from "@/lib/heatmap"

export function ReviewHeatmap({ log }) {
  const data = buildHeatmapData(log)
  const today = new Date()
  const days = []
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    days.push({ key, count: data[key] || 0 })
  }
  let streak = 0, longestStreak = 0, cur = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count > 0) {
      cur++
      longestStreak = Math.max(longestStreak, cur)
      if (i === days.length - 1 || days[i + 1].count > 0) streak = cur
    } else {
      if (i < days.length - 1) cur = 0
    }
  }
  const maxCount = Math.max(1, ...days.map(d => d.count))
  const intensity = (count) => {
    if (count === 0) return 0
    const ratio = count / maxCount
    if (ratio < 0.25) return 1
    if (ratio < 0.5)  return 2
    if (ratio < 0.75) return 3
    return 4
  }
  const COLOURS = ['#e8f0eb', '#b3d4bc', '#6dab7e', '#2D6E52', '#1a4535']
  const weeks = []
  for (let w = 0; w < 53; w++) weeks.push(days.slice(w * 7, w * 7 + 7))
  return (
    <div style={{ marginBottom:24 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:12, color:C.textMut }}>
        <span>Current streak: <strong>{streak}</strong> day{streak !== 1 ? 's' : ''}</span>
        <span>Longest streak: <strong>{longestStreak}</strong> day{longestStreak !== 1 ? 's' : ''}</span>
      </div>
      <div style={{ display:'flex', gap:2, overflowX:'auto' }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display:'flex', flexDirection:'column', gap:2 }}>
            {week.map((day) => (
              <div key={day.key}
                title={`${day.key}: ${day.count} review${day.count !== 1 ? 's' : ''}`}
                style={{ width:11, height:11, borderRadius:2, background:COLOURS[intensity(day.count)] }}
              />
            ))}
          </div>
        ))}
      </div>
      <div style={{ fontSize:10, color:C.textMut, marginTop:4, textAlign:'right' }}>
        Less
        {COLOURS.map((c, i) => (
          <span key={i} style={{ display:'inline-block', width:10, height:10, background:c, borderRadius:2, margin:'0 1px', verticalAlign:'middle' }} />
        ))}
        More
      </div>
    </div>
  )
}
