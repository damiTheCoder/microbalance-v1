/** Full-colour brand marks for the Integrations cards. */

interface BrandIconProps {
  readonly size?: number
}

/** Google Drive triangle (blue, green, yellow, red facets). */
export function GoogleDriveIcon({ size = 22 }: BrandIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 87.3 78" aria-hidden="true" focusable="false">
      <path fill="#0066da" d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" />
      <path fill="#00ac47" d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A9.06 9.06 0 0 0 0 53h27.5z" />
      <path fill="#ea4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.5c.8-1.4 1.2-2.95 1.2-4.5H59.85L73.55 76.8z" />
      <path fill="#00832d" d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2H34.4c-1.6 0-3.15.45-4.5 1.2z" />
      <path fill="#2684fc" d="M59.85 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" />
      <path fill="#ffba00" d="M73.4 26.5 60.7 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.2 28h27.45c0-1.55-.4-3.1-1.2-4.5z" />
    </svg>
  )
}

/** Gmail envelope (blue, green, yellow, red). */
export function GmailIcon({ size = 22 }: BrandIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285f4" d="M2.4 19.2h3.3V9.9L1.6 7v10.8c0 .77.62 1.4 1.4 1.4" />
      <path fill="#34a853" d="M18.3 19.2h3.3c.78 0 1.4-.63 1.4-1.4V7l-4.1 2.9" />
      <path fill="#fbbc04" d="M18.3 4.8v5.1L23 7V5.6c0-2-2.28-3.14-3.88-1.94" />
      <path fill="#ea4335" d="M5.7 9.9V4.8L12 9.5l6.3-4.7v5.1L12 14.6" />
      <path fill="#c5221f" d="M1.6 5.6V7l4.1 2.9V4.8L4.12 3.66C2.52 2.46 1.6 3.6 1.6 5.6" />
    </svg>
  )
}

/** Slack's four-colour hash. */
export function SlackIcon({ size = 22 }: BrandIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#e01e5a" d="M5.04 15.17a2.53 2.53 0 0 1-2.52 2.52A2.53 2.53 0 0 1 0 15.17a2.53 2.53 0 0 1 2.52-2.52h2.52zM6.31 15.17a2.53 2.53 0 0 1 2.52-2.52 2.53 2.53 0 0 1 2.52 2.52v6.31A2.53 2.53 0 0 1 8.83 24a2.53 2.53 0 0 1-2.52-2.52z" />
      <path fill="#36c5f0" d="M8.83 5.04a2.53 2.53 0 0 1-2.52-2.52A2.53 2.53 0 0 1 8.83 0a2.53 2.53 0 0 1 2.52 2.52v2.52zM8.83 6.31a2.53 2.53 0 0 1 2.52 2.52 2.53 2.53 0 0 1-2.52 2.52H2.52A2.53 2.53 0 0 1 0 8.83a2.53 2.53 0 0 1 2.52-2.52z" />
      <path fill="#2eb67d" d="M18.96 8.83a2.53 2.53 0 0 1 2.52-2.52A2.53 2.53 0 0 1 24 8.83a2.53 2.53 0 0 1-2.52 2.52h-2.52zM17.69 8.83a2.53 2.53 0 0 1-2.52 2.52 2.53 2.53 0 0 1-2.52-2.52V2.52A2.53 2.53 0 0 1 15.17 0a2.53 2.53 0 0 1 2.52 2.52z" />
      <path fill="#ecb22e" d="M15.17 18.96a2.53 2.53 0 0 1 2.52 2.52A2.53 2.53 0 0 1 15.17 24a2.53 2.53 0 0 1-2.52-2.52v-2.52zM15.17 17.69a2.53 2.53 0 0 1-2.52-2.52 2.53 2.53 0 0 1 2.52-2.52h6.31A2.53 2.53 0 0 1 24 15.17a2.53 2.53 0 0 1-2.52 2.52z" />
    </svg>
  )
}

/** WhatsApp's green speech bubble and handset. */
export function WhatsAppIcon({ size = 22 }: BrandIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#25d366" d="M12 2a10 10 0 0 0-8.6 15L2 22l5.1-1.3A10 10 0 1 0 12 2z" />
      <path fill="#ffffff" d="M9.3 7.1c.2-.4.6-.4.9-.4h.6c.2 0 .4.1.5.4l.9 2c.1.3.1.4-.1.6l-.6.7c-.1.2-.2.3 0 .6.5.9 1.4 1.8 2.4 2.4.3.2.4.1.6-.1l.7-.7c.2-.2.3-.2.6-.1l2 .9c.3.1.4.3.4.5v.6c0 .5-.3 1-.8 1.2-.7.3-1.6.4-2.6 0-1.4-.5-2.7-1.4-3.9-2.6-1.2-1.2-2.1-2.5-2.6-3.9-.4-1-.3-1.9 0-2.6z" />
    </svg>
  )
}

/** QuickBooks' green roundel. */
export function QuickBooksIcon({ size = 22 }: BrandIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10" fill="#2ca01c" />
      <text x="12" y="16.4" textAnchor="middle" fill="#ffffff" fontFamily="Helvetica, Arial, sans-serif" fontSize="9.5" fontWeight="700">qb</text>
    </svg>
  )
}
