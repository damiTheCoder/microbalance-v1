import 'dotenv/config';
import axios from 'axios';

export const CORE_API_URL = process.env.CORE_API_URL ?? 'http://localhost:3001';

export interface CoreFailure {
  error: string;
  code: string;
}

const MAX_ERROR_CHARS = 200;

/** Cap any message so tool results stay inside the token budget. */
export function truncate(text: string, max = MAX_ERROR_CHARS): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function toFailure(status: number, body: unknown): CoreFailure {
  const data = body as Record<string, unknown> | undefined;
  const message =
    typeof data?.error === 'string' ? data.error : `core returned HTTP ${status}`;
  const code =
    typeof data?.code === 'string' ? data.code : `HTTP_${status}`;
  return { error: truncate(message), code: truncate(code, 40) };
}

/**
 * Call a core engine intent.
 *
 * Business errors (4xx) come back as `{ error, code }` instead of throwing so
 * the model can read the failure and correct itself.
 */
export async function callCore(
  action: string,
  payload: unknown = {},
): Promise<unknown> {
  try {
    const response = await axios.post(
      `${CORE_API_URL}/api/ai-intent`,
      { action, payload },
      { timeout: 30_000, validateStatus: () => true },
    );

    if (response.status >= 400) {
      return toFailure(response.status, response.data);
    }

    return (response.data as { data?: unknown } | undefined)?.data;
  } catch {
    return { error: 'core unreachable', code: 'NETWORK' };
  }
}

/** Approve (post) a pending journal entry. */
export async function approveJournal(journalId: string): Promise<unknown> {
  try {
    const response = await axios.post(
      `${CORE_API_URL}/api/journals/${encodeURIComponent(journalId)}/approve`,
      {},
      { timeout: 30_000, validateStatus: () => true },
    );

    if (response.status >= 400) {
      return toFailure(response.status, response.data);
    }

    return (response.data as { data?: unknown } | undefined)?.data;
  } catch {
    return { error: 'core unreachable', code: 'NETWORK' };
  }
}
