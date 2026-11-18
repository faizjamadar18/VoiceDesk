import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  type JSX,
  type ChangeEvent,
  type KeyboardEvent
} from 'react'
import type {
  NotchSlackCard,
  NotchSlackRecentMessage,
  NotchSlackTargetItem
} from '../../../shared/types'
import slackIcon from '../features/apps/assets/slack-Bj1CmN7u.webp'

export interface SlackConfirmationCardProps {
  card: NotchSlackCard
  busy?: boolean
  onConfirm?: (data: { message: string; channelId?: string; target?: string }) => void
  onDiscard?: () => void
}

export const SLACK_DARK = {
  bg: '#1A1D21',
  bgSecondary: '#222529',
  bgHover: '#2C2D30',
  text: '#D1D2D3',
  textBright: '#E8E8E8',
  textMuted: '#ABABAD',
  textDim: '#818385',
  border: 'rgba(209,210,211,0.13)',
  borderFocus: '#1264A3',
  green: '#007a5a',
  greenHover: '#148567'
} as const

const avatarColors = [
  '#E01E5A',
  '#36C5F0',
  '#2EB67D',
  '#ECB22E',
  '#1264A3',
  '#9B59B6'
]

const slackFont =
  'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'

function CloseCrossIcon({ size = 10 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1 1l8 8M9 1L1 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CardCloseButton({ onClick }: { onClick?: () => void }): JSX.Element {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label="Cancel"
      style={{
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 10,
        width: 24,
        height: 24,
        padding: 0,
        borderRadius: '50%',
        border: 'none',
        outline: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: hovered ? 'rgba(120, 120, 128, 0.5)' : 'rgba(120, 120, 128, 0.32)',
        color: 'rgba(255,255,255,0.9)',
        cursor: 'pointer',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        transition: 'background 0.15s ease'
      }}
    >
      <CloseCrossIcon size={10} />
    </button>
  )
}

function SlackAvatarImg({
  src,
  name,
  color
}: {
  src?: string
  name: string
  color: string
}): JSX.Element {
  const [failed, setFailed] = useState(false)
  const showImg = Boolean(src && !failed)

  if (showImg) {
    return (
      <img
        src={src}
        alt={name}
        width={28}
        height={28}
        onError={() => setFailed(true)}
        style={{
          width: 28,
          height: 28,
          minWidth: 28,
          minHeight: 28,
          borderRadius: '6px',
          flexShrink: 0,
          marginTop: '2px',
          objectFit: 'cover'
        }}
      />
    )
  }

  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: '6px',
        background: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: '13px',
        fontWeight: 700,
        color: '#fff',
        marginTop: '2px'
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function parseSlackMrkdwn(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = []
  let lastIndex = 0
  const regex = /<([^>|]+?)(?:\|([^>]*?))?>/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const target = match[1]
    const label = match[2] || target
    const isLink = target.startsWith('http://') || target.startsWith('https://')
    if (isLink) {
      parts.push(
        <a
          key={match.index}
          href={target}
          target="_blank"
          rel="noopener noreferrer"
          onMouseDown={(e) => e.stopPropagation()}
          style={{ color: '#1D9BD1', textDecoration: 'none' }}
        >
          {label}
        </a>
      )
    } else {
      parts.push(label)
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts
}

function formatSlackTimestamp(rawTs?: string): string {
  if (!rawTs) return ''
  const num = parseFloat(rawTs)
  if (!Number.isFinite(num)) return rawTs
  const ms = num < 1e11 ? num * 1000 : num
  const date = new Date(ms)
  if (isNaN(date.getTime())) return rawTs
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/**
 * VoiceOS-styled Slack message confirmation card.
 */
export function SlackConfirmationCard({
  card,
  busy = false,
  onConfirm,
  onDiscard
}: SlackConfirmationCardProps): JSX.Element {
  const [message, setMessage] = useState<string>(() => card.message || '')
  const [sendHovered, setSendHovered] = useState(false)

  const [targets, setTargets] = useState<NotchSlackTargetItem[]>(() => {
    if (card.target) {
      return [
        {
          id: card.channelId || card.target,
          name: card.target.replace(/^[#@]/, ''),
          type: card.isDm ? 'dm' : 'channel',
          avatar: card.avatar
        }
      ]
    }
    return []
  })

  const [selectedTarget, setSelectedTarget] = useState<NotchSlackTargetItem | null>(() => {
    if (card.target) {
      return {
        id: card.channelId || card.target,
        name: card.target.replace(/^[#@]/, ''),
        type: card.isDm ? 'dm' : 'channel',
        avatar: card.avatar
      }
    }
    return null
  })

  const [channelDropdownOpen, setChannelDropdownOpen] = useState(false)
  const [channelSearch, setChannelSearch] = useState('')

  const [recentMessages, setRecentMessages] = useState<NotchSlackRecentMessage[]>(
    () => card.recentMessages || []
  )
  const [slackUserMap, setSlackUserMap] = useState<
    Record<string, { name: string; avatar?: string }>
  >({})
  const [messagesLoading, setMessagesLoading] = useState<boolean>(() => {
    if (card.recentMessages && card.recentMessages.length > 0) return false
    return Boolean(card.channelId || card.target)
  })

  // Fetch targets via window.kestrel.slackListChannels
  useEffect(() => {
    if (typeof window === 'undefined' || !window.kestrel?.slackListChannels) {
      return
    }
    let cancelled = false
    window.kestrel
      .slackListChannels()
      .then((res) => {
        if (cancelled) return
        if (res?.success && Array.isArray(res.targets) && res.targets.length > 0) {
          setTargets(res.targets)
          // If selected target has no channelId, match by name or id
          setSelectedTarget((current) => {
            if (!current) return res.targets[0] || null
            const match = res.targets.find(
              (t) => t.id === current.id || t.name === current.name
            )
            return match || current
          })
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  // Fetch recent messages when target changes
  const activeChannelId = selectedTarget?.id || card.channelId || card.target
  useEffect(() => {
    if (card.recentMessages && !selectedTarget) {
      setRecentMessages(card.recentMessages)
      setMessagesLoading(false)
      return
    }

    if (typeof window === 'undefined' || !window.kestrel?.slackFetchMessages) {
      setMessagesLoading(false)
      return
    }

    if (!activeChannelId) {
      setMessagesLoading(false)
      return
    }

    let cancelled = false
    setMessagesLoading(true)
    window.kestrel
      .slackFetchMessages(activeChannelId, card.threadTs || undefined)
      .then((res) => {
        if (cancelled) return
        if (res?.success && Array.isArray(res.messages)) {
          setRecentMessages(res.messages)
          if (res.users && typeof res.users === 'object') {
            setSlackUserMap(res.users)
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setMessagesLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeChannelId, card.recentMessages, card.threadTs, selectedTarget])

  const targetUserMap = useMemo(() => {
    const map: Record<string, { name: string; avatar?: string }> = {
      ...slackUserMap
    }
    for (const t of targets) {
      if (t.type === 'dm') {
        map[t.id] = { name: t.name, avatar: t.avatar }
      }
    }
    return map
  }, [slackUserMap, targets])

  const renderSlackText = useCallback(
    (text: string) => {
      const withResolvedMentions = text
        .replace(/<@([A-Z0-9]+)>/g, (full, userId) => {
          const resolved = targetUserMap[userId]
          return resolved ? `<@${userId}|@${resolved.name}>` : full
        })
        .replace(/\bU[A-Z0-9]{8,}\b/g, (userId) => {
          const resolved = targetUserMap[userId]
          return resolved ? `@${resolved.name}` : userId
        })
      return parseSlackMrkdwn(withResolvedMentions)
    },
    [targetUserMap]
  )

  const isDm = selectedTarget ? selectedTarget.type === 'dm' : Boolean(card.isDm)
  const isPrivate = selectedTarget?.isPrivate ?? false
  const targetName = selectedTarget?.name || card.target
  const cleanTargetName = targetName.replace(/^[#@]/, '')
  const targetAvatar = selectedTarget?.avatar || card.avatar
  const dmColorIdx =
    cleanTargetName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) %
    avatarColors.length

  const filtered = useMemo(() => {
    const q = channelSearch.trim().toLowerCase()
    const items = q ? targets.filter((t) => t.name.toLowerCase().includes(q)) : targets
    return {
      channels: items.filter((t) => t.type === 'channel'),
      dms: items.filter((t) => t.type === 'dm')
    }
  }, [targets, channelSearch])
  const totalResults = filtered.channels.length + filtered.dms.length

  const currentChannelId = selectedTarget?.id || card.channelId
  const currentTargetName = selectedTarget?.name || card.target

  const canConfirm = !busy && message.trim().length > 0

  const handleMessageChange = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    setMessage(e.target.value)
  }

  const handleConfirm = (): void => {
    if (busy) return
    const trimmed = message.trim()
    if (trimmed === '') return
    onConfirm?.({
      message: trimmed,
      channelId: currentChannelId,
      target: currentTargetName
    })
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      handleConfirm()
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleConfirm()
    }
  }

  const handleDiscard = (): void => {
    if (busy) return
    onDiscard?.()
  }

  const shimmerBg =
    'linear-gradient(90deg, rgba(209,210,211,0.04) 25%, rgba(209,210,211,0.07) 50%, rgba(209,210,211,0.04) 75%)'
  const shimmerStyle = (delay: number) => ({
    backgroundImage: shimmerBg,
    backgroundSize: '200% 100%',
    animation: `slack-shimmer 2.4s ease-in-out ${delay}s infinite`
  })

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        borderRadius: 20,
        overflow: 'hidden',
        background: SLACK_DARK.bg,
        border: `1px solid ${SLACK_DARK.border}`,
        color: SLACK_DARK.text,
        fontFamily: slackFont,
        boxShadow: '0 8px 24px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <style>{`
        @keyframes slack-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          position: 'relative',
          background: SLACK_DARK.bgSecondary,
          borderBottom: `1px solid ${SLACK_DARK.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <button
          type="button"
          onClick={() => setChannelDropdownOpen((prev) => !prev)}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label="Select channel or person"
          aria-expanded={channelDropdownOpen}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            textAlign: 'left',
            minWidth: 0,
            maxWidth: 'calc(100% - 44px)'
          }}
        >
          <img
            src={slackIcon}
            alt="Slack"
            width={18}
            height={18}
            style={{ borderRadius: 3, display: 'block', flexShrink: 0 }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              minWidth: 0,
              overflow: 'hidden'
            }}
          >
            {isDm ? (
              <>
                {targetAvatar ? (
                  <img
                    src={targetAvatar}
                    alt={cleanTargetName}
                    width={16}
                    height={16}
                    style={{ borderRadius: 4, objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : (
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      background: avatarColors[dmColorIdx],
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 700,
                      flexShrink: 0
                    }}
                  >
                    {cleanTargetName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#2BAC76',
                    flexShrink: 0
                  }}
                />
              </>
            ) : (
              <span
                style={{
                  color: SLACK_DARK.textDim,
                  fontSize: '14px',
                  fontWeight: 700,
                  flexShrink: 0
                }}
              >
                {isPrivate ? '🔒' : '#'}
              </span>
            )}
            <span
              style={{
                color: SLACK_DARK.textBright,
                fontSize: '14px',
                fontWeight: 700,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {cleanTargetName}
            </span>
            <svg
              width="10"
              height="6"
              viewBox="0 0 10 6"
              fill="none"
              aria-hidden="true"
              style={{
                flexShrink: 0,
                marginLeft: '2px',
                transform: channelDropdownOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s ease'
              }}
            >
              <path
                d="M1 1L5 5L9 1"
                stroke={SLACK_DARK.textDim}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </button>

        <CardCloseButton onClick={handleDiscard} />

        {/* Target switcher dropdown */}
        {channelDropdownOpen && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 20,
              background: SLACK_DARK.bgSecondary,
              borderBottomLeftRadius: '8px',
              borderBottomRightRadius: '8px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              border: `1px solid ${SLACK_DARK.border}`,
              borderTop: 'none',
              maxHeight: '220px',
              overflowY: 'auto'
            }}
          >
            <div style={{ padding: '8px 10px' }}>
              <input
                type="text"
                value={channelSearch}
                onChange={(e) => setChannelSearch(e.target.value)}
                aria-label="Find a channel or person"
                placeholder="Find a channel or person…"
                spellCheck={false}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  color: SLACK_DARK.text,
                  background: SLACK_DARK.bg,
                  border: `1px solid ${SLACK_DARK.border}`,
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  outline: 'none'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = SLACK_DARK.borderFocus
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = SLACK_DARK.border
                }}
              />
            </div>
            {totalResults === 0 ? (
              <div
                style={{
                  padding: '10px 14px',
                  color: SLACK_DARK.textDim,
                  fontSize: '13px'
                }}
              >
                No results
              </div>
            ) : (
              <>
                {filtered.channels.length > 0 && (
                  <div>
                    <div
                      style={{
                        padding: '6px 14px 3px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: SLACK_DARK.textDim,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}
                    >
                      Channels
                    </div>
                    {filtered.channels.map((target) => {
                      const isSelected =
                        target.id === currentChannelId || target.name === currentTargetName
                      return (
                        <button
                          key={target.id}
                          type="button"
                          onClick={() => {
                            setSelectedTarget(target)
                            setChannelDropdownOpen(false)
                            setChannelSearch('')
                          }}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '5px 14px',
                            fontSize: '13px',
                            color: isSelected ? SLACK_DARK.textBright : SLACK_DARK.text,
                            background: isSelected ? 'rgba(29,155,209,0.15)' : 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            textAlign: 'left'
                          }}
                        >
                          <span style={{ color: SLACK_DARK.textDim, fontSize: '13px' }}>
                            {target.isPrivate ? '🔒' : '#'}
                          </span>
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {target.name}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
                {filtered.dms.length > 0 && (
                  <div>
                    <div
                      style={{
                        padding: '6px 14px 3px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: SLACK_DARK.textDim,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}
                    >
                      Direct Messages
                    </div>
                    {filtered.dms.map((target) => {
                      const isSelected =
                        target.id === currentChannelId || target.name === currentTargetName
                      return (
                        <button
                          key={target.id}
                          type="button"
                          onClick={() => {
                            setSelectedTarget(target)
                            setChannelDropdownOpen(false)
                            setChannelSearch('')
                          }}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '5px 14px',
                            fontSize: '13px',
                            color: isSelected ? SLACK_DARK.textBright : SLACK_DARK.text,
                            background: isSelected ? 'rgba(29,155,209,0.15)' : 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            textAlign: 'left'
                          }}
                        >
                          <span style={{ color: SLACK_DARK.textDim, fontSize: '12px' }}>@</span>
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {target.name}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Recent messages list */}
      <div
        className="scrollbar-transparent-track"
        style={{
          padding: '4px 0',
          minHeight: '40px',
          maxHeight: '220px',
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden'
        }}
      >
        {messagesLoading &&
          recentMessages.length === 0 &&
          [0, 1, 2].map((row) => (
            <div
              key={row}
              data-testid="slack-shimmer-row"
              style={{
                display: 'flex',
                gap: '8px',
                padding: '8px 16px 1px 16px'
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '6px',
                  flexShrink: 0,
                  marginTop: '2px',
                  ...shimmerStyle(row * 0.2)
                }}
              />
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  paddingTop: '2px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <div
                    style={{
                      height: 13,
                      width: row === 0 ? 72 : row === 1 ? 56 : 84,
                      borderRadius: '4px',
                      ...shimmerStyle(row * 0.2 + 0.05)
                    }}
                  />
                  <div
                    style={{
                      height: 10,
                      width: 42,
                      borderRadius: '3px',
                      ...shimmerStyle(row * 0.2 + 0.1)
                    }}
                  />
                </div>
                <div
                  style={{
                    height: 13,
                    width: row === 0 ? '85%' : row === 1 ? '60%' : '75%',
                    borderRadius: '4px',
                    ...shimmerStyle(row * 0.2 + 0.15)
                  }}
                />
                {row !== 1 && (
                  <div
                    style={{
                      height: 13,
                      width: row === 0 ? '45%' : '30%',
                      borderRadius: '4px',
                      ...shimmerStyle(row * 0.2 + 0.2)
                    }}
                  />
                )}
              </div>
            </div>
          ))}

        {recentMessages.map((msg, idx) => {
          const resolved = targetUserMap[msg.user || '']
          const name = resolved?.name || msg.username || msg.user || 'Unknown'
          const resolvedAvatar = resolved?.avatar || msg.avatar
          const colorIdx =
            name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) %
            avatarColors.length
          const timestamp = formatSlackTimestamp(msg.ts)

          const prevMsg = idx > 0 ? recentMessages[idx - 1] : null
          const prevResolved = prevMsg?.user ? targetUserMap[prevMsg.user] : null
          const prevName = prevResolved?.name || prevMsg?.username || prevMsg?.user || null
          const sameUser = prevName === name

          return (
            <div
              key={msg.ts || idx}
              style={{
                display: 'flex',
                gap: '8px',
                padding: sameUser ? '1px 16px 1px 52px' : '8px 16px 1px 16px'
              }}
            >
              {!sameUser && (
                <SlackAvatarImg
                  src={resolvedAvatar}
                  name={name}
                  color={avatarColors[colorIdx]}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                {!sameUser && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: '6px',
                      lineHeight: 1.2
                    }}
                  >
                    <span
                      style={{
                        color: SLACK_DARK.textBright,
                        fontSize: '13px',
                        fontWeight: 700
                      }}
                    >
                      {name}
                    </span>
                    {timestamp && (
                      <span
                        style={{
                          color: SLACK_DARK.textMuted,
                          fontSize: '10.5px'
                        }}
                      >
                        {timestamp}
                      </span>
                    )}
                  </div>
                )}
                <div
                  style={{
                    color: SLACK_DARK.text,
                    fontSize: '13px',
                    lineHeight: 1.45,
                    wordBreak: 'break-word',
                    marginTop: sameUser ? 0 : '2px'
                  }}
                >
                  {renderSlackText(msg.text)}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Schedule / Reminder time badge */}
      {card.mode === 'schedule' && card.when && (
        <div
          style={{
            flexShrink: 0,
            margin: '4px 12px',
            padding: '5px 10px',
            borderRadius: '6px',
            background: 'rgba(54,197,240,0.08)',
            border: '1px solid rgba(54,197,240,0.28)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: SLACK_DARK.text,
            lineHeight: 1.3
          }}
        >
          <span style={{ fontSize: '13px', flexShrink: 0 }}>📅</span>
          <span style={{ color: SLACK_DARK.textDim, flexShrink: 0 }}>Scheduled for</span>
          <span
            style={{
              color: SLACK_DARK.textBright,
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {card.when}
          </span>
        </div>
      )}

      {card.mode === 'reminder' && card.when && (
        <div
          style={{
            flexShrink: 0,
            margin: '4px 12px',
            padding: '5px 10px',
            borderRadius: '6px',
            background: 'rgba(54,197,240,0.08)',
            border: '1px solid rgba(54,197,240,0.28)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: SLACK_DARK.text,
            lineHeight: 1.3
          }}
        >
          <span style={{ fontSize: '13px', flexShrink: 0 }}>⏰</span>
          <span style={{ color: SLACK_DARK.textDim, flexShrink: 0 }}>Reminder for</span>
          <span
            style={{
              color: SLACK_DARK.textBright,
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {card.when}
          </span>
        </div>
      )}

      {/* Composer box */}
      <div
        style={{
          padding: '4px 12px 12px',
          flexShrink: 0
        }}
      >
        <div
          style={{
            position: 'relative',
            background: SLACK_DARK.bgSecondary,
            border: '1px solid rgba(209,210,211,0.25)',
            borderRadius: '8px',
            overflow: 'hidden'
          }}
        >
          <textarea
            value={message}
            onChange={handleMessageChange}
            onKeyDown={handleKeyDown}
            onMouseDown={(e) => e.stopPropagation()}
            aria-label="Slack message"
            placeholder={`Message ${isDm ? '' : '#'}${cleanTargetName}`}
            spellCheck={false}
            rows={2}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'transparent',
              color: SLACK_DARK.text,
              border: 'none',
              padding: '10px 42px 8px 12px',
              fontSize: '13px',
              lineHeight: 1.5,
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              minHeight: '44px',
              maxHeight: '120px',
              overflowY: 'auto'
            }}
          />
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseEnter={() => setSendHovered(true)}
            onMouseLeave={() => setSendHovered(false)}
            aria-label="Send message"
            style={{
              position: 'absolute',
              right: '6px',
              bottom: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: '6px',
              background:
                sendHovered && canConfirm ? SLACK_DARK.greenHover : SLACK_DARK.green,
              border: 'none',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              opacity: canConfirm ? 1 : 0.45,
              transition: 'background 0.15s, opacity 0.15s'
            }}
          >
            {busy ? (
              <svg
                className="animate-spin"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="white"
                  strokeWidth="3"
                  strokeDasharray="30 60"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="white" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
