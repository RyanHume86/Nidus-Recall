export const localDateStr = (d = new Date()) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const addDays = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return localDateStr(d)
}

export const todayStr = () => localDateStr()

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
