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

/** Google Calendar 2020 mark: official geometry and brand colours. */
export function GoogleCalendarIcon({ size = 22 }: BrandIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <g transform="translate(3.75 3.75)">
        <path fill="#FFFFFF" d="M148.882 43.618l-47.368-5.263-57.895 5.263L38.355 96.25l5.263 52.632 52.632 6.579 52.632-6.579 5.263-53.947-5.263-52.632z" />
        <path fill="#1A73E8" d="M65.211 125.276c-3.934-2.658-6.658-6.539-8.145-11.671l9.132-3.763c.829 3.158 2.276 5.605 4.342 7.342 2.053 1.737 4.553 2.592 7.474 2.592 2.987 0 5.553-.908 7.697-2.724s3.224-4.132 3.224-6.934c0-2.868-1.132-5.211-3.395-7.026s-5.105-2.724-8.5-2.724h-5.276v-9.039H76.5c2.921 0 5.382-.789 7.382-2.368 2-1.579 3-3.737 3-6.487 0-2.447-.895-4.395-2.684-5.855s-4.053-2.197-6.803-2.197c-2.684 0-4.816.711-6.395 2.145s-2.724 3.197-3.447 5.276l-9.039-3.763c1.197-3.395 3.395-6.395 6.618-8.987 3.224-2.592 7.342-3.895 12.342-3.895 3.697 0 7.026.711 9.974 2.145 2.947 1.434 5.263 3.421 6.934 5.947 1.671 2.539 2.5 5.382 2.5 8.539 0 3.224-.776 5.947-2.329 8.184-1.553 2.237-3.461 3.947-5.724 5.145v.539c2.987 1.25 5.421 3.158 7.342 5.724 1.908 2.566 2.868 5.632 2.868 9.211s-.908 6.776-2.724 9.579c-1.816 2.803-4.329 5.013-7.513 6.618-3.197 1.605-6.789 2.421-10.776 2.421-4.289 0-8.552-1.329-12.486-3.987z" />
        <path fill="#1A73E8" d="M121.25 79.961l-9.974 7.25-5.013-7.605 17.987-12.974h6.895v61.197h-9.895V79.961z" />
        <path fill="#EA4335" d="M148.882 196.25l47.368-47.368-23.684-10.526-23.684 10.526-10.526 23.684 10.526 23.684z" />
        <path fill="#34A853" d="M33.092 172.566l10.526 23.684h105.263v-47.368H43.618l-10.526 23.684z" />
        <path fill="#4285F4" d="M12.039-3.75C3.316-3.75-3.75 3.316-3.75 12.039v136.842l23.684 10.526 23.684-10.526V43.618h105.263l10.526-23.684L148.882-3.75H12.039z" />
        <path fill="#188038" d="M-3.75 148.882v31.579c0 8.724 7.066 15.789 15.789 15.789h31.579v-47.368H-3.75z" />
        <path fill="#FBBC04" d="M148.882 43.618v105.263h47.368V43.618l-23.684-10.526-23.684 10.526z" />
        <path fill="#1967D2" d="M196.25 43.618V12.039c0-8.724-7.066-15.789-15.789-15.789h-31.579v47.368H196.25z" />
      </g>
    </svg>
  )
}

/** Google Meet 2020 mark: official camera geometry and brand colours. */
export function GoogleMeetIcon({ size = 22 }: BrandIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 87.5 72" fill="none" aria-hidden="true" focusable="false">
      <path fill="#00832d" d="M49.5 36l8.53 9.75 11.47 7.33 2-17.02-2-16.64-11.69 6.44z" />
      <path fill="#0066da" d="M0 51.5V66c0 3.315 2.685 6 6 6h14.5l3-10.96-3-9.54-9.95-3z" />
      <path fill="#e94235" d="M20.5 0L0 20.5l10.55 3 9.95-3 2.95-9.41z" />
      <path fill="#2684fc" d="M20.5 20.5H0v31h20.5z" />
      <path fill="#00ac47" d="M82.6 8.68L69.5 19.42v33.66l13.16 10.79c1.97 1.54 4.85.135 4.85-2.37V11c0-2.535-2.945-3.925-4.91-2.32zM49.5 36v15.5h-29V72h43c3.315 0 6-2.685 6-6V53.08z" />
      <path fill="#ffba00" d="M63.5 0h-43v20.5h29V36l20-16.57V6c0-3.315-2.685-6-6-6z" />
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
