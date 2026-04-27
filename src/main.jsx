import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import '@/styles/app.css'

// Suppress unhandled ServiceWorker SecurityErrors in preview/dev environments
// to prevent the base44 error handler from crashing on an undefined error object.
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  // Suppress bare undefined/null rejections that crash the base44 error handler
  if (reason === undefined || reason === null) {
    event.preventDefault()
    return
  }
  // Suppress SW SecurityErrors (DOMException or any error) in preview/dev environments
  if (reason?.name === 'SecurityError' || reason instanceof DOMException) {
    event.preventDefault()
    return
  }
  // Suppress anything without a .message string (base44 handler calls .match on it)
  if (typeof reason?.message !== 'string') {
    event.preventDefault()
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW unavailable in preview/dev environments — safe to ignore
    })
  })
}