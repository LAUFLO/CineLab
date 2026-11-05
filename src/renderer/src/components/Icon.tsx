import type { ReactNode } from 'react'

export type IconName =
  | 'logo'
  | 'plus'
  | 'cursor'
  | 'frame'
  | 'split'
  | 'history'
  | 'help'
  | 'settings'
  | 'download'
  | 'folder'
  | 'grid'
  | 'droplet'
  | 'sun'
  | 'moon'
  | 'minimize'
  | 'maximize'
  | 'expand'
  | 'close'
  | 'image'
  | 'video'
  | 'audio'
  | 'text'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'search'
  | 'arrow-up'
  | 'stop'
  | 'target'
  | 'link'
  | 'magnet'
  | 'minimap'
  | 'folder-plus'
  | 'edit'
  | 'trash'
  | 'library'
  | 'move'

const paths: Record<IconName, ReactNode> = {
  logo: (
    <>
      <path d="M4 7.5 12 3l8 4.5-8 4.5z" fill="currentColor" stroke="none" />
      <path d="m4 12.5 8 4.5 8-4.5" />
      <path d="m4 16.5 8 4.5 8-4.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  cursor: <path d="M4.5 3.5 11 20l2.4-6.1L19.5 11z" />,
  frame: (
    <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
  ),
  split: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16" />
    </>
  ),
  history: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6v.4" />
      <path d="M12 17.2h.01" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="7" cy="17" r="2.2" />
    </>
  ),
  download: <path d="M12 3.5v11M7.5 10 12 14.5 16.5 10M4 20h16" />,
  folder: <path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v8A1.5 1.5 0 0 1 19 18.5H5A1.5 1.5 0 0 1 3.5 17z" />,
  grid: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
  droplet: <path d="M12 3.2s6 5.9 6 9.8a6 6 0 0 1-12 0c0-3.9 6-9.8 6-9.8z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </>
  ),
  moon: <path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.8 6.8 0 0 0 9.7 9.7z" />,
  minimize: <path d="M5 12h14" />,
  maximize: <rect x="5.5" y="5.5" width="13" height="13" rx="1.5" />,
  expand: (
    <>
      <path d="M9 4H4v5" />
      <path d="M15 4h5v5" />
      <path d="M9 20H4v-5" />
      <path d="M15 20h5v-5" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="9.5" r="1.6" />
      <path d="m4.5 17 4.2-4.2a1.5 1.5 0 0 1 2.1 0L15 17M13.5 15.5l2.2-2.2a1.5 1.5 0 0 1 2.1 0l2.7 2.7" />
    </>
  ),
  video: (
    <>
      <rect x="3.5" y="5.5" width="12" height="13" rx="2" />
      <path d="m15.5 10 5-2.8v9.6l-5-2.8z" />
    </>
  ),
  audio: <path d="M3 12h2.2l1.8-4.5 3 9 2.6-7 1.8 2.5H21" />,
  text: <path d="M5 6.5h14M5 12h14M5 17.5h9" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-left': <path d="m15 6-6 6 6 6" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  'arrow-up': <path d="M12 19V5M6 11l6-6 6 6" />,
  stop: (
    <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  link: (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="12" r="2.5" />
      <path d="M8.5 12h7" />
    </>
  ),
  magnet: (
    <>
      <path d="M6 4v8a6 6 0 0 0 12 0V4" />
      <path d="M6 9h4M14 9h4" />
    </>
  ),
  'folder-plus': (
    <>
      <path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v8A1.5 1.5 0 0 1 19 18.5H5A1.5 1.5 0 0 1 3.5 17z" />
      <path d="M12 11v5M9.5 13.5h5" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4l10-10-4-4L4 16z" />
      <path d="m14 6 4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  move: (
    <>
      <path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v8A1.5 1.5 0 0 1 19 18.5H5A1.5 1.5 0 0 1 3.5 17z" />
      <path d="M8.5 12.5h6M12 10l2.5 2.5L12 15" />
    </>
  ),
  library: (
    <>
      <path d="M4 5.5h4v14H4zM10 5.5h4v14h-4z" />
      <path d="m16.5 6 3.2-1 2.3 13.5-3.2 1z" />
    </>
  ),
  minimap: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <rect x="6" y="8" width="5" height="4" rx="1" fill="currentColor" stroke="none" />
      <rect x="13" y="12" width="5" height="4" rx="1" fill="currentColor" stroke="none" />
    </>
  )
}

interface IconProps {
  name: IconName
  size?: number
  className?: string
}

export function Icon({ name, size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
