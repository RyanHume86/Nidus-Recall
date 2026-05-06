import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import '@/styles/app.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

if ('caches' in window) {
  caches.delete('base44-api-cache').catch(() => {})
}