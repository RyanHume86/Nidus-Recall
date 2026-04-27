import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import '@/styles/app.css'

// Suppress unhandled ServiceWorker SecurityErrors in preview/dev environments
// to prevent the base44 error handler from crashing on an undefined error object.
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  // Suppress SW SecurityErrors (DOMException or Error) in preview/dev environments
  if (reason?.name === 'SecurityError' && reason?.message?.includes('ServiceWorker')) {
    event.preventDefault()
    return
  }
  // Suppress bare undefined/null rejections that crash the base44 error handler
  if (reason === undefined || reason === null) {
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