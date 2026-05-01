/**
 * localDateStr: returns an ISO date string (YYYY-MM-DD) for the given Date.
 * When tz is provided (an IANA timezone identifier such as 'Africa/Johannesburg'),
 * the date is computed in that timezone so the day boundary matches the user's
 * location. Without tz, falls back to local system time.
 */
export const localDateStr = (d = new Date(), tz) => {
  if (tz) return d.toLocaleDateString('en-CA', { timeZone: tz })
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * todayStr: returns today as YYYY-MM-DD in the given timezone (or local time if omitted).
 */
export const todayStr = (tz) => localDateStr(new Date(), tz)

/**
 * addDays: returns the ISO date string n days from today in the given timezone.
 */
export const addDays = (n, tz) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return localDateStr(d, tz)
}

export const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2)

export const timeAgo = (iso) => {
  if (!iso) return null
  const m = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
