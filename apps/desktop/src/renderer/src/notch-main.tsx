import { createRoot } from 'react-dom/client'
import Notch from './Notch'
import './notch.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Notch root element was not found.')
}

createRoot(root).render(<Notch />)
