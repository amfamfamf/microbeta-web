import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// `?demo=1` → the demo route (works without a backend).
const url = new URL(window.location.href)
if (url.searchParams.get('demo') === '1') {
  url.searchParams.delete('demo')
  window.history.replaceState(null, '', url.pathname + url.search + '#/demo')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
