import { randomUUID } from 'node:crypto';
import Fastify, {
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';

const MODEL_ID = 'mock-gpt-4';
const PORT = Number(process.env.PORT ?? 4000);

interface ChatMessage {
  role?: string;
  content?: unknown;
}

interface ChatCompletionBody {
  model?: string;
  messages?: ChatMessage[];
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
}

interface AnthropicBody {
  model?: string;
  system?: unknown;
  messages?: ChatMessage[];
  max_tokens?: number;
  stream?: boolean;
}

interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

const ANTHROPIC_REPLY = 'This is a mock Anthropic response.';

const estimateTokens = (text: string): number =>
  Math.max(1, Math.ceil(text.length / 4));

/** Normalize string or OpenAI content-part arrays to plain text. */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          const text = (part as { text?: unknown }).text;
          if (typeof text === 'string') return text;
        }
        return '';
      })
      .filter(Boolean)
      .join(' ');
  }

  return '';
}

function lastUserText(messages: ChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'user') return textOf(message.content).trim();
  }
  return '';
}

function mockReply(prompt: string): string {
  const clipped = prompt.replace(/\s+/g, ' ').slice(0, 200);
  return clipped
    ? `This is a mock response from ${MODEL_ID}. You said: "${clipped}"`
    : `This is a mock response from ${MODEL_ID}.`;
}

function openAiError(message: string, type = 'invalid_request_error') {
  return { error: { message, type, code: null, param: null } };
}

function anthropicError(message: string, type = 'invalid_request_error') {
  return { type: 'error', error: { type, message } };
}

function streamCompletion(
  reply: FastifyReply,
  options: {
    id: string;
    created: number;
    model: string;
    text: string;
    usage: Usage;
    includeUsage: boolean;
  },
): void {
  const { id, created, model, text, usage, includeUsage } = options;

  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (payload: unknown): void => {
    reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  send({
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [
      { index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null },
    ],
  });

  send({
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [
      { index: 0, delta: { content: text }, finish_reason: null },
    ],
  });

  send({
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  });

  if (includeUsage) {
    send({
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [],
      usage,
    });
  }

  reply.raw.end('data: [DONE]\n\n');
}

function streamAnthropicMessage(
  reply: FastifyReply,
  options: {
    id: string;
    model: string;
    text: string;
    inputTokens: number;
    outputTokens: number;
  },
): void {
  const { id, model, text, inputTokens, outputTokens } = options;

  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event: string, payload: unknown): void => {
    reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  send('message_start', {
    type: 'message_start',
    message: {
      id,
      type: 'message',
      role: 'assistant',
      content: [],
      model,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: inputTokens, output_tokens: 0 },
    },
  });

  send('content_block_start', {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  });

  send('content_block_delta', {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text },
  });

  send('content_block_stop', {
    type: 'content_block_stop',
    index: 0,
  });

  send('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: outputTokens },
  });

  send('message_stop', { type: 'message_stop' });
  reply.raw.end();
}

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

const listModels = async () => ({
  object: 'list',
  data: [{ id: MODEL_ID, object: 'model' }],
});

app.get('/v1/models', listModels);
app.get('/models', listModels);

const createCompletion = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
    const body = (request.body ?? {}) as ChatCompletionBody;

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return reply
        .code(400)
        .send(openAiError('messages must be a non-empty array'));
    }

    const model =
      typeof body.model === 'string' && body.model.length > 0
        ? body.model
        : MODEL_ID;

    const promptText = body.messages.map((message) => textOf(message.content)).join('\n');
    const text = mockReply(lastUserText(body.messages));
    const promptTokens = estimateTokens(promptText);
    const completionTokens = estimateTokens(text);

    const usage: Usage = {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    };

    const id = `chatcmpl-${randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);

    if (body.stream === true) {
      streamCompletion(reply, {
        id,
        created,
        model,
        text,
        usage,
        includeUsage: body.stream_options?.include_usage === true,
      });
      return;
    }

    return {
      id,
      object: 'chat.completion',
      created,
      model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: text },
          finish_reason: 'stop',
        },
      ],
      usage,
    };
};

app.post('/v1/chat/completions', createCompletion);
app.post('/chat/completions', createCompletion);

const createAnthropicMessage = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const body = (request.body ?? {}) as AnthropicBody;

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return reply
      .code(400)
      .send(anthropicError('messages must be a non-empty array'));
  }

  const model =
    typeof body.model === 'string' && body.model.length > 0
      ? body.model
      : MODEL_ID;

  const promptText = [textOf(body.system), ...body.messages.map((message) => textOf(message.content))]
    .filter(Boolean)
    .join('\n');

  const inputTokens = estimateTokens(promptText);
  const outputTokens = estimateTokens(ANTHROPIC_REPLY);
  const id = `msg_${randomUUID()}`;

  if (body.stream === true) {
    streamAnthropicMessage(reply, {
      id,
      model,
      text: ANTHROPIC_REPLY,
      inputTokens,
      outputTokens,
    });
    return;
  }

  return {
    id,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: ANTHROPIC_REPLY }],
    model,
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
};

app.post('/v1/messages', createAnthropicMessage);
app.post('/messages', createAnthropicMessage);

app.setErrorHandler((error, request, reply) => {
  const err = error as { statusCode?: number; message?: string };
  const status =
    typeof err.statusCode === 'number' && err.statusCode >= 400
      ? err.statusCode
      : 500;
  const message = err.message ?? 'internal error';
  request.log.error({ err: message }, 'request failed');
  return reply.code(status).send(openAiError(message, 'server_error'));
});

app
  .listen({ port: PORT, host: '0.0.0.0' })
  .then(() => {
    console.log(`mock-ai listening on http://127.0.0.1:${PORT}`);
    console.log(`  GET  http://127.0.0.1:${PORT}/v1/models`);
    console.log(`  POST http://127.0.0.1:${PORT}/v1/chat/completions`);
    console.log(`  POST http://127.0.0.1:${PORT}/v1/messages`);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
