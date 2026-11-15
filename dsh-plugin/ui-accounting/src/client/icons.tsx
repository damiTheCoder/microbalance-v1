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

/** Lucide `Users`. */
export function UsersIcon({ size }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    </Glyph>
  )
}

/** Lucide `Receipt`. */
export function ReceiptIcon({ size }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <>
        <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
        <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
        <path d="M12 17.5v-11" />
      </>
    </Glyph>
  )
}

/** Lucide `Hourglass`. */
export function HourglassIcon({ size }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <>
        <path d="M5 22h14" />
        <path d="M5 2h14" />
        <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
        <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
      </>
    </Glyph>
  )
}

/** Lucide `Wallet`. */
export function WalletIcon({ size }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <>
        <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
        <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
      </>
    </Glyph>
  )
}

/** Lucide `Link`. */
export function LinkIcon({ size }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </>
    </Glyph>
  )
}

/** Lucide `CheckCircle`. */
export function CheckCircleIcon({ size }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <path d="m9 11 3 3L22 4" />
      </>
    </Glyph>
  )
}

/** Lucide `Building2`. */
export function BuildingIcon({ size }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <>
        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
        <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
        <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
        <path d="M10 6h4" />
        <path d="M10 10h4" />
        <path d="M10 14h4" />
        <path d="M10 18h4" />
      </>
    </Glyph>
  )
}

/** Lucide `FileText`. */
export function FileTextIcon({ size }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <>
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        <path d="M10 9H8" />
        <path d="M16 13H8" />
        <path d="M16 17H8" />
      </>
    </Glyph>
  )
}

/** Lucide `Package`. */
export function PackageIcon({ size }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <>
        <path d="m7.5 4.27 9 5.15" />
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="M12 22V12" />
        <path d="m3.3 7 8.7 5 8.7-5" />
      </>
    </Glyph>
  )
}

/** Lucide `LayoutGrid`. */
export function LayoutGridIcon({ size }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <>
        <rect width="7" height="7" x="3" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="14" rx="1" />
        <rect width="7" height="7" x="3" y="14" rx="1" />
      </>
    </Glyph>
  )
}

/** Lucide `Percent`. */
export function PercentIcon({ size }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <>
        <line x1="19" x2="5" y1="5" y2="19" />
        <circle cx="6.5" cy="6.5" r="2.5" />
        <circle cx="17.5" cy="17.5" r="2.5" />
      </>
    </Glyph>
  )
}

/** Lucide `Calendar`. */
export function CalendarIcon({ size }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <>
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M3 10h18" />
      </>
    </Glyph>
  )
}

/** Lucide `Truck`. */
export function TruckIcon({ size }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <>
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
        <path d="M15 18H9" />
        <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
        <circle cx="17" cy="18" r="2" />
        <circle cx="7" cy="18" r="2" />
      </>
    </Glyph>
  )
}

/** Lucide `TrendingDown`. */
export function TrendingDownIcon({ size }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <>
        <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
        <polyline points="16 17 22 17 22 11" />
      </>
    </Glyph>
  )
}

/** Lucide `Target`. */
export function TargetIcon({ size }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </>
    </Glyph>
  )
}

/** Lucide `BarChart3`. */
export function BarChartIcon({ size }: IconProps): JSX.Element {
  return (
    <Glyph size={size}>
      <>
        <path d="M3 3v18h18" />
        <path d="M18 17V9" />
        <path d="M13 17V5" />
        <path d="M8 17v-3" />
      </>
    </Glyph>
  )
}
