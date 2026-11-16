/** Business profile settings: identity, currency, and statutory rates. */
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  loadBusinessProfile,
  updateBusinessProfile,
  type BusinessProfile,
} from './core.ts'
import css from './accounting.module.css'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/** Editable singleton business profile. */
export function BusinessProfilePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<BusinessProfile | null>(null)

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [currency, setCurrency] = useState('NGN')
  const [fiscalYearStart, setFiscalYearStart] = useState('January')
  const [vatRate, setVatRate] = useState('7.5')
  const [whtRateCompany, setWhtRateCompany] = useState('10')
  const [whtRateIndividual, setWhtRateIndividual] = useState('5')

  const apply = (next: BusinessProfile | null): void => {
    setProfile(next)
    if (next === null) return
    setName(next.name)
    setAddress(next.address)
    setPhone(next.phone)
    setEmail(next.email)
    setCurrency(next.currency)
    setFiscalYearStart(next.fiscalYearStart)
    setVatRate(next.vatRate)
    setWhtRateCompany(next.whtRateCompany)
    setWhtRateIndividual(next.whtRateIndividual)
  }

  const reload = useCallback((): void => {
    setLoading(true)
    setError(null)
    loadBusinessProfile()
      .then(apply)
      .catch((cause: unknown) => { setError(messageOf(cause)) })
      .finally(() => { setLoading(false) })
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const saved = await updateBusinessProfile({
        name: name.trim(),
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim(),
        currency,
        fiscalYearStart,
        vatRate: vatRate.trim(),
        whtRateCompany: whtRateCompany.trim(),
        whtRateIndividual: whtRateIndividual.trim(),
      })
      apply(saved)
      setNotice('Business profile updated.')
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Business Profile</h1>
          <p className={css.subtitle}>
            Identity and statutory defaults used across the ledger.
            {profile === null && !loading && ' No profile saved yet.'}
          </p>
        </div>
        <button type="button" className={css.button} onClick={reload} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {notice !== null && <div className={css.notice}>{notice}</div>}
      {error !== null && <div className={css.error}>{error}</div>}

      {profile !== null && (
        <div className={css.card}>
          <div className={css.driveRow}>
            <div className={css.field}>
              <span className={css.label}>Google Drive backup</span>
              <span className={css.driveStatus}>
                {profile.driveConnected ? 'Connected ✅' : 'Not connected'}
              </span>
            </div>
            <div className={css.field}>
              <span className={css.label}>Backup schedule</span>
              <span className={css.driveStatus}>
                {profile.driveSyncSchedule === 'MANUAL'
                  ? 'Manual'
                  : profile.driveSyncSchedule === 'WEEKLY' ? 'Weekly' : 'Monthly'}
              </span>
            </div>
            <span className={css.subtitle}>
              Manage the connection and run a backup from Documents → Document Centre.
            </span>
          </div>
        </div>
      )}

      <form className={css.form} onSubmit={(event) => { void submit(event) }}>
        <div className={css.formRow}>
          <label className={`${css.field} ${css.grow}`}>
            <span className={css.label}>Business name</span>
            <input
              className={css.input}
              value={name}
              onChange={(event) => { setName(event.target.value) }}
              placeholder="e.g. MicroBalance Ltd"
            />
          </label>
          <label className={`${css.field} ${css.grow}`}>
            <span className={css.label}>Email</span>
            <input
              className={css.input}
              type="email"
              value={email}
              onChange={(event) => { setEmail(event.target.value) }}
              placeholder="hello@example.com"
            />
          </label>
        </div>

        <label className={css.field}>
          <span className={css.label}>Address</span>
          <input
            className={css.input}
            value={address}
            onChange={(event) => { setAddress(event.target.value) }}
            placeholder="12 Lagos Street, Lagos"
          />
        </label>

        <div className={css.formRow}>
          <label className={`${css.field} ${css.grow}`}>
            <span className={css.label}>Phone</span>
            <input
              className={css.input}
              value={phone}
              onChange={(event) => { setPhone(event.target.value) }}
              placeholder="+234 …"
            />
          </label>
          <label className={`${css.field} ${css.grow}`}>
            <span className={css.label}>Currency</span>
            <select
              className={css.select}
              value={currency}
              onChange={(event) => { setCurrency(event.target.value) }}
            >
              <option value="NGN">NGN — Naira (₦)</option>
              <option value="USD">USD — US Dollar ($)</option>
              <option value="GBP">GBP — Pound (£)</option>
            </select>
          </label>
          <label className={`${css.field} ${css.grow}`}>
            <span className={css.label}>Fiscal year starts</span>
            <select
              className={css.select}
              value={fiscalYearStart}
              onChange={(event) => { setFiscalYearStart(event.target.value) }}
            >
              {MONTHS.map(month => (
                <option key={month} value={month}>{month}</option>
              ))}
            </select>
          </label>
        </div>

        <div className={css.formRow}>
          <label className={`${css.field} ${css.grow}`}>
            <span className={css.label}>VAT rate (%)</span>
            <input
              className={css.input}
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={vatRate}
              onChange={(event) => { setVatRate(event.target.value) }}
            />
          </label>
          <label className={`${css.field} ${css.grow}`}>
            <span className={css.label}>WHT rate — company (%)</span>
            <input
              className={css.input}
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={whtRateCompany}
              onChange={(event) => { setWhtRateCompany(event.target.value) }}
            />
          </label>
          <label className={`${css.field} ${css.grow}`}>
            <span className={css.label}>WHT rate — individual (%)</span>
            <input
              className={css.input}
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={whtRateIndividual}
              onChange={(event) => { setWhtRateIndividual(event.target.value) }}
            />
          </label>
        </div>

        <div className={css.modalActions}>
          <button
            type="submit"
            className={`${css.button} ${css.primary}`}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </div>
  )
}
