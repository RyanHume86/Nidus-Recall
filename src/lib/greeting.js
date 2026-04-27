export function getTimeOfDay(now = new Date()) {
  const h = now.getHours()
  if (h >= 5 && h < 12) return "morning"
  if (h >= 12 && h < 17) return "afternoon"
  if (h >= 17 && h < 21) return "evening"
  return "night"
}

export function getGreeting(firstName, now = new Date()) {
  const name = (firstName || "").trim()
  const suffix = name ? `, ${name}` : ""
  const tod = getTimeOfDay(now)
  if (tod === "night") return `Hello${suffix}`
  return `Good ${tod}${suffix}`
}
