/** Composer mail action: email a financial report to a recipient. */
import { useEffect, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { Mail } from 'lucide-react'
import { CORE_URL } from './core.ts'
import css from './accounting.module.css'

type MailReport = '' | 'PROFIT_AND_LOSS' | 'BALANCE_SHEET' | 'TRIAL_BALANCE'

const REPORTS: Array<{ value: MailReport; label: string }> = [
  { value: '', label: 'None' },
  { value: 'PROFIT_AND_LOSS', label: 'Profit & Loss' },
  { value: 'BALANCE_SHEET', label: 'Balance Sheet' },
  { value: 'TRIAL_BALANCE', label: 'Trial Balance' },
]

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/** Mail button rendered beside the composer controls. */
export function MailButton(_props: PropsRuntime<'conversation.input.right'>) {
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [reportType, setReportType] = useState<MailReport>('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [gmail, setGmail] = useState<{ connected: boolean; email: string } | null>(null)

  // Ask the core which Google account (if any) can send mail, and re-check
  // while the modal is open so the OAuth tab's return is picked up.
  useEffect(() => {
    if (!open) return
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const response = await fetch(`${CORE_URL}/api/email/status`, { credentials: 'include' })
        const body = await response.json().catch(() => null)
        if (!alive || body === null) return
        setGmail({ connected: body.connected === true, email: String(body.email ?? '') })
      } catch { /* core offline: leave the last known state */ }
    }
    void load()
    const timer = window.setInterval(() => { void load() }, 3000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [open])

  const submit = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`${CORE_URL}/api/email/send`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          to,
          subject,
          text,
          ...(reportType === '' ? {} : { reportType }),
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
      setOpen(false)
      setTo('')
      setSubject('')
      setReportType('')
      setText('')
      setToast(`Email sent to ${body.to ?? to}.`)
      window.setTimeout(() => { setToast(null) }, 4000)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={css.lensWrap}>
      <button
        type="button"
        className={css.lensButton}
        aria-label="Email a report"
        title="Email a report"
        onClick={() => { setOpen(true) }}
      >
        <Mail size={18} strokeWidth={1.7} aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className={css.mailBackdrop} onClick={() => { if (!busy) setOpen(false) }} />
          <div className={css.mailDialog} role="dialog" aria-label="Email a report">
            <h2 className={css.mailTitle}>Email a report</h2>
            <label className={css.mailField}>
              <span>To</span>
              <input
                type="email"
                className={css.mailInput}
                value={to}
                placeholder="name@example.com"
                autoFocus
                onChange={event => { setTo(event.target.value) }}
              />
            </label>
            <label className={css.mailField}>
              <span>Subject</span>
              <input
                type="text"
                className={css.mailInput}
                value={subject}
                placeholder="Financial report"
                onChange={event => { setSubject(event.target.value) }}
              />
            </label>
            <label className={css.mailField}>
              <span>Report to attach</span>
              <select
                className={css.mailInput}
                value={reportType}
                onChange={event => { setReportType(event.target.value as MailReport) }}
              >
                {REPORTS.map(report => (
                  <option key={report.value} value={report.value}>{report.label}</option>
                ))}
              </select>
            </label>
            <label className={css.mailField}>
              <span>Message</span>
              <textarea
                className={css.mailInput}
                rows={4}
                value={text}
                placeholder="Please find the report attached."
                onChange={event => { setText(event.target.value) }}
              />
            </label>
            {error !== null && <p className={css.mailError}>{error}</p>}
            {gmail !== null && !gmail.connected && (
              <a
                className={css.mailConnect}
                href={`${CORE_URL}/api/email/connect`}
                target="_blank"
                rel="noreferrer"
              >
                Connect Google Account for Email
              </a>
            )}
            {gmail?.connected === true && (
              <p className={css.mailConnected}>✅ Gmail Connected as {gmail.email}</p>
            )}
            <div className={css.mailActions}>
              <button
                type="button"
                className={css.mailCancel}
                disabled={busy}
                onClick={() => { setOpen(false) }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={css.primary}
                disabled={busy || gmail?.connected === false || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || subject.trim() === ''}
                onClick={() => { void submit() }}
              >
                {busy ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </>
      )}

      {toast !== null && <div className={css.mailToast}>{toast}</div>}
    </div>
  )
}
