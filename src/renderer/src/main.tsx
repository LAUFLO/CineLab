import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { TrayMenuWindow } from './tray/TrayMenuWindow'
import './styles/tailwind.css'
import './styles/infrastructure.css'

if (navigator.userAgent.includes('Mac')) {
  document.documentElement.dataset.platform = 'darwin'
}

window.addEventListener('error', (event) => {
  const message = `${event.message} @ ${event.filename ?? ''}:${event.lineno ?? 0}`
  void window.api.app.log('error', message).catch(() => undefined)
})

window.addEventListener('unhandledrejection', (event) => {
  void window.api.app
    .log('error', `unhandledrejection: ${String(event.reason)}`)
    .catch(() => undefined)
})

const isTrayMenu = window.location.hash === '#tray-menu'
if (isTrayMenu) {
  document.documentElement.dataset.theme = 'light'
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isTrayMenu ? <TrayMenuWindow /> : <App />}
  </React.StrictMode>
)
