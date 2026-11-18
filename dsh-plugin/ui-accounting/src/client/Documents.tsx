/** Document Centre: upload receipts, OCR them, and create bills. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { CORE_URL, formatNaira } from './core.ts'
import css from './accounting.module.css'

interface LineItem {
  description?: string
  quantity?: number | string
  unitPrice?: number | string
}

interface ExtractedData {
  vendorName?: string
  date?: string
  amount?: number | string
  lineItems?: LineItem[]
}

interface DocumentRecord {
  id: string
  originalName: string
  mimeType: string
  uploadedAt: string
  status: string
  source: string
  extractedData: ExtractedData | null
}

interface DocumentList {
  data: DocumentRecord[]
}

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${CORE_URL}${path}`, {
    credentials: 'include',
    ...init,
  })
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  if (!response.ok) {
    const error = (body as { error?: string } | null)?.error
    throw new Error(error ?? `Request failed (HTTP ${response.status})`)
  }
  return body as T
}

function statusClass(status: string): string {
  if (status === 'FAILED') return `${css.badge ?? ''} ${css.badgeBad ?? ''}`
  return css.badge ?? ''
}

/** Upload zone, OCR pipeline, and bill generation. */
export function DocumentCentrePage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback((): void => {
    setLoading(true)
    callApi<DocumentList>('/api/documents')
      .then((result) => { setDocuments(result.data) })
      .catch((cause: unknown) => { setError(messageOf(cause)) })
      .finally(() => { setLoading(false) })
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  // "Receipt Scanner" in the composer opens the same upload flow.
  useEffect(() => {
    if (window.sessionStorage.getItem('mb:scan') !== '1') return
    window.sessionStorage.removeItem('mb:scan')
    inputRef.current?.click()
  }, [])

  const upload = async (file: File): Promise<void> => {
    if (busy !== null) return
    setBusy(`Uploading ${file.name}`)
    setError(null)
    setNotice(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const created = await callApi<{ documentId: string }>('/api/documents/upload', {
        method: 'POST',
        body: form,
      })
      reload()

      setBusy(`Reading ${file.name} with vision…`)
      const extracted = await callApi<{ extractedData: ExtractedData }>(
        `/api/documents/${created.documentId}/ocr`,
        { method: 'POST' },
      )
      setNotice(
        `Extracted ${extracted.extractedData.vendorName ?? 'document'} · ${formatNaira(
          extracted.extractedData.amount ?? 0,
        )}`,
      )
      reload()
    } catch (cause: unknown) {
      setError(messageOf(cause))
      reload()
    } finally {
      setBusy(null)
    }
  }

  const approve = async (document: DocumentRecord): Promise<void> => {
    if (busy !== null) return
    if (!document.extractedData) {
      setError('Run OCR on this document first.')
      return
    }
    setBusy(`Creating bill for ${document.originalName}`)
    setError(null)
    setNotice(null)
    try {
      const result = await callApi<{
        bill: { billNumber: string; totalAmount: string }
      }>(`/api/documents/${document.id}/extract`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          extractedData: document.extractedData,
          autoCreateBill: true,
        }),
      })
      setNotice(
        `Pending bill ${result.bill.billNumber} created · ${formatNaira(
          result.bill.totalAmount,
        )}. Approve the journal in Journal Approvals.`,
      )
      reload()
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) void upload(file)
  }

  const rows = documents

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div>
          <h1 className={css.title}>Document Centre</h1>
          <p className={css.subtitle}>
            Upload a receipt or supplier invoice. Vision reads it, then one click turns it into a bill.
          </p>
        </div>
        <div className={css.lineActions}>
          <button type="button" className={css.button} onClick={reload} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            className={`${css.button} ${css.primary}`}
            onClick={() => { inputRef.current?.click() }}
            disabled={busy !== null}
          >
            Upload Document
          </button>
        </div>
      </header>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void upload(file)
        }}
      />

      {notice !== null && <div className={css.notice}>{notice}</div>}
      {error !== null && <div className={css.error}>{error}</div>}
      {busy !== null && <div className={css.notice}>{busy}</div>}

      <div
        className={`${css.card} ${dragging ? css.dropActive : css.dropZone}`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => { setDragging(false) }}
        onDrop={onDrop}
        onClick={() => { if (busy === null) inputRef.current?.click() }}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click()
        }}
      >
        <div className={css.dropTitle}>Drop a receipt here</div>
        <div className={css.dropHint}>PNG, JPG, WEBP or PDF · up to 10 MB</div>
      </div>

      <div className={css.card}>
        {rows.length === 0 ? (
          <div className={css.empty}>
            {loading ? 'Loading documents…' : 'No documents yet. Upload your first receipt.'}
          </div>
        ) : (
          <table className={css.table}>
            <thead>
              <tr>
                <th>Filename</th>
                <th>Source</th>
                <th>Date</th>
                <th>Vendor</th>
                <th className={css.num}>Total Amount</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(document => (
                <tr key={document.id}>
                  <td>{document.originalName}</td>
                  <td>{document.source}</td>
                  <td>
                    {document.extractedData?.date ??
                      new Date(document.uploadedAt).toISOString().slice(0, 10)}
                  </td>
                  <td>{document.extractedData?.vendorName ?? '—'}</td>
                  <td className={css.num}>{formatNaira(document.extractedData?.amount ?? 0)}</td>
                  <td>
                    <span className={statusClass(document.status)}>{document.status}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`${css.button} ${css.primary}`}
                      disabled={busy !== null || document.status !== 'PROCESSED'}
                      onClick={() => { void approve(document) }}
                    >
                      Approve &amp; Create Bill
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
