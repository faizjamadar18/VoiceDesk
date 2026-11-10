import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlayIcon
} from './dashboard-icons'
import { TutorialVideoModal } from './TutorialVideoModal'

export interface TutorialItem {
  id: string
  title: string
  description: string
  duration: string
  videoUrl: string
  posterUrl: string
  startHere?: boolean
}

export const TUTORIALS: TutorialItem[] = [
  {
    id: 'overview',
    title: 'VoiceOS Overview',
    description: 'Get started with voice-first computing.',
    duration: '2:28',
    videoUrl: 'https://website-assets-video.s3.us-east-1.amazonaws.com/tutorials/v1/voiceos-overview.mp4',
    posterUrl: 'https://website-assets-video.s3.us-east-1.amazonaws.com/tutorials/v1/voiceos-overview-poster.jpg',
    startHere: true
  },
  {
    id: 'dictation',
    title: 'Dictation Mode',
    description: 'Learn hands-free dictation, styles, and editing.',
    duration: '2:20',
    videoUrl: 'https://website-assets-video.s3.us-east-1.amazonaws.com/tutorials/v1/voiceos-dictation.mp4',
    posterUrl: 'https://website-assets-video.s3.us-east-1.amazonaws.com/tutorials/v1/voiceos-dictation-poster.jpg'
  },
  {
    id: 'agent',
    title: 'Agent Mode',
    description: 'Ask AI to take actions across apps and your screen.',
    duration: '1:41',
    videoUrl: 'https://website-assets-video.s3.us-east-1.amazonaws.com/tutorials/v1/voiceos-agent-mode.mp4',
    posterUrl: 'https://website-assets-video.s3.us-east-1.amazonaws.com/tutorials/v1/voiceos-agent-mode-poster-v4.jpg'
  }
]

export function TutorialsSection(): JSX.Element {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)
  const [activeTutorial, setActiveTutorial] = useState<TutorialItem | null>(null)
  const [watched, setWatched] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('voiceos.watchedTutorials')
      return stored ? JSON.parse(stored) : {}
    } catch {
      return {}
    }
  })

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft < maxScroll - 4)
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    updateScrollState()
    el.addEventListener('scroll', updateScrollState, { passive: true })
    const observer = new ResizeObserver(updateScrollState)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', updateScrollState)
      observer.disconnect()
    }
  }, [updateScrollState])

  const scrollByCard = (direction: number): void => {
    scrollerRef.current?.scrollBy({
      left: direction * 356,
      behavior: 'smooth'
    })
  }

  const handleOpenTutorial = (tutorial: TutorialItem): void => {
    setActiveTutorial(tutorial)
    setWatched((prev) => {
      if (prev[tutorial.id]) return prev
      const next = { ...prev, [tutorial.id]: true }
      try {
        localStorage.setItem('voiceos.watchedTutorials', JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  return (
    <section className="tutorials-section" aria-labelledby="tutorials-heading">
      <div className="tutorials-header">
        <h3 id="tutorials-heading" className="tutorials-heading">
          Tutorials
        </h3>
        <div className="tutorial-paddles">
          <button
            type="button"
            className="tutorial-paddle-btn"
            disabled={!canScrollLeft}
            onClick={() => scrollByCard(-1)}
            aria-label="Scroll backward"
          >
            <ChevronLeftIcon width={16} height={16} />
          </button>
          <button
            type="button"
            className="tutorial-paddle-btn"
            disabled={!canScrollRight}
            onClick={() => scrollByCard(1)}
            aria-label="Scroll forward"
          >
            <ChevronRightIcon width={16} height={16} />
          </button>
        </div>
      </div>

      <div ref={scrollerRef} className="tutorial-rail">
        {TUTORIALS.map((tutorial) => {
          const isWatched = Boolean(watched[tutorial.id])

          return (
            <div
              key={tutorial.id}
              className="tutorial-card-wrapper"
              onClick={() => handleOpenTutorial(tutorial)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleOpenTutorial(tutorial)
                }
              }}
            >
              <div className="tutorial-card">
                <img
                  src={tutorial.posterUrl}
                  alt={tutorial.title}
                  draggable={false}
                  className="tutorial-poster"
                />

                <div className="tutorial-overlay" />

                <div className="tutorial-content-top">
                  {tutorial.startHere && (
                    <div className="tutorial-start-wrapper">
                      <span className="tutorial-start-tag">Start here</span>
                    </div>
                  )}
                  <h4 className="tutorial-title">{tutorial.title}</h4>
                  <p className="tutorial-desc">{tutorial.description}</p>
                </div>

                <span className="tutorial-duration-badge">{tutorial.duration}</span>

                {isWatched && (
                  <span className="tutorial-watched-badge">
                    <CheckIcon width={12} height={12} />
                    <span>Watched</span>
                  </span>
                )}

                <div className="tutorial-play-overlay">
                  <span className="tutorial-play-circle">
                    <PlayIcon width={18} height={18} className="tutorial-play-icon" />
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <TutorialVideoModal
        isOpen={activeTutorial !== null}
        onClose={() => setActiveTutorial(null)}
        videoUrl={activeTutorial?.videoUrl ?? ''}
        title={activeTutorial?.title ?? 'Tutorial'}
      />
    </section>
  )
}

