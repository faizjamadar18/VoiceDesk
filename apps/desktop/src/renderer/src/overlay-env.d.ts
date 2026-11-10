import type { KestrelOverlayApi } from '../../shared/types'

declare global {
  interface Window {
    kestrelOverlay: KestrelOverlayApi
  }
}

export {}
