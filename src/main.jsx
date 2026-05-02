// Must be first — suppress unhandled rejections that crash the base44 error handler
// before any other listener (including the vite-plugin injected handler) can process them.
;(function () {
  function shouldSuppress(reason) {
    if (reason === undefined || reason === null) return true
    if (reason instanceof DOMException) return true
    if (reason?.name === 'SecurityError') return true
    if (typeof reason?.message !== 'string') return true
    return false
  }
  window.addEventListener('unhandledrejection', function (event) {
    if (shouldSuppress(event.reason)) event.preventDefault()
  }, true) // capture phase — fires before bubble-phase listeners
})()

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import '@/styles/app.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/sw.js')
    } catch (_) {
      // SW unavailable in preview/dev environments — safe to ignore
    }
  })
}