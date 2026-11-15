/**
 * Thin, no-throw HTTP client for the MicroBalance core engine.
 *
 * The engine answers `POST /api/ai-intent` with `{ action, data }` on success
 * and `{ error, code }` on a business failure. This client converts every
 * failure (HTTP 4xx/5xx, timeout, unreachable host, malformed body) into a
 * `CoreError` value so a tool body never throws and the model can read the
 * message and correct itself.
 */

import type { CoreError, JournalEntry, JsonValue } from './types.ts'

/** Core engine base URL used when no environment override is present. */
export const DEFAULT_CORE_API_URL = 'http://localhost:3001'

/** Cooperative HTTP budget for one engine call. */
export const CORE_TIMEOUT_MS = 30_000

/** Read the configured base URL, tolerating a trailing slash. */
export function coreApiUrl(): string {
  const configured =
    process.env.MICROBALANCE_CORE_URL ??
    process.env.CORE_API_URL ??
    DEFAULT_CORE_API_URL
  return configured.replace(/\/+$/, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function failure(error: string, code: string): CoreError {
  return { isError: true, error, code }
}

function isTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  )
}

/**
 * POST a JSON body to one core endpoint and unwrap the `data` envelope.
 *
 * @param path - endpoint path, beginning with `/`.
 * @param body - lossless JSON request body.
 * @returns the response data, or a `CoreError` describing the failure.
 */
async function request<T extends JsonValue>(
  path: string,
  body: JsonValue,
): Promise<T | CoreError> {
  let response: Response

  try {
    response = await fetch(`${coreApiUrl()}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CORE_TIMEOUT_MS),
    })
  } catch (error) {
    if (isTimeout(error)) {
      return failure(
        `Core engine timed out after ${CORE_TIMEOUT_MS}ms`,
        'TIMEOUT',
      )
    }
    return failure(
      `Core engine unreachable at ${coreApiUrl()}`,
      'NETWORK',
    )
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return failure(
      `Core engine returned a non-JSON response (HTTP ${response.status})`,
      'CORE_ERROR',
    )
  }

  if (!response.ok) {
    const record = isRecord(payload) ? payload : {}
    const message =
      typeof record.error === 'string'
        ? record.error
        : `Core engine returned HTTP ${response.status}`
    const code =
      typeof record.code === 'string'
        ? record.code
        : `HTTP_${response.status}`
    return failure(message, code)
  }

  if (!isRecord(payload) || !Object.hasOwn(payload, 'data')) {
    return failure(
      'Core engine returned an unexpected response envelope',
      'CORE_ERROR',
    )
  }

  const data = payload.data
  if (data === undefined) {
    return failure('Core engine returned an empty response', 'CORE_ERROR')
  }

  return data as T
}

/**
 * Invoke one engine intent.
 *
 * @param action - engine intent name, e.g. `GET_TRIAL_BALANCE`.
 * @param payload - action payload; `{}` for parameterless intents.
 * @returns the intent data, or a `CoreError`.
 */
export async function callCore<T extends JsonValue>(
  action: string,
  payload: JsonValue = {},
): Promise<T | CoreError> {
  return request<T>('/api/ai-intent', { action, payload })
}

/**
 * Post a pending journal entry to the ledger.
 *
 * @param journalId - journal entry id returned by `PROPOSE_JOURNAL`.
 * @returns the posted entry, or a `CoreError`.
 */
export async function approveJournal(
  journalId: string,
): Promise<JournalEntry | CoreError> {
  return request<JournalEntry>(
    `/api/journals/${encodeURIComponent(journalId)}/approve`,
    {},
  )
}
