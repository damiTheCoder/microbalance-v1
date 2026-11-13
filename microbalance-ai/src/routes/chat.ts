import type { FastifyInstance } from 'fastify';
import type { Content } from '@google/generative-ai';
import { z } from 'zod';
import { runAgent, trimHistory } from '../ai/agent.js';

const sessions = new Map<string, Content[]>();

const chatBody = z.object({
  message: z.string().min(1),
  sessionId: z.string().min(1),
});

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'microbalance-ai',
  }));

  app.post('/api/chat', async (request) => {
    const { message, sessionId } = chatBody.parse(request.body);

    const history = sessions.get(sessionId) ?? [];
    const result = await runAgent(message, history);

    for (const call of result.toolCalls) {
      request.log.info(
        { tool: call.name, summary: call.summary },
        'tool',
      );
    }

    sessions.set(sessionId, trimHistory(result.history));

    return { reply: result.reply };
  });
}
