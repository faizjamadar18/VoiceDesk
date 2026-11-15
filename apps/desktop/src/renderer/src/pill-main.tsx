import { createRoot } from 'react-dom/client'
import DictationPill from './dictation-pill/DictationPill'
import './pill.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Pill root element was not found.')
}

createRoot(root).render(<DictationPill />)
