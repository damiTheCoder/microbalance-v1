/** Integrations hub: connect Google Drive backups and Gmail sending. */
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { CORE_URL, callCore } from './core.ts'
import css from './accounting.module.css'

interface DriveProfile {
  driveConnected: boolean
  driveSyncSchedule: string
}

interface GmailStatus {
  connected: boolean
  email: string
}

interface Integration {
  id: 'drive' | 'gmail'
  name: string
  description: string
  icon: ReactNode
  available: true
}

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/** POST to the core with the browser session attached. */
async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${CORE_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: { ...(init?.headers ?? {}), 'content-type': 'application/json' },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
  return body as T
}

const DriveIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#0f9d58" d="M8.6 3h6.8l6.6 11.4h-6.8z" />
    <path fill="#f4b400" d="M2 14.4 8.6 3l3.4 5.9-6.6 11.4z" />
    <path fill="#4285f4" d="M8.8 21 12.2 15h13l-3.4 6z" />
  </svg>
)

const GmailIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="2" y="5" width="20" height="14" rx="2.4" fill="#ffffff" stroke="#e5e7eb" />
    <path d="M4.4 7.4v9.2" stroke="#c5221f" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M19.6 7.4v9.2" stroke="#fbbc04" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M4.6 7.3 12 12.6l7.4-5.3" fill="none" stroke="#ea4335" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4.6 16.9v-3.1l3.1 2.2" fill="none" stroke="#34a853" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)

const COMING_SOON = [
  { name: 'Slack', description: 'Post daily summaries to your team channel.' },
  { name: 'WhatsApp', description: 'Send invoices and reminders to customers.' },
  { name: 'QuickBooks', description: 'Import historical ledgers and contacts.' },
]

/** Integrations page: searchable cards, with Drive and Gmail settings. */
export function IntegrationsPage() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<'drive' | 'gmail' | null>(null)
  const [drive, setDrive] = useState<DriveProfile | null>(null)
  const [gmail, setGmail] = useState<GmailStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadDrive = useCallback((): void => {
    callCore<DriveProfile | null>('GET_BUSINESS_PROFILE')
      .then((profile) => { if (profile) setDrive(profile) })
      .catch(() => { /* the card simply shows "Not connected" */ })
  }, [])

  const loadGmail = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${CORE_URL}/api/email/status`, { credentials: 'include' })
      const body = await response.json().catch(() => null)
      if (body !== null) setGmail({ connected: body.connected === true, email: String(body.email ?? '') })
    } catch { /* core offline: keep the last known state */ }
  }, [])

  useEffect(() => { loadDrive() }, [loadDrive])

  // The composer's Integrations menu hands off the card it wants opened.
  useEffect(() => {
    const pending = window.sessionStorage.getItem('mb:integration')
    if (pending !== 'drive' && pending !== 'gmail') return
    window.sessionStorage.removeItem('mb:integration')
    setOpen(pending)
  }, [])

  // Poll only while the Gmail dialog is open so the OAuth return is picked up.
  useEffect(() => {
    if (open !== 'gmail') return
    void loadGmail()
    const timer = window.setInterval(() => { void loadGmail() }, 3000)
    return () => { window.clearInterval(timer) }
  }, [open, loadGmail])

  const changeSchedule = async (schedule: string): Promise<void> => {
    setError(null)
    try {
      await callApi<{ data: { schedule: string } }>('/api/drive/schedule', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ schedule }),
      })
      setDrive(current => current ? { ...current, driveSyncSchedule: schedule } : current)
      setNotice(`Drive backup schedule set to ${schedule.toLowerCase()}.`)
    } catch (cause: unknown) {
      setError(messageOf(cause))
    }
  }

  const syncNow = async (): Promise<void> => {
    setSyncing(true)
    setError(null)
    setNotice(null)
    try {
      const result = await callApi<{ data: { folder: string[]; uploaded: string[] } }>(
        '/api/drive/sync',
        { method: 'POST' },
      )
      setNotice(`Backed up ${result.data.uploaded.length} reports to ${result.data.folder.join(' / ')}.`)
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setSyncing(false)
    }
  }

  const integrations: Integration[] = [
    {
      id: 'drive',
      name: 'Google Drive',
      description: 'Automatically backup P&L, Balance Sheet, and Trial Balance reports.',
      icon: DriveIcon,
      available: true,
    },
    {
      id: 'gmail',
      name: 'Gmail',
      description: 'Send invoices, receipts, and financial reports directly from the AI.',
      icon: GmailIcon,
      available: true,
    },
  ]

  const needle = query.trim().toLowerCase()
  const visible = integrations.filter(item =>
    needle === '' || `${item.name} ${item.description}`.toLowerCase().includes(needle),
  )
  const soon = COMING_SOON.filter(item =>
    needle === '' || `${item.name} ${item.description}`.toLowerCase().includes(needle),
  )

  const close = (): void => {
    setOpen(null)
    setError(null)
    setNotice(null)
  }

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Integrations</h1>
          <p className={css.subtitle}>
            Connect MicroBalance to the tools your business already uses.
          </p>
        </div>
      </header>

      <input
        type="search"
        className={css.integrationSearch}
        placeholder="Search integrations"
        value={query}
        onChange={(event) => { setQuery(event.target.value) }}
      />

      <div className={css.integrationGrid}>
        {visible.map(item => {
          const connected = item.id === 'drive'
            ? drive?.driveConnected === true
            : gmail?.connected === true
          return (
            <article key={item.id} className={css.integrationCard}>
              <div className={css.integrationTop}>
                <span className={css.integrationLogo}>{item.icon}</span>
                {connected && <span className={css.integrationBadge}>Connected</span>}
              </div>
              <h2 className={css.integrationName}>{item.name}</h2>
              <p className={css.integrationDesc}>{item.description}</p>
              <button
                type="button"
                className={`${css.button} ${css.primary} ${css.integrationManage}`}
                onClick={() => { setOpen(item.id); setError(null); setNotice(null) }}
              >
                Manage
              </button>
            </article>
          )
        })}

        {soon.map(item => (
          <article key={item.name} className={`${css.integrationCard} ${css.integrationSoon}`}>
            <div className={css.integrationTop}>
              <span className={`${css.integrationLogo} ${css.integrationLogoMuted}`}>
                {item.name.slice(0, 1)}
              </span>
              <span className={css.integrationBadge}>Coming soon</span>
            </div>
            <h2 className={css.integrationName}>{item.name}</h2>
            <p className={css.integrationDesc}>{item.description}</p>
            <button type="button" className={css.button} disabled>Manage</button>
          </article>
        ))}
      </div>

      {visible.length === 0 && soon.length === 0 && (
        <p className={css.empty}>No integrations match “{query}”.</p>
      )}

      {open !== null && (
        <>
          <div className={css.mailBackdrop} onClick={close} />
          <div className={css.mailDialog} role="dialog" aria-label={open === 'drive' ? 'Google Drive settings' : 'Gmail settings'}>
            <h2 className={css.mailTitle}>
              {open === 'drive' ? 'Google Drive' : 'Gmail'}
            </h2>

            {open === 'drive' && (
              <>
                <p className={css.integrationStatus}>
                  {drive === null
                    ? 'Checking connection…'
                    : drive.driveConnected ? 'Connected ✅' : 'Not connected'}
                </p>
                {drive !== null && !drive.driveConnected && (
                  <button
                    type="button"
                    className={`${css.button} ${css.primary}`}
                    onClick={() => { window.open(`${CORE_URL}/api/drive/connect`, '_blank', 'noopener') }}
                  >
                    Connect Google Drive
                  </button>
                )}
                {drive !== null && drive.driveConnected && (
                  <>
                    <label className={css.mailField}>
                      <span>Sync schedule</span>
                      <select
                        className={css.mailInput}
                        value={drive.driveSyncSchedule}
                        onChange={(event) => { void changeSchedule(event.target.value) }}
                      >
                        <option value="MANUAL">Manual</option>
                        <option value="WEEKLY">Weekly</option>
                        <option value="MONTHLY">Monthly</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className={`${css.button} ${css.primary}`}
                      disabled={syncing}
                      onClick={() => { void syncNow() }}
                    >
                      {syncing ? 'Syncing…' : 'Sync Now'}
                    </button>
                  </>
                )}
                <button type="button" className={css.button} onClick={loadDrive}>
                  Refresh status
                </button>
              </>
            )}

            {open === 'gmail' && (
              <>
                {gmail?.connected === true ? (
                  <p className={css.mailConnected}>✅ Gmail Connected as {gmail.email}</p>
                ) : (
                  <>
                    <p className={css.integrationStatus}>
                      {gmail === null ? 'Checking connection…' : 'Not connected'}
                    </p>
                    <a
                      className={css.mailConnect}
                      href={`${CORE_URL}/api/email/connect`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Connect Google Account for Email
                    </a>
                  </>
                )}
                <p className={css.subtitle}>
                  Once connected, use the Mail button in the chat composer or ask the AI to email a report.
                </p>
              </>
            )}

            {error !== null && <p className={css.mailError}>{error}</p>}
            {notice !== null && <p className={css.mailConnected}>{notice}</p>}

            <div className={css.mailActions}>
              <button type="button" className={css.mailCancel} onClick={close}>Close</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
