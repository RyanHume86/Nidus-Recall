// pwa.js: PWA install prompt helper for Nidus Recall.
//
// Captures the browser's beforeinstallprompt event and exposes it for use
// by the app shell. The prompt is shown at a contextually appropriate moment
// (after a completed review session) rather than immediately on load.
//
// workbox-window: Apache-2.0, GoogleChrome/workbox, service worker lifecycle management.

// deferredInstallPrompt: set by the beforeinstallprompt listener below.
// Exported so Home.jsx can read it when the user is eligible for the install prompt.
export let deferredInstallPrompt = null

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile automatically.
    e.preventDefault()
    deferredInstallPrompt = e
  })

  // Clear the reference once the app is installed.
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null
  })
}

/**
 * triggerInstallPrompt: shows the browser install prompt if one is available.
 * Returns true if the prompt was shown, false otherwise.
 */
export const triggerInstallPrompt = async () => {
  if (!deferredInstallPrompt) return false
  deferredInstallPrompt.prompt()
  const { outcome } = await deferredInstallPrompt.userChoice
  if (outcome === 'accepted') {
    deferredInstallPrompt = null
  }
  return true
}

/**
 * isInstallable: returns true if an install prompt is currently available.
 */
export const isInstallable = () => deferredInstallPrompt !== null
