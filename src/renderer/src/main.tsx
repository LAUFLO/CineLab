import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/tailwind.css'
import './styles/base.css'
import './styles/global.css'
import './styles/studio.css'

window.addEventListener('error', (event) => {
  const message = `${event.message} @ ${event.filename ?? ''}:${event.lineno ?? 0}`
  void window.api.app.log('error', message).catch(() => undefined)
})

window.addEventListener('unhandledrejection', (event) => {
  void window.api.app
    .log('error', `unhandledrejection: ${String(event.reason)}`)
    .catch(() => undefined)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
