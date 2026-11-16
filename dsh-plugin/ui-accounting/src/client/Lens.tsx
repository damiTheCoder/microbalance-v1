/** Composer lens: scan a receipt into a bill, or attach a document. */
import { useRef, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { CORE_URL, formatNaira } from './core.ts'
import css from './accounting.module.css'

interface ExtractedReceipt {
  vendorName?: string
  amount?: number | string
}

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

async function uploadDocument(file: File, source: 'OCR' | 'MANUAL'): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(`${CORE_URL}/api/documents/upload?source=${source}`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  })
  const body = (await response.json()) as { documentId?: string; error?: string }
  if (!response.ok || !body.documentId) throw new Error(body.error ?? 'Upload failed')
  return body.documentId
}

async function extractDocument(documentId: string): Promise<ExtractedReceipt> {
  const response = await fetch(`${CORE_URL}/api/documents/${documentId}/ocr`, {
    method: 'POST',
    credentials: 'include',
  })
  const body = (await response.json()) as { extractedData?: ExtractedReceipt; error?: string }
  if (!response.ok || !body.extractedData) throw new Error(body.error ?? 'Could not read receipt')
  return body.extractedData
}

/** Dual-action lens button rendered beside the composer controls. */
export function LensButton({ inputActions }: PropsRuntime<'conversation.input.right'>) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const scanInput = useRef<HTMLInputElement>(null)
  const manualInput = useRef<HTMLInputElement>(null)

  const scan = async (file: File): Promise<void> => {
    setOpen(false)
    setBusy('Scanning receipt…')
    try {
      const documentId = await uploadDocument(file, 'OCR')
      const extracted = await extractDocument(documentId)
      const amount = Number(extracted.amount ?? 0)
      inputActions.setDraft(
        `I scanned a receipt from ${extracted.vendorName ?? 'a vendor'} for ${formatNaira(amount)}. Please create a bill.`,
      )
      window.setTimeout(() => { inputActions.submit() }, 80)
    } catch (cause) {
      inputActions.setDraft(`Receipt scan failed: ${messageOf(cause)}`)
    } finally {
      setBusy(null)
    }
  }

  const attach = async (file: File): Promise<void> => {
    setOpen(false)
    setBusy('Attaching…')
    try {
      await uploadDocument(file, 'MANUAL')
      inputActions.setDraft(`📎 Attached: ${file.name}`)
    } catch (cause) {
      inputActions.setDraft(`Attachment failed: ${messageOf(cause)}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={css.lensWrap}>
      <button
        type="button"
        className={css.lensButton}
        aria-label="Document lens"
        title={busy ?? 'Scan a receipt or attach a document'}
        disabled={busy !== null}
        onClick={() => { setOpen(value => !value) }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 8V4h4M17 4h4v4M21 16v4h-4M7 20H3v-4" />
          <circle cx="12" cy="12" r="3.2" />
        </svg>
      </button>

      {open && (
        <>
          <div className={css.lensBackdrop} onClick={() => { setOpen(false) }} />
          <div className={css.lensMenu} role="menu">
            <button type="button" role="menuitem" onClick={() => { scanInput.current?.click() }}>
              <strong>Scan Receipt (Auto-Bill)</strong>
              <span>Read a receipt and create a bill</span>
            </button>
            <button type="button" role="menuitem" onClick={() => { manualInput.current?.click() }}>
              <strong>Upload Document</strong>
              <span>Attach without reading it</span>
            </button>
          </div>
        </>
      )}

      <input
        ref={scanInput}
        type="file"
        accept="image/*,application/pdf"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void scan(file)
        }}
      />
      <input
        ref={manualInput}
        type="file"
        accept="image/*,application/pdf"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void attach(file)
        }}
      />
    </div>
  )
}
