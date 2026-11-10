import type { JSX } from 'react'

export interface DashboardIconProps {
  className?: string
  width?: number | string
  height?: number | string
  size?: number | string
  style?: React.CSSProperties
}

export function AISparkleIcon({ className, width, height, size = 20, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M19.25 13C14.1955 13.4375 11.4375 16.1955 11 21.25C10.544 16.1169 7.80041 13.5721 2.75 13C7.88024 12.4083 10.4083 9.88024 11 4.75C11.5721 9.80041 14.1169 12.544 19.25 13Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.7898 1.25884C19.7731 1.11151 19.6486 1.00015 19.5003 1C19.352 0.999849 19.2272 1.11096 19.2103 1.25825C19.0998 2.21602 18.8134 2.8895 18.3515 3.35146C17.8895 3.81343 17.216 4.09979 16.2582 4.21025C16.111 4.22724 15.9998 4.35203 16 4.5003C16.0002 4.64857 16.1115 4.77313 16.2588 4.78981C17.2008 4.89651 17.8886 5.18275 18.3615 5.64713C18.8327 6.10977 19.125 6.7831 19.2095 7.73414C19.2229 7.88476 19.3491 8.00017 19.5003 8C19.6515 7.99983 19.7775 7.88413 19.7906 7.73349C19.8716 6.79809 20.1636 6.11059 20.6371 5.6371C21.1106 5.16361 21.7981 4.87155 22.7335 4.79058C22.8841 4.77754 22.9998 4.65154 23 4.50033C23.0002 4.34912 22.8848 4.22286 22.7341 4.20948C21.7831 4.125 21.1098 3.83266 20.6471 3.36151C20.1827 2.88857 19.8965 2.20078 19.7898 1.25884Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function MicIcon({ className, width, height, size = 20, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M12.0009 19C15.0764 19 17.7195 17.1489 18.8769 14.5M12.0009 19C8.92546 19 6.28233 17.1489 5.125 14.5M12.0009 19V21.25M12.0009 15.75C9.65372 15.75 7.75093 13.8472 7.75093 11.5V7C7.75093 4.65279 9.65372 2.75 12.0009 2.75C14.3481 2.75 16.2509 4.65279 16.2509 7V11.5C16.2509 13.8472 14.3481 15.75 12.0009 15.75Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function HomeIcon({ className, width, height, size = 20, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <g transform="translate(0, 2)">
        <path
          d="M15 18.9979V13.998C15 12.3412 13.6569 10.998 12 10.998C10.3431 10.998 9 12.3412 9 13.998V18.9979M15 18.9979C16.9767 18.9964 18.0128 18.9713 18.816 18.5621C19.5686 18.1786 20.1805 17.5666 20.564 16.814C21 15.9584 21 14.8382 21 12.598V10.7567C21 9.73985 21 9.2314 20.8813 8.75515C20.7761 8.33298 20.6028 7.9308 20.3681 7.56446C20.1033 7.15118 19.7337 6.80207 18.9944 6.10385L16.3944 3.64829C14.8479 2.18771 14.0746 1.45741 13.1925 1.1819C12.416 0.939367 11.584 0.939367 10.8075 1.1819C9.92537 1.45741 9.15211 2.18771 7.60561 3.64829L5.00561 6.10385C4.26632 6.80207 3.89667 7.15118 3.63191 7.56446C3.39721 7.9308 3.22385 8.33298 3.11866 8.75515C3 9.2314 3 9.73985 3 10.7567V12.598C3 14.8382 3 15.9584 3.43597 16.814C3.81947 17.5666 4.43139 18.1786 5.18404 18.5621C5.98717 18.9713 7.0233 18.9964 9 18.9979M15 18.9979C13 18.9995 11 18.9995 9 18.9979"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  )
}

export function HistoryIcon({ className, width, height, size = 20, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M3 5V9H7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.51172 15C4.74723 18.4956 8.08094 21 11.9996 21C16.9702 21 20.9996 16.9706 20.9996 12C20.9996 7.02944 16.9702 3 11.9996 3C8.27045 3 5.07102 5.26806 3.70551 8.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 8V12L15 15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function InsightsIcon({ className, width, height, size = 20, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M5 21v-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 21V10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 21V4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function BlocksIcon({ className, width, height, size = 20, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3" />
    </svg>
  )
}

export function ChevronDownIcon({ className, width, height, size = 16, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export function CircleDollarSignIcon({ className, width, height, size = 20, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
      <path d="M12 18V6" />
    </svg>
  )
}

export function ExternalLinkIcon({ className, width, height, size = 16, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  )
}

export function GiftIcon({ className, width, height, size = 20, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
    </svg>
  )
}

export function DiscordIcon({ className, width, height, size = 20, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 -28.5 256 256"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M216.856339,16.5966031 C200.285002,8.84328665 182.566144,3.2084988 164.041564,0 C161.766523,4.11318106 159.108624,9.64549908 157.276099,14.0464379 C137.583995,11.0849896 118.072967,11.0849896 98.7430163,14.0464379 C96.9108417,9.64549908 94.1925838,4.11318106 91.8971895,0 C73.3526068,3.2084988 55.6133949,8.86399117 39.0420583,16.6376612 C5.61752293,67.146514 -3.4433191,116.400813 1.08711069,164.955721 C23.2560196,181.510915 44.7403634,191.567697 65.8621325,198.148576 C71.0772151,190.971126 75.7283628,183.341335 79.7352139,175.300261 C72.104019,172.400575 64.7949724,168.822202 57.8887866,164.667963 C59.7209612,163.310589 61.5131304,161.891452 63.2445898,160.431257 C105.36741,180.133187 151.134928,180.133187 192.754523,160.431257 C194.506336,161.891452 196.298154,163.310589 198.110326,164.667963 C191.183787,168.842556 183.854737,172.420929 176.223542,175.320965 C180.230393,183.341335 184.861538,190.991831 190.096624,198.16893 C211.238746,191.588051 232.743023,181.531619 254.911949,164.955721 C260.227747,108.668201 245.831087,59.8662432 216.856339,16.5966031 Z M85.4738752,135.09489 C72.8290281,135.09489 62.4592217,123.290155 62.4592217,108.914901 C62.4592217,94.5396472 72.607595,82.7145587 85.4738752,82.7145587 C98.3405064,82.7145587 108.709962,94.5189427 108.488529,108.914901 C108.508531,123.290155 98.3405064,135.09489 85.4738752,135.09489 Z M170.525237,135.09489 C157.88039,135.09489 147.510584,123.290155 147.510584,108.914901 C147.510584,94.5396472 157.658606,82.7145587 170.525237,82.7145587 C183.391518,82.7145587 193.761324,94.5189427 193.539891,108.914901 C193.539891,123.290155 183.391518,135.09489 170.525237,135.09489 Z"
        fill="currentColor"
        fillRule="nonzero"
      />
    </svg>
  )
}

export function SearchIcon({ className, width, height, size = 16, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

export function ChevronsUpDownIcon({ className, width, height, size = 16, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m7 15 5 5 5-5" />
      <path d="m7 9 5-5 5 5" />
    </svg>
  )
}

export function RefreshIcon({ className, width, height, size = 16, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  )
}

export function FlagIcon({ className, width, height, size = 16, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" x2="4" y1="22" y2="15" />
    </svg>
  )
}

export function TrashIcon({ className, width, height, size = 16, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  )
}

export function CopyIcon({ className, width, height, size = 16, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  )
}

export function CheckIcon({ className, width, height, size = 16, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export function XIcon({ className, width, height, size = 16, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

export function SparklesIcon({ className, width, height, size = 20, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
      <path d="M4 17v2" />
      <path d="M5 18H3" />
    </svg>
  )
}

export function PenLineIcon({ className, width, height, size = 20, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
    </svg>
  )
}

export function MessageCircleIcon({ className, width, height, size = 20, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  )
}

export function BriefcaseIcon({ className, width, height, size = 20, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect width="20" height="14" x="2" y="6" rx="2" />
    </svg>
  )
}

export function MailIcon({ className, width, height, size = 20, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  )
}

export function GlobeIcon({ className, width, height, size = 20, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  )
}

export function BookOpenIcon({ className, width, height, size = 20, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 8C12 6.34315 13.3431 5 15 5H20C21.1046 5 22 5.89543 22 7V17C22 18.1046 21.1046 19 20 19H15.277C14.5966 19 13.9296 19.1642 13.3508 19.5219C12.772 19.8796 12.3043 20.3914 12 21M12 8C12 6.34315 10.6569 5 9 5H4C2.89543 5 2 5.89543 2 7V17C2 18.1046 2.89543 19 4 19H8.723C9.40341 19 10.0704 19.1642 10.6492 19.5219C11.228 19.8796 11.6957 20.3914 12 21M12 8V21" />
    </svg>
  )
}

export function ReplaceIcon({ className, width, height, size = 20, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M11 14h10" />
      <path d="M16 4h2a2 2 0 0 1 2 2v1.344" />
      <path d="m17 18 4-4-4-4" />
      <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 1.793-1.113" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
    </svg>
  )
}

export function PlusIcon({ className, width, height, size = 16, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}

export function ZapIcon({ className, width, height, size = 20, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
    </svg>
  )
}

export function TimerIcon({ className, width, height, size = 20, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <line x1="10" x2="14" y1="2" y2="2" />
      <line x1="12" x2="15" y1="14" y2="11" />
      <circle cx="12" cy="14" r="8" />
    </svg>
  )
}

export function BrainIcon({ className, width, height, size = 20, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
      <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
      <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
      <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
      <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
      <path d="M6 18a4 4 0 0 1-1.967-.516" />
      <path d="M19.967 17.484A4 4 0 0 1 18 18" />
    </svg>
  )
}

export function CheckCircleIcon({ className, width, height, size = 16, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" fill="#126ff6" />
      <path
        d="m9 12 2 2 4-4"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function AvatarIcon({ className, width, height, size = 20, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="64" cy="64" r="64" fill="#93c5fd" />
      <circle cx="64" cy="50" r="20" fill="#4e94f8" />
      <ellipse cx="64" cy="92" rx="38" ry="16" fill="#4e94f8" />
    </svg>
  )
}

export function ChevronLeftIcon({ className, width, height, size = 16, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size
  const h = height ?? size
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

export function ChevronRightIcon({ className, width, height, size = 16, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size
  const h = height ?? size
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

export function PlayIcon({ className, width, height, size = 20, style }: DashboardIconProps): JSX.Element {
  const w = width ?? size
  const h = height ?? size
  return (
    <svg
      width={w}
      height={h}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  )
}
