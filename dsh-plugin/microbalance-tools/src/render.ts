/**
 * Rendering helpers shared by every MicroBalance tool.
 *
 * DSH marks a failed call by throwing, but this plugin's contract is to never
 * throw from `execute`. Instead it returns `{ isError: true, error, code }`
 * and renders that value as an unmistakable `ERROR [CODE]: ...` line, so the
 * model treats the call as rejected and can self-correct.
 */

import type { CoreError, JsonValue } from './types.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Narrow a canonical tool value to the engine's returned error envelope. */
export function isCoreError(value: unknown): value is CoreError {
  return (
    isRecord(value) &&
    value.isError === true &&
    typeof value.error === 'string' &&
    typeof value.code === 'string'
  )
}

/** Project any canonical value into the single text block a tool returns. */
export function renderJson(value: JsonValue): string {
  if (isCoreError(value)) {
    return `ERROR [${value.code}]: ${value.error}`
  }
  return JSON.stringify(value, null, 2) ?? 'null'
}
