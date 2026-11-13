import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@horun/design-system/src/tokens.css'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
