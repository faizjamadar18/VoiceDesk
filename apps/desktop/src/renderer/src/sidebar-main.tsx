import { createRoot } from 'react-dom/client'
import SidebarApp from './SidebarApp'
import './sidebar/sidebar.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Sidebar root element was not found.')
}

createRoot(root).render(<SidebarApp />)
