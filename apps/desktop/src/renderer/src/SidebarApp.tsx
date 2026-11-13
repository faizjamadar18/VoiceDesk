import type { JSX } from 'react'
import { VoiceOsSidebar } from './sidebar/VoiceOsSidebar'

export default function SidebarApp(): JSX.Element {
  return (
    <div className="h-screen w-full select-none">
      <VoiceOsSidebar />
    </div>
  )
}
