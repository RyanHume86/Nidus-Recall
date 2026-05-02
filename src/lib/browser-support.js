// Browser support detection.
// Returns true when the user agent appears to be below the minimum supported version.

const UA_RULES = [
  // Chrome / Chromium-based (also catches Edge since it includes "Chrome")
  { pattern: /Chrome\/(\d+)/, min: 110 },
  // Edge (new Chromium Edge — ua includes Chrome too, so this is belt-and-suspenders)
  { pattern: /Edg\/(\d+)/, min: 110 },
  // Firefox
  { pattern: /Firefox\/(\d+)/, min: 110 },
  // Samsung Internet
  { pattern: /SamsungBrowser\/(\d+)/, min: 21 },
  // Safari — only match pure Safari (not Chrome, not Samsung)
  // Safari UA includes "Version/X.Y Safari" but NOT "Chrome" or "SamsungBrowser"
  { pattern: /Version\/(\d+)\.[\d.]+\s+(?:Mobile\/\w+\s+)?Safari/, min: 16, exclude: /Chrome|SamsungBrowser/ },
]

// Detect Internet Explorer (never supported)
const IE_PATTERN = /\bTrident\/|MSIE\s/

export function isUnsupportedBrowser(ua = navigator.userAgent) {
  if (IE_PATTERN.test(ua)) return true

  for (const rule of UA_RULES) {
    if (rule.exclude && rule.exclude.test(ua)) continue
    const match = ua.match(rule.pattern)
    if (match) {
      const version = parseInt(match[1], 10)
      return version < rule.min
    }
  }

  return false
}
