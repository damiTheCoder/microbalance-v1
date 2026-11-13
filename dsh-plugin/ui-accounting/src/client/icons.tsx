/** Lucide-style glyphs for the accounting navigation entries (no extra dependency). */
import type { JSX } from 'react'

interface IconProps {
  size?: number | undefined
}

function Glyph({ size = 18, children }: IconProps & { children: JSX.Element }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

/** Lucide `List`. */
export function ListIcon({ size }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <>
        <path d="M8 6h13" />
        <path d="M8 12h13" />
        <path d="M8 18h13" />
        <path d="M3 6h.01" />
        <path d="M3 12h.01" />
        <path d="M3 18h.01" />
      </>
    </Glyph>
  )
}

/** Lucide `BookOpen`. */
export function BookOpenIcon({ size }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <>
        <path d="M12 7v14" />
        <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
      </>
    </Glyph>
  )
}

/** Lucide `Scale`. */
export function ScaleIcon({ size }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <>
        <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
        <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
        <path d="M7 21h10" />
        <path d="M12 3v18" />
        <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
      </>
    </Glyph>
  )
}

/** Lucide `Home`. */
export function HomeIcon({ size }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <>
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </>
    </Glyph>
  )
}

/** Lucide `TrendingUp`. */
export function TrendingUpIcon({ size }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <>
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </>
    </Glyph>
  )
}

/** Lucide `Landmark`. */
export function LandmarkIcon({ size }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <>
        <line x1="3" x2="21" y1="22" y2="22" />
        <line x1="6" x2="6" y1="18" y2="11" />
        <line x1="10" x2="10" y1="18" y2="11" />
        <line x1="14" x2="14" y1="18" y2="11" />
        <line x1="18" x2="18" y1="18" y2="11" />
        <polygon points="12 2 20 7 4 7" />
      </>
    </Glyph>
  )
}
