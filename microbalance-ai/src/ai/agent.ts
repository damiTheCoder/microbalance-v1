import 'dotenv/config';
import {
  GoogleGenerativeAI,
  type Content,
  type EnhancedGenerateContentResponse,
  type Part,
} from '@google/generative-ai';
import { truncate } from '../core/client.js';
import { executeTool, geminiFunctionDeclarations } from './tools.js';

const MAX_TOOL_ROUNDS = 6;
const MAX_HISTORY_ENTRIES = 6;
const MAX_OUTPUT_TOKENS = 500;

const SYSTEM_PROMPT = `You are MicroBalance, an AI accountant for SMEs. You do not write code — only call tools.

Rules:
1. Call get_trial_balance first — never invent account IDs.
2. Use propose_journal_entry for manual entries. On error, fix and retry.
3. Use create_invoice/create_bill for documents.
4. Only call approve_journal on explicit 'post'/'finalize'.
5. Reply concisely.

Currency: Naira (₦). Format ₦X,XXX.XX. Never use $.`;

export interface ToolCallRecord {
  name: string;
  summary: string;
}

export interface AgentResult {
  reply: string;
  toolCalls: ToolCallRecord[];
  history: Content[];
}

/** One-line, token-frugal description of a tool result. */
export function summarize(value: unknown): string {
  if (value === null || value === undefined) return 'empty';
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.error === 'string') {
      return truncate(`error: ${record.error}`, 120);
    }
    if (Array.isArray(value)) return `${value.length} items`;
    const keys = Object.keys(record).slice(0, 4);
    return keys.length > 0 ? keys.join(', ') : 'object';
  }
  return truncate(String(value), 120);
}

/**
 * Keep the newest entries, then advance to a valid history start: a user turn
 * that is not a bare function response. Gemini rejects orphan responses.
 */
export function trimHistory(history: Content[]): Content[] {
  let start = Math.max(0, history.length - MAX_HISTORY_ENTRIES);
  const isValidStart = (content: Content): boolean =>
    content.role === 'user' &&
    !content.parts.some((part) => 'functionResponse' in part);

  while (start < history.length && !isValidStart(history[start]!)) {
    start += 1;
  }

  return history.slice(start);
}

function toFunctionResponse(output: unknown): Record<string, unknown> {
  if (output !== null && typeof output === 'object' && !Array.isArray(output)) {
    return output as Record<string, unknown>;
  }
  return { result: output ?? null };
}

function extractText(response: EnhancedGenerateContentResponse): string {
  try {
    return response.text().trim();
  } catch {
    return 'No text response.';
  }
}

export async function runAgent(
  message: string,
  history: Content[] = [],
): Promise<AgentResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'PASTE_YOUR_KEY_HERE') {
    return {
      reply: 'GEMINI_API_KEY is not configured.',
      toolCalls: [],
      history,
    };
  }

  const toolCalls: ToolCallRecord[] = [];

  try {
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash-lite',
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ functionDeclarations: geminiFunctionDeclarations() }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    });

    const chat = model.startChat({ history: trimHistory(history) });
    let result = await chat.sendMessage(message);

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const calls = result.response.functionCalls();
      if (!calls || calls.length === 0) break;

      const responses: Part[] = [];
      for (const call of calls) {
        const output = await executeTool(call.name, call.args);
        toolCalls.push({ name: call.name, summary: summarize(output) });
        responses.push({
          functionResponse: {
            name: call.name,
            response: toFunctionResponse(output),
          },
        });
      }

      result = await chat.sendMessage(responses);
    }

    const updated = await chat.getHistory();

    if (result.response.functionCalls()?.length) {
      return {
        reply: 'Stopped after 6 tool rounds.',
        toolCalls,
        history: trimHistory(updated),
      };
    }

    return {
      reply: extractText(result.response),
      toolCalls,
      history: trimHistory(updated),
    };
  } catch (error) {
    const detail = truncate(
      error instanceof Error ? error.message : String(error),
    );
    return {
      reply: `Error: ${detail}`,
      toolCalls,
      history: trimHistory(history),
    };
  }
}
