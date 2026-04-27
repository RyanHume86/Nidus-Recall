import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import '@/styles/app.css'

// Suppress unhandled ServiceWorker SecurityErrors in preview/dev environments
// to prevent the base44 error handler from crashing on an undefined error object.
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason instanceof Error && event.reason.name === 'SecurityError' &&
      event.reason.message?.includes('ServiceWorker')) {
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